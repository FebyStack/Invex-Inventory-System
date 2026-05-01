const { pool } = require('../config/db');

/**
 * Asynchronously logs an activity to the database without blocking the main request.
 * @param {number} userId - The ID of the user performing the action.
 * @param {string} action - The action performed (e.g., 'LOGIN', 'LOGOUT', 'CREATE_PRODUCT').
 * @param {string} [entityType] - The type of entity affected (e.g., 'products', 'users').
 * @param {number} [entityId] - The ID of the affected entity.
 * @param {string} [details] - Additional details as a string or JSON stringified object.
 * @param {number} [locationId] - Optional location context for the activity.
 */
const logActivity = async (userId, action, entityType = null, entityId = null, details = null, locationId = null) => {
  const serializedDetails =
    details == null || typeof details === 'string' ? details : JSON.stringify(details);

  return pool
    .query(
      `INSERT INTO invex.activity_logs (user_id, action, entity_type, entity_id, details, location_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, serializedDetails, locationId]
    )
    .catch((err) => {
      console.error('❌ Failed to log activity:', err.message);
    });
};

module.exports = { logActivity };
