const { query } = require('../src/config/db');

/**
 * GET /api/audit-logs
 * Retrieves immutable audit records with filtering, pagination, and JSON state diffs.
 * Accessible to Super Admin users only.
 */
exports.getAuditLogs = async (req, res, next) => {
  try {
    const {
      table_name,
      action,
      changed_by,
      start_date,
      end_date,
      limit = 25,
      offset = 0,
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    // Build dynamic query
    const conditions = [];
    const values = [];

    if (table_name) {
      values.push(table_name);
      conditions.push(`table_name = $${values.length}`);
    }

    if (action) {
      values.push(action.toUpperCase());
      conditions.push(`action = $${values.length}`);
    }

    if (changed_by) {
      values.push(parseInt(changed_by, 10));
      conditions.push(`changed_by = $${values.length}`);
    }

    if (start_date) {
      values.push(start_date);
      conditions.push(`changed_at >= $${values.length}::timestamp`);
    }

    if (end_date) {
      values.push(end_date);
      conditions.push(`changed_at <= $${values.length}::timestamp + INTERVAL '1 day'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Check if vw_audit_trail view exists in the database
    const checkView = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'invex' AND table_name = 'vw_audit_trail'
      ) OR EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'invex' AND table_name = 'audit_logs'
      ) AS has_audit;
    `);

    let targetSource = 'invex.vw_audit_trail';
    if (!checkView.rows[0]?.has_audit) {
      // Fallback to invex.activity_logs if audit_logs migration has not been applied yet
      targetSource = `(
        SELECT 
          al.id,
          al.created_at AS changed_at,
          al.entity_type AS table_name,
          al.entity_id AS record_id,
          al.action,
          al.user_id AS changed_by,
          COALESCE(u.full_name, u.username, 'System') AS changed_by_name,
          NULL::jsonb AS old_data,
          jsonb_build_object('details', al.details) AS new_data
        FROM invex.activity_logs al
        LEFT JOIN invex.users u ON al.user_id = u.id
      ) fallback_audit`;
    }

    // Total count query for pagination
    const countQuery = `SELECT COUNT(*) AS total FROM ${targetSource} ${whereClause}`;
    const countResult = await query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0]?.total || 0, 10);

    // Data query with ordering and pagination
    const dataQuery = `
      SELECT 
        id,
        changed_at,
        table_name,
        record_id,
        action,
        changed_by,
        changed_by_name,
        old_data,
        new_data
      FROM ${targetSource}
      ${whereClause}
      ORDER BY changed_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const dataResult = await query(dataQuery, [...values, parsedLimit, parsedOffset]);

    return res.json({
      success: true,
      count: totalCount,
      limit: parsedLimit,
      offset: parsedOffset,
      data: dataResult.rows,
    });
  } catch (err) {
    return next(err);
  }
};
