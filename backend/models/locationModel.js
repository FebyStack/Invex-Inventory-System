const { query } = require('../src/config/db');

/**
 * Get all active locations.
 */
const getAllLocations = async () => {
  const result = await query(
    `SELECT id, name, code, address_line, barangay, city, province, postal_code, type, color, created_at
     FROM invex.locations
     WHERE is_deleted = FALSE
     ORDER BY created_at DESC`
  );
  return result.rows;
};

/**
 * Get a single active location by ID.
 */
const getLocationById = async (id) => {
  const result = await query(
    `SELECT id, name, code, address_line, barangay, city, province, postal_code, type, color, created_at
     FROM invex.locations
     WHERE id = $1 AND is_deleted = FALSE`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new location.
 */
const createLocation = async ({
  name,
  code,
  address_line,
  barangay,
  city,
  province,
  postal_code,
  type,
  color,
}) => {
  const result = await query(
    `INSERT INTO invex.locations (name, code, address_line, barangay, city, province, postal_code, type, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, name, code, address_line, barangay, city, province, postal_code, type, color, created_at`,
    [name, code, address_line, barangay, city, province, postal_code, type, color]
  );
  return result.rows[0];
};

/**
 * Check whether a location code already exists.
 */
const locationCodeExists = async (code) => {
  const result = await query(
    `SELECT id
     FROM invex.locations
     WHERE code = $1
     LIMIT 1`,
    [code]
  );
  return result.rowCount > 0;
};

/**
 * Update an existing active location.
 */
const updateLocation = async (
  id,
  { name, code, address_line, barangay, city, province, postal_code, type, color }
) => {
  const fields = [];
  const values = [];
  let idx = 1;

  const columns = {
    name,
    code,
    address_line,
    barangay,
    city,
    province,
    postal_code,
    type,
    color,
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
    `UPDATE invex.locations SET ${fields.join(', ')}
     WHERE id = $${idx} AND is_deleted = FALSE
     RETURNING id, name, code, address_line, barangay, city, province, postal_code, type, color, created_at`,
    values
  );
  return result.rows[0] || null;
};

/**
 * Get aggregated stock summary for every active location plus a global row.
 * Returns: [{ id, name, code, color, city, region, type, units, skus, low, out, value }]
 *
 * The first row is the "all" aggregate. `units` sums quantity across every
 * location. `low` counts (qty>0 AND qty<=reorder_level), `out` counts qty=0
 * (per-location for warehouse rows; per-product for the global row).
 * `skus` is the count of distinct products with at least one unit at that
 * location (or distinct active products for the global row).
 * `value` is sum of qty * unit_price.
 */
const getLocationSummary = async () => {
  const perLocResult = await query(
    `WITH stock AS (
       SELECT ps.location_id,
              ps.product_id,
              ps.quantity,
              p.unit_price,
              p.reorder_level
       FROM invex.product_stock ps
       JOIN invex.products p ON p.id = ps.product_id AND p.is_deleted = FALSE
     )
     SELECT l.id, l.name, l.code, l.color, l.type,
            l.address_line AS city, l.province AS region,
            COALESCE(SUM(s.quantity), 0)::bigint AS units,
            COUNT(DISTINCT CASE WHEN s.quantity > 0 THEN s.product_id END)::int AS skus,
            COUNT(CASE WHEN s.quantity > 0 AND s.quantity <= s.reorder_level THEN 1 END)::int AS low,
            COUNT(CASE WHEN s.quantity = 0 THEN 1 END)::int AS out_of_stock,
            COALESCE(SUM(s.quantity * s.unit_price), 0)::numeric AS value
     FROM invex.locations l
     LEFT JOIN stock s ON s.location_id = l.id
     WHERE l.is_deleted = FALSE
     GROUP BY l.id
     ORDER BY l.created_at DESC`
  );

  const globalResult = await query(
    `WITH per_product AS (
       SELECT p.id, p.unit_price, p.reorder_level,
              COALESCE(SUM(ps.quantity), 0)::bigint AS qty
       FROM invex.products p
       LEFT JOIN invex.product_stock ps ON ps.product_id = p.id
       WHERE p.is_deleted = FALSE
       GROUP BY p.id
     )
     SELECT COALESCE(SUM(qty), 0)::bigint AS units,
            COUNT(*)::int AS skus,
            COUNT(CASE WHEN qty > 0 AND qty <= reorder_level THEN 1 END)::int AS low,
            COUNT(CASE WHEN qty = 0 THEN 1 END)::int AS out_of_stock,
            COALESCE(SUM(qty * unit_price), 0)::numeric AS value
     FROM per_product`
  );

  const g = globalResult.rows[0];
  return {
    global: {
      id: 'all',
      name: 'All locations',
      code: 'GLOBAL',
      color: '#5EEAD4',
      city: 'Global view',
      region: '—',
      units: Number(g.units),
      skus: Number(g.skus),
      low: Number(g.low),
      out: Number(g.out_of_stock),
      value: Number(g.value),
    },
    locations: perLocResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      color: r.color,
      city: r.city,
      region: r.region,
      type: r.type,
      units: Number(r.units),
      skus: Number(r.skus),
      low: Number(r.low),
      out: Number(r.out_of_stock),
      value: Number(r.value),
    })),
  };
};

/**
 * Get all products with their per-location stock (matrix) plus a total.
 * Returns: [{ id, name, sku, category_name, reorder_level, unit_price,
 *             total, by_location: { [location_id]: quantity } }]
 */
const getInventoryMatrix = async () => {
  const result = await query(
    `SELECT p.id, p.name, p.sku, p.reorder_level, p.unit_price,
            c.name AS category_name,
            COALESCE(json_object_agg(ps.location_id, ps.quantity)
                     FILTER (WHERE ps.location_id IS NOT NULL), '{}') AS by_location,
            COALESCE(SUM(ps.quantity), 0)::bigint AS total
     FROM invex.products p
     LEFT JOIN invex.categories c ON p.category_id = c.id
     LEFT JOIN invex.product_stock ps ON ps.product_id = p.id
     WHERE p.is_deleted = FALSE
     GROUP BY p.id, c.name
     ORDER BY p.name`
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    category_name: r.category_name,
    reorder_level: r.reorder_level,
    unit_price: Number(r.unit_price),
    total: Number(r.total),
    by_location: r.by_location,
  }));
};

/**
 * Soft-delete a location.
 */
const softDeleteLocation = async (id) => {
  const result = await query(
    `UPDATE invex.locations SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, color`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  getAllLocations,
  getLocationById,
  createLocation,
  locationCodeExists,
  updateLocation,
  softDeleteLocation,
  getLocationSummary,
  getInventoryMatrix,
};
