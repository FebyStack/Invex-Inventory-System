const { query } = require('../src/config/db');
const { getNextSkuForLocation } = require('../src/models/locationSkuModel');

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
  if (location_id) {
    // Only return products that are "at" this location (have stock or a location SKU)
    conditions.push(`EXISTS (
      SELECT 1 FROM invex.product_stock ps_filter
      WHERE ps_filter.product_id = p.id 
        AND ps_filter.location_id = $${idx++}
        AND (ps_filter.quantity > 0 OR ps_filter.location_sku IS NOT NULL)
    )`);
    values.push(location_id);
  }

  let stockSelect = `COALESCE((
              SELECT SUM(ps.quantity)
              FROM invex.product_stock ps
              WHERE ps.product_id = p.id
            ), 0) AS total_stock,
            NULL::VARCHAR AS location_sku`;

  if (location_id) {
    stockSelect = `COALESCE((
              SELECT ps.quantity
              FROM invex.product_stock ps
              WHERE ps.product_id = p.id AND ps.location_id = $${idx++}
            ), 0) AS location_stock,
            (
              SELECT ps.location_sku
              FROM invex.product_stock ps
              WHERE ps.product_id = p.id AND ps.location_id = $${idx - 1}
            ) AS location_sku`;
    values.push(location_id);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT p.id, p.name, p.sku, p.unit_of_measure, p.unit_price,
            p.reorder_level, p.track_expiry, p.notes,
            p.category_id, c.name AS category_name,
            p.supplier_id, s.name AS supplier_name,
            ${stockSelect},
            COALESCE(
              (SELECT ps2.location_sku
                 FROM invex.product_stock ps2
                WHERE ps2.product_id = p.id
                  AND ps2.quantity > 0
                  AND ps2.location_sku IS NOT NULL
                ORDER BY ps2.quantity DESC, ps2.location_id ASC
                LIMIT 1),
              p.sku
            ) AS current_sku,
            (SELECT pb.expiry_date
               FROM invex.product_batches pb
              WHERE pb.product_id = p.id
                AND pb.is_deleted = FALSE
              ORDER BY (pb.quantity > 0) DESC, pb.expiry_date ASC
              LIMIT 1) AS earliest_expiry,
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
 * Returns `current_sku` — the location_sku of wherever the product currently
 * holds the most stock — so detail pages can show the SKU users will see in
 * the field, not the immutable base SKU set at creation.
 */
const getProductById = async (id) => {
  const result = await query(
    `SELECT p.id, p.name, p.sku, p.unit_of_measure, p.unit_price,
            p.reorder_level, p.track_expiry, p.notes,
            p.category_id, c.name AS category_name,
            p.supplier_id, s.name AS supplier_name,
            COALESCE((SELECT SUM(ps.quantity) FROM invex.product_stock ps WHERE ps.product_id = p.id), 0) AS total_stock,
            COALESCE(
              (SELECT ps2.location_sku
                 FROM invex.product_stock ps2
                WHERE ps2.product_id = p.id
                  AND ps2.quantity > 0
                  AND ps2.location_sku IS NOT NULL
                ORDER BY ps2.quantity DESC, ps2.location_id ASC
                LIMIT 1),
              p.sku
            ) AS current_sku,
            (SELECT pb.expiry_date::text
               FROM invex.product_batches pb
              WHERE pb.product_id = p.id
                AND pb.batch_no LIKE 'INIT-%'
              ORDER BY pb.created_at ASC
              LIMIT 1) AS initial_expiry_date,
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
  notes,
}, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const result = await executeQuery(
    `INSERT INTO invex.products (name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, notes, created_at`,
    [
      name,
      sku,
      category_id,
      supplier_id,
      unit_price,
      reorder_level ?? 0,
      track_expiry ?? false,
      unit_of_measure ?? 'pcs',
      notes ?? null,
    ]
  );
  return result.rows[0];
};

/**
 * Update an existing active product. Only updates provided fields.
 */
const updateProduct = async (
  id,
  { name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, notes }
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
    notes,
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
     RETURNING id, name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, notes, created_at`,
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
 * Get just a product's name. Used in lightweight contexts (e.g. activity logs)
 * where loading the full row would be wasteful.
 */
const getProductName = async (id, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;
  const result = await executeQuery(
    `SELECT name FROM invex.products WHERE id = $1`,
    [id]
  );
  return result.rows[0]?.name || null;
};

/**
 * Find an active product by case-insensitive name match. Used by the
 * import flow to merge identical product names instead of duplicating them.
 */
const findActiveByName = async (name, dbClient) => {
  const executeQuery = dbClient ? dbClient.query.bind(dbClient) : query;
  const result = await executeQuery(
    `SELECT id, sku FROM invex.products
     WHERE TRIM(LOWER(name)) = TRIM(LOWER($1))
       AND is_deleted = FALSE
     LIMIT 1`,
    [name]
  );
  return result.rows[0] || null;
};

/**
 * Update the writable subset of fields used by the import flow when an
 * incoming row matches an existing product. Existing values are preserved
 * if the corresponding parameter is null/undefined.
 */
const applyImportUpdate = async (client, id, { unit_price, unit_of_measure, reorder_level, track_expiry }) => {
  await client.query(
    `UPDATE invex.products
     SET unit_price = COALESCE($1, unit_price),
         unit_of_measure = COALESCE($2, unit_of_measure),
         reorder_level = COALESCE($3, reorder_level),
         track_expiry = CASE WHEN $4 = TRUE THEN TRUE ELSE track_expiry END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5`,
    [unit_price, unit_of_measure, reorder_level, track_expiry, id]
  );
};

/**
 * Insert a product row and return the new id. Skips the `*` columns the
 * regular createProduct returns — used by the import flow which only needs
 * the id afterward.
 */
const insertProductMinimal = async (client, { name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, notes }) => {
  const result = await client.query(
    `INSERT INTO invex.products
       (name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure || 'pcs', notes ?? null]
  );
  return result.rows[0];
};

/**
 * Insert (or merge) initial stock for a product at a location. Increments the
 * existing row instead of overwriting so repeated imports compose cleanly.
 */
const upsertInitialStock = async (client, { product_id, location_id, quantity, location_sku }) => {
  await client.query(
    `INSERT INTO invex.product_stock (product_id, location_id, quantity, location_sku)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, location_id)
     DO UPDATE SET quantity = invex.product_stock.quantity + EXCLUDED.quantity,
                   location_sku = COALESCE(invex.product_stock.location_sku, EXCLUDED.location_sku),
                   last_updated = CURRENT_TIMESTAMP`,
    [product_id, location_id, quantity, location_sku]
  );
};

/**
 * Insert a product_batches row for an initial expiry tracker. Used by
 * product creation/import when track_expiry is on.
 */
const insertInitialBatch = async (client, { product_id, location_id, sku, expiry_date, quantity = 0 }) => {
  await client.query(
    `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
     VALUES ($1, $2, $3, $4, $5)`,
    [product_id, location_id, 'INIT-' + sku, quantity, expiry_date]
  );
};

/**
 * Return the id of an existing INIT-* batch for a product, if any.
 */
const findInitBatchByProduct = async (product_id) => {
  const result = await query(
    `SELECT id FROM invex.product_batches
     WHERE product_id = $1 AND batch_no LIKE 'INIT-%'
     LIMIT 1`,
    [product_id]
  );
  return result.rows[0] || null;
};

/**
 * Update the expiry_date on all INIT-* batches for a product.
 */
const updateInitBatchExpiry = async (product_id, expiry_date) => {
  await query(
    `UPDATE invex.product_batches
     SET expiry_date = $1
     WHERE product_id = $2 AND batch_no LIKE 'INIT-%'`,
    [expiry_date, product_id]
  );
};

/**
 * Pick the location currently holding the most stock for a product, falling
 * back to the first known location if no row has any quantity. Used when a
 * caller needs *some* location_id to attach a new INIT batch to.
 */
const findPrimaryLocationId = async (product_id) => {
  const withStock = await query(
    `SELECT location_id FROM invex.product_stock
     WHERE product_id = $1 AND quantity > 0
     ORDER BY quantity DESC LIMIT 1`,
    [product_id]
  );
  if (withStock.rows.length > 0) return withStock.rows[0].location_id;

  const fallback = await query(
    `SELECT location_id FROM invex.product_stock WHERE product_id = $1 ORDER BY location_id ASC LIMIT 1`,
    [product_id]
  );
  return fallback.rows[0]?.location_id || null;
};

/**
 * Insert an INIT batch using a SKU pulled from the products row inline —
 * used by updateProduct when no INIT batch yet exists.
 */
const insertInitialBatchFromProductSku = async (product_id, location_id, expiry_date) => {
  await query(
    `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
     VALUES ($1, $2, 'INIT-' || (SELECT sku FROM invex.products WHERE id = $1), 0, $3)`,
    [product_id, location_id, expiry_date]
  );
};

/**
 * Pre-flight: fetch ids of all active categories/suppliers/locations so the
 * import flow can validate every row before opening a transaction.
 */
const getActiveImportReferenceIds = async () => {
  const [catRes, supRes, locRes] = await Promise.all([
    query('SELECT id FROM invex.categories WHERE is_deleted = false'),
    query('SELECT id FROM invex.suppliers WHERE is_deleted = false'),
    query('SELECT id FROM invex.locations WHERE is_deleted = false'),
  ]);
  return {
    categoryIds: catRes.rows.map((r) => r.id),
    supplierIds: supRes.rows.map((r) => r.id),
    locationIds: locRes.rows.map((r) => r.id),
  };
};

/**
 * Get stock levels per location for a specific product.
 * Stub: returns current data from product_stock table.
 */
const getProductStock = async (productId) => {
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

module.exports = {
  getAllProducts,
  getProductById,
  getNextSkuForLocation,
  createProduct,
  updateProduct,
  softDeleteProduct,
  getProductName,
  findActiveByName,
  applyImportUpdate,
  insertProductMinimal,
  upsertInitialStock,
  insertInitialBatch,
  findInitBatchByProduct,
  updateInitBatchExpiry,
  findPrimaryLocationId,
  insertInitialBatchFromProductSku,
  getActiveImportReferenceIds,
  getProductStock,
};
