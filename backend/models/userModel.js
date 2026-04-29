const { query } = require('../src/config/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Get all active (non-deleted) users.
 * Never returns the password field.
 */
const getAllUsers = async () => {
  const result = await query(
    `SELECT id, username, full_name, email, role, created_at
     FROM invex.users
     WHERE is_deleted = FALSE
     ORDER BY created_at DESC`
  );
  return result.rows;
};

/**
 * Get a single active user by ID.
 * Never returns the password field.
 */
const getUserById = async (id) => {
  const result = await query(
    `SELECT id, username, full_name, email, role, created_at
     FROM invex.users
     WHERE id = $1 AND is_deleted = FALSE`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new user. Hashes the password before storing.
 * @param {object} data - { username, full_name, email, password, role }
 */
const createUser = async ({ username, full_name, email, password, role }) => {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO invex.users (username, full_name, email, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, full_name, email, role, created_at`,
    [username, full_name, email, hashedPassword, role]
  );
  return result.rows[0];
};

/**
 * Update an existing active user. Only updates provided fields.
 * If password is provided it is re-hashed before saving.
 * @param {number} id
 * @param {object} data - any subset of { username, full_name, email, password, role }
 */
const updateUser = async (id, { username, full_name, email, password, role }) => {
  const fields = [];
  const values = [];
  let idx = 1;

  const columns = { username, full_name, email, role };
  for (const [col, val] of Object.entries(columns)) {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    }
  }

  // Hash new password if provided
  if (password !== undefined) {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    fields.push(`password = $${idx++}`);
    values.push(hashedPassword);
  }

  if (fields.length === 0) return null;

  values.push(id);

  const result = await query(
    `UPDATE invex.users SET ${fields.join(', ')}
     WHERE id = $${idx} AND is_deleted = FALSE
     RETURNING id, username, full_name, email, role, created_at`,
    values
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete a user by setting is_deleted = TRUE.
 * The deleted_at timestamp is set automatically by the database trigger.
 */
const softDeleteUser = async (id) => {
  const result = await query(
    `UPDATE invex.users SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, softDeleteUser };
