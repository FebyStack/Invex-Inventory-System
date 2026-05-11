const { query } = require('../src/config/db');

/**
 * Fetch activity logs with optional filters. All filters are AND-combined.
 * Joins users + locations for display. Soft-deleted users still appear
 * (we want to keep the audit trail readable even after a user is removed).
 *
 * @param {object} filters
 * @param {number} [filters.user_id]
 * @param {string} [filters.action]        Exact action string (e.g. 'LOGIN')
 * @param {string} [filters.entity_type]   e.g. 'products', 'users'
 * @param {number} [filters.location_id]
 * @param {string} [filters.start_date]    ISO date — inclusive lower bound
 * @param {string} [filters.end_date]      ISO date — inclusive upper bound
 * @param {string} [filters.search]        Substring match on action/entity_type/details
 * @param {number} [filters.limit]         Default 200, capped at 1000
 * @param {number} [filters.offset]        Default 0
 */
const getAll = async (filters = {}) => {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.user_id) {
    conditions.push(`al.user_id = $${idx++}`);
    values.push(filters.user_id);
  }
  if (filters.action) {
    conditions.push(`al.action = $${idx++}`);
    values.push(filters.action);
  }
  if (filters.entity_type) {
    conditions.push(`al.entity_type = $${idx++}`);
    values.push(filters.entity_type);
  }
  if (filters.location_id) {
    conditions.push(`al.location_id = $${idx++}`);
    values.push(filters.location_id);
  }
  if (filters.start_date) {
    conditions.push(`al.created_at >= $${idx++}`);
    values.push(filters.start_date);
  }
  if (filters.end_date) {
    // End date is inclusive — push the boundary to end-of-day.
    conditions.push(`al.created_at < ($${idx++}::date + INTERVAL '1 day')`);
    values.push(filters.end_date);
  }
  if (filters.search) {
    conditions.push(
      `(al.action ILIKE $${idx} OR al.entity_type ILIKE $${idx} OR al.details ILIKE $${idx} OR u.username ILIKE $${idx})`
    );
    values.push(`%${filters.search}%`);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(parseInt(filters.limit, 10) || 200, 1000);
  const offset = Math.max(parseInt(filters.offset, 10) || 0, 0);

  const result = await query(
    `SELECT al.id, al.user_id, u.username, u.full_name, u.role,
            al.action, al.entity_type, al.entity_id, al.details,
            al.location_id, l.name AS location_name, l.code AS location_code,
            al.created_at
     FROM invex.activity_logs al
     LEFT JOIN invex.users u ON u.id = al.user_id
     LEFT JOIN invex.locations l ON l.id = al.location_id
     ${whereClause}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    values
  );
  return result.rows;
};

/**
 * Returns the distinct list of action names + entity types currently in the
 * log table, so the UI can populate filter dropdowns without hard-coding.
 */
const getFacets = async () => {
  const [actions, entities] = await Promise.all([
    query(
      `SELECT DISTINCT action FROM invex.activity_logs WHERE action IS NOT NULL ORDER BY action`
    ),
    query(
      `SELECT DISTINCT entity_type FROM invex.activity_logs WHERE entity_type IS NOT NULL ORDER BY entity_type`
    ),
  ]);
  return {
    actions: actions.rows.map((r) => r.action),
    entity_types: entities.rows.map((r) => r.entity_type),
  };
};

module.exports = { getAll, getFacets };
