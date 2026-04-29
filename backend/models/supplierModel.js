const { query } = require('../src/config/db');

/**
 * Supplier Model
 * Handles all database operations for the suppliers table.
 * Address is stored as 5 atomic fields: address_line, barangay, city, province, postal_code.
 */

// Columns returned on read operations
const SELECT_COLS = `id, name, contact_person, phone, email,
  address_line, barangay, city, province, postal_code,
  created_at`;

/**
 * Get all active (non-deleted) suppliers.
 * @returns {Promise<Array>} List of suppliers
 */
const getAll = async () => {
  const result = await query(
    `SELECT ${SELECT_COLS}
     FROM invex.suppliers
     WHERE is_deleted = FALSE
     ORDER BY name ASC`
  );
  return result.rows;
};

/**
 * Get a single supplier by ID (non-deleted only).
 * @param {number} id - Supplier ID
 * @returns {Promise<Object|null>} Supplier object or null
 */
const getById = async (id) => {
  const result = await query(
    `SELECT ${SELECT_COLS}
     FROM invex.suppliers
     WHERE id = $1 AND is_deleted = FALSE
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new supplier.
 * @param {Object} data - Supplier fields
 * @returns {Promise<Object>} The newly created supplier
 */
const create = async ({ name, contact_person, phone, email, address_line, barangay, city, province, postal_code }) => {
  const result = await query(
    `INSERT INTO invex.suppliers (name, contact_person, phone, email, address_line, barangay, city, province, postal_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SELECT_COLS}`,
    [name, contact_person || null, phone || null, email || null, address_line || null, barangay || null, city || null, province || null, postal_code || null]
  );
  return result.rows[0];
};

/**
 * Update an existing supplier.
 * @param {number} id - Supplier ID
 * @param {Object} data - Supplier fields
 * @returns {Promise<Object|null>} Updated supplier or null if not found
 */
const update = async (id, { name, contact_person, phone, email, address_line, barangay, city, province, postal_code }) => {
  const result = await query(
    `UPDATE invex.suppliers
     SET name = $1, contact_person = $2, phone = $3, email = $4,
         address_line = $5, barangay = $6, city = $7, province = $8, postal_code = $9
     WHERE id = $10 AND is_deleted = FALSE
     RETURNING ${SELECT_COLS}`,
    [name, contact_person || null, phone || null, email || null, address_line || null, barangay || null, city || null, province || null, postal_code || null, id]
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete a supplier (sets is_deleted = TRUE).
 * The database trigger automatically sets deleted_at.
 * @param {number} id - Supplier ID
 * @returns {Promise<Object|null>} Deleted supplier or null if not found
 */
const softDelete = async (id) => {
  const result = await query(
    `UPDATE invex.suppliers
     SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, name`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = { getAll, getById, create, update, softDelete };
