const { query } = require('../config/db');
const { ensureLocationSku } = require('./locationSkuModel');

/**
 * Returns stock per location for one product.
 */
const getStockByProduct = async (productId) => {
  const result = await query(
    `SELECT ps.location_id, l.name AS location_name, l.code AS location_code,
            ps.location_sku, COALESCE(ps.location_sku, p.sku) AS sku,
            ps.quantity, ps.last_updated
     FROM invex.product_stock ps
     JOIN invex.locations l ON ps.location_id = l.id
     JOIN invex.products p ON p.id = ps.product_id
     WHERE ps.product_id = $1 AND l.is_deleted = FALSE
     ORDER BY l.name`,
    [productId]
  );
  return result.rows;
};

/**
 * Returns all products at a location.
 */
const getStockByLocation = async (locationId) => {
  const result = await query(
    `SELECT ps.product_id, p.name AS product_name,
            COALESCE(ps.location_sku, p.sku) AS sku,
            ps.location_sku,
            ps.quantity, ps.last_updated
     FROM invex.product_stock ps
     JOIN invex.products p ON ps.product_id = p.id
     WHERE ps.location_id = $1 AND p.is_deleted = FALSE
     ORDER BY p.name`,
    [locationId]
  );
  return result.rows;
};

/**
 * Atomically adds to product_stock.
 * Creates the record if it doesn't exist.
 */
const incrementStock = async (productId, locationId, qty, dbClient) => {
  // If no transaction client provided, use default query pool
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;
  const locationSku = Number(qty) > 0
    ? await ensureLocationSku(productId, locationId, dbClient)
    : null;
  
  const result = await executeQuery(
    `INSERT INTO invex.product_stock (product_id, location_id, quantity, location_sku)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, location_id)
     DO UPDATE SET quantity = invex.product_stock.quantity + EXCLUDED.quantity,
                   location_sku = COALESCE(invex.product_stock.location_sku, EXCLUDED.location_sku),
                   last_updated = CURRENT_TIMESTAMP
     RETURNING quantity, location_sku`,
    [productId, locationId, qty, locationSku]
  );
  return result.rows[0];
};

/**
 * Atomically subtracts from product_stock.
 * Throws error if not enough stock.
 */
const decrementStock = async (productId, locationId, qty, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;
  await ensureLocationSku(productId, locationId, dbClient);
  
  const result = await executeQuery(
    `UPDATE invex.product_stock
     SET quantity = quantity - $3,
         last_updated = CURRENT_TIMESTAMP
     WHERE product_id = $1 AND location_id = $2
       AND quantity >= $3
     RETURNING quantity, location_sku`,
    [productId, locationId, qty]
  );

  if (result.rowCount === 0) {
    const currentResult = await executeQuery(
      `SELECT COALESCE(quantity, 0) AS quantity
       FROM invex.product_stock
       WHERE product_id = $1 AND location_id = $2`,
      [productId, locationId]
    );
    const available = Number(currentResult.rows[0]?.quantity || 0);
    throw new Error(`Insufficient stock for product ID ${productId} at location ID ${locationId}. Available: ${available}`);
  }

  return result.rows[0];
};

/**
 * Pick the (location_id, quantity) row currently holding the most stock for
 * a product. Used when a caller needs *some* default location to operate on.
 */
const getPrimaryLocationStock = async (productId, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;
  const result = await executeQuery(
    `SELECT location_id, quantity
       FROM invex.product_stock
      WHERE product_id = $1
      ORDER BY quantity DESC, location_id ASC
      LIMIT 1`,
    [productId]
  );
  return result.rows[0] || null;
};

/**
 * Read the current quantity for a product at a location, without locking.
 */
const getQuantityAt = async (productId, locationId, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;
  const result = await executeQuery(
    `SELECT quantity FROM invex.product_stock
      WHERE product_id = $1 AND location_id = $2`,
    [productId, locationId]
  );
  return Number(result.rows[0]?.quantity || 0);
};

/**
 * Lock and read the current quantity for a product at a location. Caller
 * must already be inside a transaction.
 */
const lockQuantityAt = async (client, productId, locationId) => {
  const result = await client.query(
    `SELECT quantity FROM invex.product_stock
      WHERE product_id = $1 AND location_id = $2
      FOR UPDATE`,
    [productId, locationId]
  );
  return Number(result.rows[0]?.quantity || 0);
};

module.exports = {
  getStockByProduct,
  getStockByLocation,
  incrementStock,
  decrementStock,
  ensureLocationSku,
  getPrimaryLocationStock,
  getQuantityAt,
  lockQuantityAt,
};
