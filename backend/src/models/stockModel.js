const { query } = require('../config/db');

/**
 * Returns stock per location for one product.
 */
const getStockByProduct = async (productId) => {
  const result = await query(
    `SELECT ps.location_id, l.name AS location_name, l.code AS location_code,
            ps.quantity, ps.last_updated
     FROM product_stock ps
     JOIN locations l ON ps.location_id = l.id
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
    `SELECT ps.product_id, p.name AS product_name, p.sku,
            ps.quantity, ps.last_updated
     FROM product_stock ps
     JOIN products p ON ps.product_id = p.id
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
  
  const result = await executeQuery(
    `INSERT INTO product_stock (product_id, location_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id, location_id)
     DO UPDATE SET quantity = product_stock.quantity + EXCLUDED.quantity,
                   last_updated = CURRENT_TIMESTAMP
     RETURNING quantity`,
    [productId, locationId, qty]
  );
  return result.rows[0];
};

/**
 * Atomically subtracts from product_stock.
 * Throws error if not enough stock.
 */
const decrementStock = async (productId, locationId, qty, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;
  
  const result = await executeQuery(
    `UPDATE product_stock
     SET quantity = quantity - $3,
         last_updated = CURRENT_TIMESTAMP
     WHERE product_id = $1 AND location_id = $2
     RETURNING quantity`,
    [productId, locationId, qty]
  );

  if (result.rowCount === 0) {
    throw new Error('Stock record not found for this product and location.');
  }

  return result.rows[0];
};

module.exports = {
  getStockByProduct,
  getStockByLocation,
  incrementStock,
  decrementStock,
};
