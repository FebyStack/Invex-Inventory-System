const batchModel = require('../models/batchModel');

/**
 * GET /api/dashboard/urgent-batches
 * Returns the count of expiring batches (<= 30 days) and top 10 most urgent.
 */
exports.getUrgentBatches = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;

    const [expiringCount, urgentItems] = await Promise.all([
      batchModel.countExpiringWithStock(days),
      batchModel.getMostUrgentBatches(10),
    ]);

    return res.json({
      success: true,
      data: { expiringCount, urgentItems }
    });
  } catch (error) {
    return next(error);
  }
};
