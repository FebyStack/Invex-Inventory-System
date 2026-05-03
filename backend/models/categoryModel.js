const { query } = require('../src/config/db');

/**
 * Category Model
 * Handles all database operations for the categories table.
 */

const DEFAULT_COLOR = '#7C7CFF';

/**
 * Get all active (non-deleted) categories WITH their per-category aggregates:
 *   product_count — number of active products in the category
 *   total_value   — Σ(unit_price × on-hand quantity across all locations)
 *
 * Returned in a single round-trip so the frontend doesn't need to fetch
 * /api/products separately just to compute card stats.
 *
 * @returns {Promise<Array>} List of categories
 */
const getAll = async () => {
  const result = await query(
    `SELECT
        c.id,
        c.name,
        c.description,
        c.color,
        c.created_at,
        COALESCE(stats.product_count, 0)::int                AS product_count,
        COALESCE(stats.total_value, 0)::float                AS total_value
     FROM invex.categories c
     LEFT JOIN (
       SELECT
         p.category_id,
         COUNT(p.id) AS product_count,
         SUM(p.unit_price * COALESCE(stock.on_hand, 0)) AS total_value
       FROM invex.products p
       LEFT JOIN (
         SELECT product_id, SUM(quantity) AS on_hand
         FROM invex.product_stock
         GROUP BY product_id
       ) stock ON stock.product_id = p.id
       WHERE p.is_deleted = FALSE
       GROUP BY p.category_id
     ) stats ON stats.category_id = c.id
     WHERE c.is_deleted = FALSE
     ORDER BY c.name ASC`
  );
  return result.rows;
};

/**
 * Get a single category by ID (non-deleted only) with the same aggregates.
 * @param {number} id - Category ID
 * @returns {Promise<Object|null>} Category object or null
 */
const getById = async (id) => {
  const result = await query(
    `SELECT
        c.id,
        c.name,
        c.description,
        c.color,
        c.created_at,
        COALESCE(stats.product_count, 0)::int AS product_count,
        COALESCE(stats.total_value, 0)::float AS total_value
     FROM invex.categories c
     LEFT JOIN (
       SELECT
         p.category_id,
         COUNT(p.id) AS product_count,
         SUM(p.unit_price * COALESCE(stock.on_hand, 0)) AS total_value
       FROM invex.products p
       LEFT JOIN (
         SELECT product_id, SUM(quantity) AS on_hand
         FROM invex.product_stock
         GROUP BY product_id
       ) stock ON stock.product_id = p.id
       WHERE p.is_deleted = FALSE
       GROUP BY p.category_id
     ) stats ON stats.category_id = c.id
     WHERE c.id = $1 AND c.is_deleted = FALSE
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new category.
 * @param {Object} data - { name, description, color }
 * @returns {Promise<Object>} The newly created category
 */
const create = async ({ name, description, color }) => {
  const result = await query(
    `INSERT INTO invex.categories (name, description, color)
     VALUES ($1, $2, $3)
     RETURNING id, name, description, color, created_at`,
    [name, description || null, color || DEFAULT_COLOR]
  );
  return result.rows[0];
};

/**
 * Update an existing category.
 * @param {number} id - Category ID
 * @param {Object} data - { name, description, color }
 * @returns {Promise<Object|null>} Updated category or null if not found
 */
const update = async (id, { name, description, color }) => {
  const result = await query(
    `UPDATE invex.categories
     SET name = $1,
         description = $2,
         color = COALESCE($3, color)
     WHERE id = $4 AND is_deleted = FALSE
     RETURNING id, name, description, color, created_at`,
    [name, description || null, color || null, id]
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
    ? `SELECT id FROM invex.categories WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE AND id != $2 LIMIT 1`
    : `SELECT id FROM invex.categories WHERE LOWER(name) = LOWER($1) AND is_deleted = FALSE LIMIT 1`;

  const params = excludeId ? [name, excludeId] : [name];
  const result = await query(sql, params);
  return result.rows.length > 0;
};

module.exports = { getAll, getById, create, update, softDelete, nameExists, DEFAULT_COLOR };
