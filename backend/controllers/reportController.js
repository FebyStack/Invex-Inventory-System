const reportModel = require('../models/reportModel');

// GET /api/reports/dashboard?days=30
// Aggregates everything the dashboard needs in a single round-trip:
// stat tiles + their week-over-week deltas, daily stock-movement series,
// stock-by-category, and the most recent activity.
const getDashboardData = async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 90);

    const [
      totalProductsRow,
      stockStatus,
      totalValue,
      activeLocations,
      orders,
      recentActivity,
      stockByCategory,
      seriesRows,
    ] = await Promise.all([
      reportModel.getTotalProducts(),
      reportModel.getStockStatusCounts(),
      reportModel.getTotalInventoryValue(),
      reportModel.getActiveLocationsCount(),
      reportModel.getOrdersWeekComparison(),
      reportModel.getRecentActivity(8),
      reportModel.getStockByCategory(),
      reportModel.getStockMovementSeries(days),
    ]);

    const stockMovementSeries = seriesRows.map((r) => ({
      date: r.day,
      in: r.in_qty,
      out: r.out_qty,
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts: totalProductsRow.total,
          productsAdded7d: totalProductsRow.added_7d,
          lowStock: stockStatus.low_stock,
          outOfStock: stockStatus.out_of_stock,
          totalValue,
          activeLocations,
          ordersThisWeek: orders.this_week,
          ordersLastWeek: orders.last_week,
        },
        recentActivity,
        charts: {
          stockByCategory,
          stockMovementSeries,
          rangeDays: days,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/low-stock
const getLowStock = async (req, res, next) => {
  try {
    const { location_id } = req.query;
    const rows = await reportModel.getLowStock({ location_id });
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/expiring
const getExpiringBatches = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const { location_id } = req.query;
    const rows = await reportModel.getExpiringBatches({ days, location_id });
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/stock-summary
const getStockSummary = async (req, res, next) => {
  try {
    const rows = await reportModel.getStockSummary();
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/movement-log
const getMovementLog = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = parseInt(req.query.offset, 10) || 0;
    const { location_id } = req.query;
    const rows = await reportModel.getMovementLog({ limit, offset, location_id });
    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardData,
  getLowStock,
  getExpiringBatches,
  getStockSummary,
  getMovementLog
};
