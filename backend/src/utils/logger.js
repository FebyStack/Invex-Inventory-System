const { pool } = require('../config/db');

/**
 * Asynchronously logs an activity to the database without blocking the main request.
 * @param {number} userId - The ID of the user performing the action.
 * @param {string} action - The action performed (e.g., 'LOGIN', 'LOGOUT', 'CREATE_PRODUCT').
 * @param {string} [entityType] - The type of entity affected (e.g., 'products', 'users').
 * @param {number} [entityId] - The ID of the affected entity.
 * @param {string} [details] - Additional details as a string or JSON stringified object.
 */
const logActivity = async (userId, action, entityType = null, entityId = null, details = null) => {
  const serializedDetails =
    details == null || typeof details === 'string' ? details : JSON.stringify(details);

  return pool
    .query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, serializedDetails]
    )
    .catch((err) => {
      console.error('❌ Failed to log activity:', err.message);
    });
};

module.exports = { logActivity };
