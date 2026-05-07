const { query } = require('../config/db');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (char) => `\\${char}`);

const getExecuteQuery = (dbClient) => (dbClient ? dbClient.query.bind(dbClient) : query);

const getLocation = async (locationId, dbClient) => {
  const executeQuery = getExecuteQuery(dbClient);
  const result = await executeQuery(
    `SELECT id, code
     FROM invex.locations
     WHERE id = $1 AND is_deleted = FALSE`,
    [locationId]
  );
  return result.rows[0] || null;
};

const getNextSkuForLocation = async (locationId, dbClient) => {
  const executeQuery = getExecuteQuery(dbClient);
  const location = await getLocation(locationId, dbClient);
  if (!location) return null;

  const prefix = `${location.code}-`;
  const result = await executeQuery(
    `SELECT sku
     FROM invex.products
     WHERE sku LIKE $1 ESCAPE '\\'
     UNION
     SELECT location_sku AS sku
     FROM invex.product_stock
     WHERE location_sku IS NOT NULL
       AND location_sku LIKE $1 ESCAPE '\\'`,
    [`${escapeLike(prefix)}%`]
  );

  const skuPattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);
  const maxNumber = result.rows.reduce((max, row) => {
    const match = String(row.sku || '').match(skuPattern);
    if (!match) return max;
    return Math.max(max, parseInt(match[1], 10));
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(3, '0')}`;
};

const ensureLocationSku = async (productId, locationId, dbClient) => {
  const executeQuery = getExecuteQuery(dbClient);

  const location = await getLocation(locationId, dbClient);
  if (!location) return null;

  if (dbClient) {
    await executeQuery('SELECT pg_advisory_xact_lock($1)', [Number(locationId)]);
  }

  const stockResult = await executeQuery(
    `SELECT ps.location_sku, p.sku AS product_sku
     FROM invex.product_stock ps
     JOIN invex.products p ON p.id = ps.product_id AND p.is_deleted = FALSE
     WHERE ps.product_id = $1 AND ps.location_id = $2
     FOR UPDATE OF ps`,
    [productId, locationId]
  );

  const stock = stockResult.rows[0];
  if (stock?.location_sku) return stock.location_sku;

  const productResult = stock
    ? { rows: [{ sku: stock.product_sku }] }
    : await executeQuery(
        `SELECT sku
         FROM invex.products
         WHERE id = $1 AND is_deleted = FALSE`,
        [productId]
      );

  const product = productResult.rows[0];
  if (!product) return null;

  const prefix = `${location.code}-`;
  const productSku = String(product.sku || '');
  let locationSku = null;

  if (new RegExp(`^${escapeRegExp(prefix)}\\d+$`).test(productSku)) {
    const duplicateResult = await executeQuery(
      `SELECT id
       FROM invex.product_stock
       WHERE location_sku = $1
         AND NOT (product_id = $2 AND location_id = $3)
       LIMIT 1`,
      [productSku, productId, locationId]
    );
    if (duplicateResult.rowCount === 0) {
      locationSku = productSku;
    }
  }

  if (!locationSku) {
    locationSku = await getNextSkuForLocation(locationId, dbClient);
  }

  const result = await executeQuery(
    `INSERT INTO invex.product_stock (product_id, location_id, quantity, location_sku)
     VALUES ($1, $2, 0, $3)
     ON CONFLICT (product_id, location_id)
     DO UPDATE SET location_sku = COALESCE(invex.product_stock.location_sku, EXCLUDED.location_sku),
                   last_updated = CURRENT_TIMESTAMP
     RETURNING location_sku`,
    [productId, locationId, locationSku]
  );

  return result.rows[0]?.location_sku || locationSku;
};

module.exports = {
  getNextSkuForLocation,
  ensureLocationSku,
};
