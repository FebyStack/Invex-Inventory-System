const { query } = require('../src/config/db');

/**
 * Get all active reason codes. Optionally filter by adjustment type:
 *   - INCREASE  → returns codes with adjustment_type IN ('INCREASE', 'BOTH')
 *   - DECREASE  → returns codes with adjustment_type IN ('DECREASE', 'BOTH')
 *   - TRANSFER  → transfers decrement the source, so returns DECREASE-compatible codes
 */
const getAll = async ({ type } = {}) => {
  let sql = `SELECT id, code, description, adjustment_type, created_at
             FROM invex.reason_codes
             WHERE is_deleted = FALSE`;
  const values = [];

  const normalized = type === 'TRANSFER' ? 'DECREASE' : type;
  if (normalized === 'INCREASE' || normalized === 'DECREASE') {
    sql += ` AND adjustment_type IN ($1, 'BOTH')`;
    values.push(normalized);
  }

  sql += ` ORDER BY code`;
  const result = await query(sql, values);
  return result.rows;
};

/**
 * Get a single reason code by ID (active only).
 */
const getById = async (id) => {
  const result = await query(
    `SELECT id, code, description, adjustment_type, is_deleted, created_at
     FROM invex.reason_codes
     WHERE id = $1 AND is_deleted = FALSE`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Check if a reason code with the given code string already exists.
 */
const codeExists = async (code, excludeId) => {
  let sql = `SELECT id FROM invex.reason_codes WHERE code = $1 AND is_deleted = FALSE`;
  const values = [code];
  if (excludeId) {
    sql += ` AND id != $2`;
    values.push(excludeId);
  }
  const result = await query(sql, values);
  return result.rowCount > 0;
};

/**
 * Create a new reason code.
 */
const create = async ({ code, description, adjustment_type }) => {
  const result = await query(
    `INSERT INTO invex.reason_codes (code, description, adjustment_type)
     VALUES ($1, $2, $3)
     RETURNING id, code, description, adjustment_type, created_at`,
    [code, description, adjustment_type]
  );
  return result.rows[0];
};

/**
 * Soft-delete a reason code.
 */
const softDelete = async (id) => {
  const result = await query(
    `UPDATE invex.reason_codes SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, code`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  getAll,
  getById,
  codeExists,
  create,
  softDelete,
};
