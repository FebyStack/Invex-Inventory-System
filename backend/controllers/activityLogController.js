const activityLogModel = require('../models/activityLogModel');

/**
 * GET /api/activity-logs
 * Admin-only. Returns a paginated, filtered list of activity log entries.
 * Query params: user_id, action, entity_type, location_id, start_date, end_date,
 *               search, limit, offset.
 */
exports.list = async (req, res, next) => {
  try {
    const rows = await activityLogModel.getAll({
      user_id: req.query.user_id ? parseInt(req.query.user_id, 10) : undefined,
      action: req.query.action || undefined,
      entity_type: req.query.entity_type || undefined,
      location_id: req.query.location_id ? parseInt(req.query.location_id, 10) : undefined,
      start_date: req.query.start_date || undefined,
      end_date: req.query.end_date || undefined,
      search: req.query.search || undefined,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/activity-logs/facets
 * Returns the distinct action names and entity types present in the log table,
 * so the UI can render filter dropdowns without hard-coding.
 */
exports.facets = async (req, res, next) => {
  try {
    const data = await activityLogModel.getFacets();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};
