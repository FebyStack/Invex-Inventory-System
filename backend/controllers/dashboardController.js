const { query } = require('../src/config/db');

/**
 * GET /api/dashboard/urgent-batches
 * Returns the count of expiring batches (<= 30 days) and top 10 most urgent.
 */
exports.getUrgentBatches = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;

    // 1. Get count of expiring batches
    const countResult = await query(
      `SELECT COUNT(*) as expiring_count
       FROM invex.product_batches
       WHERE is_deleted = FALSE 
         AND quantity > 0
         AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`,
      [days]
    );

    // 2. Get top 10 most urgent items
    const listResult = await query(
      `SELECT pb.id, pb.batch_no, pb.quantity, pb.expiry_date,
              p.name AS product_name, p.sku, l.name AS location_name
       FROM invex.product_batches pb
       JOIN invex.products p ON pb.product_id = p.id
       JOIN invex.locations l ON pb.location_id = l.id
       WHERE pb.is_deleted = FALSE 
         AND pb.quantity > 0
       ORDER BY pb.expiry_date ASC
       LIMIT 10`
    );

    return res.json({
      success: true,
      data: {
        expiringCount: parseInt(countResult.rows[0].expiring_count, 10),
        urgentItems: listResult.rows
      }
    });
  } catch (error) {
    return next(error);
  }
};
