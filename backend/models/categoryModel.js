const { query } = require('../src/config/db');

/**
 * Category Model
 * Handles all database operations for the categories table.
 */

/**
 * Get all active (non-deleted) categories.
 * @returns {Promise<Array>} List of categories
 */
const getAll = async () => {
  const result = await query(
    `SELECT id, name, description, created_at
     FROM invex.categories
     WHERE is_deleted = FALSE
     ORDER BY name ASC`
  );
  return result.rows;
};

/**
 * Get a single category by ID (non-deleted only).
 * @param {number} id - Category ID
 * @returns {Promise<Object|null>} Category object or null
 */
const getById = async (id) => {
  const result = await query(
    `SELECT id, name, description, created_at
     FROM invex.categories
     WHERE id = $1 AND is_deleted = FALSE
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new category.
 * @param {Object} data - { name, description }
 * @returns {Promise<Object>} The newly created category
 */
const create = async ({ name, description }) => {
  const result = await query(
    `INSERT INTO invex.categories (name, description)
     VALUES ($1, $2)
     RETURNING id, name, description, created_at`,
    [name, description || null]
  );
  return result.rows[0];
};

/**
 * Update an existing category.
 * @param {number} id - Category ID
 * @param {Object} data - { name, description }
 * @returns {Promise<Object|null>} Updated category or null if not found
 */
const update = async (id, { name, description }) => {
  const result = await query(
    `UPDATE invex.categories
     SET name = $1, description = $2
     WHERE id = $3 AND is_deleted = FALSE
     RETURNING id, name, description, created_at`,
    [name, description || null, id]
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete a category (sets is_deleted = TRUE).
 * The database trigger automatically sets deleted_at.
 * @param {number} id - Category ID
 * @returns {Promise<Object|null>} Deleted category or null if not found
 */
const softDelete = async (id) => {
  const result = await query(
    `UPDATE invex.categories
     SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, name`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Check if a category name already exists (among active records).
 * @param {string} name - Category name to check
 * @param {number} [excludeId] - ID to exclude (for update uniqueness check)
 * @returns {Promise<boolean>} True if name exists
 */
const nameExists = async (name, excludeId = null) => {
  const sql = excludeId
    ? `SELECT id FROM  invex.categories WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE AND id != $2 LIMIT 1`
    : `SELECT id FROM invex.categories WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE LIMIT 1`;

  const params = excludeId ? [name, excludeId] : [name];
  const result = await query(sql, params);
  return result.rows.length > 0;
};

module.exports = { getAll, getById, create, update, softDelete, nameExists };
