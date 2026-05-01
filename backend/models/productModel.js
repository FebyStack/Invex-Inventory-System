const { query } = require('../src/config/db');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Get all active products with optional filters.
 * Joins category and supplier names for display.
 * @param {object} filters - { search, category_id, supplier_id, location_id }
 */
const getAllProducts = async ({ search, category_id, supplier_id, location_id } = {}) => {
  const conditions = ['p.is_deleted = FALSE'];
  const values = [];
  let idx = 1;

  if (search) {
    conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }
  if (category_id) {
    conditions.push(`p.category_id = $${idx++}`);
    values.push(category_id);
  }
  if (supplier_id) {
    conditions.push(`p.supplier_id = $${idx++}`);
    values.push(supplier_id);
  }

  let stockSelect = `COALESCE((
              SELECT SUM(ps.quantity)
              FROM invex.product_stock ps
              WHERE ps.product_id = p.id
            ), 0) AS total_stock`;

  if (location_id) {
    stockSelect = `COALESCE((
              SELECT ps.quantity
              FROM invex.product_stock ps
              WHERE ps.product_id = p.id AND ps.location_id = $${idx++}
            ), 0) AS location_stock`;
    values.push(location_id);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT p.id, p.name, p.sku, p.unit_of_measure, p.unit_price,
            p.reorder_level, p.track_expiry,
            p.category_id, c.name AS category_name,
            p.supplier_id, s.name AS supplier_name,
            ${stockSelect},
            p.created_at
     FROM invex.products p
     LEFT JOIN invex.categories c ON p.category_id = c.id
     LEFT JOIN invex.suppliers  s ON p.supplier_id = s.id
     ${whereClause}
     ORDER BY p.created_at DESC`,
    values
  );
  return result.rows;
};

/**
 * Get a single active product by ID with category and supplier names.
 */
const getProductById = async (id) => {
  const result = await query(
    `SELECT p.id, p.name, p.sku, p.unit_of_measure, p.unit_price,
            p.reorder_level, p.track_expiry,
            p.category_id, c.name AS category_name,
            p.supplier_id, s.name AS supplier_name,
            p.created_at
     FROM invex.products p
     LEFT JOIN invex.categories c ON p.category_id = c.id
     LEFT JOIN invex.suppliers  s ON p.supplier_id = s.id
     WHERE p.id = $1 AND p.is_deleted = FALSE`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Generate the next product SKU for a location code.
 */
const getNextSkuForLocation = async (locationId, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const locationResult = await executeQuery(
    `SELECT id, code
     FROM invex.locations
     WHERE id = $1 AND is_deleted = FALSE`,
    [locationId]
  );

  const location = locationResult.rows[0];
  if (!location) return null;

  const prefix = `${location.code}-`;
  const result = await executeQuery(
    `SELECT sku
     FROM invex.products
     WHERE sku LIKE $1 ESCAPE '\\'`,
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

/**
 * Create a new product.
 * @param {object} data - { name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure }
 */
const createProduct = async ({
  name,
  sku,
  category_id,
  supplier_id,
  unit_price,
  reorder_level,
  track_expiry,
  unit_of_measure,
}, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const result = await executeQuery(
    `INSERT INTO invex.products (name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, created_at`,
    [
      name,
      sku,
      category_id,
      supplier_id,
      unit_price,
      reorder_level ?? 0,
      track_expiry ?? false,
      unit_of_measure ?? 'pcs',
    ]
  );
  return result.rows[0];
};

/**
 * Update an existing active product. Only updates provided fields.
 */
const updateProduct = async (
  id,
  { name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure }
) => {
  const fields = [];
  const values = [];
  let idx = 1;

  const columns = {
    name,
    sku,
    category_id,
    supplier_id,
    unit_price,
    reorder_level,
    track_expiry,
    unit_of_measure,
  };

  for (const [col, val] of Object.entries(columns)) {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    }
  }

  if (fields.length === 0) return null;

  values.push(id);

  const result = await query(
    `UPDATE invex.products SET ${fields.join(', ')}
     WHERE id = $${idx} AND is_deleted = FALSE
     RETURNING id, name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, created_at`,
    values
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete a product by setting is_deleted = TRUE.
 * The deleted_at timestamp is set automatically by the database trigger.
 */
const softDeleteProduct = async (id) => {
  const result = await query(
    `UPDATE invex.products SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Get stock levels per location for a specific product.
 * Stub: returns current data from product_stock table.
 */
const getProductStock = async (productId) => {
  const result = await query(
    `SELECT ps.location_id, l.name AS location_name, l.code AS location_code,
            ps.quantity, ps.last_updated
     FROM invex.product_stock ps
     JOIN invex.locations l ON ps.location_id = l.id
     WHERE ps.product_id = $1 AND l.is_deleted = FALSE
     ORDER BY l.name`,
    [productId]
  );
  return result.rows;
};

module.exports = {
  getAllProducts,
  getProductById,
  getNextSkuForLocation,
  createProduct,
  updateProduct,
  softDeleteProduct,
  getProductStock,
};
