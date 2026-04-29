const { query } = require('../src/config/db');

/**
 * Get all active locations.
 */
const getAllLocations = async () => {
  const result = await query(
    `SELECT id, name, code, address_line, barangay, city, province, postal_code, type, created_at
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
    `SELECT id, name, code, address_line, barangay, city, province, postal_code, type, created_at
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
}) => {
  const result = await query(
    `INSERT INTO invex.locations (name, code, address_line, barangay, city, province, postal_code, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, code, address_line, barangay, city, province, postal_code, type, created_at`,
    [name, code, address_line, barangay, city, province, postal_code, type]
  );
  return result.rows[0];
};

/**
 * Update an existing active location.
 */
const updateLocation = async (
  id,
  { name, code, address_line, barangay, city, province, postal_code, type }
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
     RETURNING id, name, code, address_line, barangay, city, province, postal_code, type, created_at`,
    values
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete a location.
 */
const softDeleteLocation = async (id) => {
  const result = await query(
    `UPDATE invex.locations SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  getAllLocations,
  getLocationById,
  createLocation,
  updateLocation,
  softDeleteLocation,
};
