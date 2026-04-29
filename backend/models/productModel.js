const { query } = require('../src/config/db');

/**
 * Get all active products with optional filters.
 * Joins category and supplier names for display.
 * @param {object} filters - { search, category_id, supplier_id }
 */
const getAllProducts = async ({ search, category_id, supplier_id } = {}) => {
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

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT p.id, p.name, p.sku, p.unit_of_measure, p.unit_price,
            p.reorder_level, p.track_expiry,
            p.category_id, c.name AS category_name,
            p.supplier_id, s.name AS supplier_name,
            p.created_at
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN suppliers  s ON p.supplier_id = s.id
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
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN suppliers  s ON p.supplier_id = s.id
     WHERE p.id = $1 AND p.is_deleted = FALSE`,
    [id]
  );
  return result.rows[0] || null;
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
}) => {
  const result = await query(
    `INSERT INTO products (name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure)
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
    `UPDATE products SET ${fields.join(', ')}
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
    `UPDATE products SET is_deleted = TRUE
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
     FROM product_stock ps
     JOIN locations l ON ps.location_id = l.id
     WHERE ps.product_id = $1 AND l.is_deleted = FALSE
     ORDER BY l.name`,
    [productId]
  );
  return result.rows;
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  softDeleteProduct,
  getProductStock,
};
