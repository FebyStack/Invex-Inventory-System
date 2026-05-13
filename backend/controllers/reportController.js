const { query } = require('../src/config/db');

// GET /api/reports/dashboard?days=30
// Aggregates everything the dashboard needs in a single round-trip:
// stat tiles + their week-over-week deltas, daily stock-movement series,
// stock-by-category, and the most recent activity.
const getDashboardData = async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 90);

    // 1. Total active products (with last-7d new count for delta)
    const totalProductsRes = await query(`
      SELECT
        COUNT(*)::int                                                          AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int   AS added_7d
      FROM invex.active_products
    `);
    const totalProducts = totalProductsRes.rows[0].total;
    const productsAdded7d = totalProductsRes.rows[0].added_7d;

    // 2. Low stock and Out of stock counts (Unique Products)
    // A product is "Low Stock" if its TOTAL quantity across all locations is <= reorder_level.
    // A product is "Out of Stock" if its TOTAL quantity is 0.
    const stockStatusRes = await query(`
      WITH totals AS (
        SELECT p.id, p.reorder_level, COALESCE(SUM(ps.quantity), 0) as total_qty
        FROM invex.active_products p
        LEFT JOIN invex.product_stock ps ON p.id = ps.product_id
        GROUP BY p.id, p.reorder_level
      )
      SELECT
        COUNT(*) FILTER (WHERE total_qty <= reorder_level AND total_qty > 0)::int AS low_stock,
        COUNT(*) FILTER (WHERE total_qty = 0)::int                               AS out_of_stock
      FROM totals
    `);
    const lowStock = stockStatusRes.rows[0].low_stock;
    const outOfStock = stockStatusRes.rows[0].out_of_stock;

    // 3. Total Inventory Value (unit_price * quantity)
    const valueRes = await query(`
      SELECT COALESCE(SUM(p.unit_price * ps.quantity), 0)::numeric AS total_value
      FROM invex.active_products p
      JOIN invex.product_stock ps ON p.id = ps.product_id
    `);
    const totalValue = parseFloat(valueRes.rows[0].total_value);

    // 4. Active locations
    const locationRes = await query(`
      SELECT COUNT(*)::int AS total FROM invex.active_locations
    `);
    const activeLocations = locationRes.rows[0].total;

    // 5. Orders this week vs last week (delta)
    const ordersRes = await query(`
      SELECT
        COUNT(*) FILTER (WHERE order_date >= NOW() - INTERVAL '7 days')::int                                                 AS this_week,
        COUNT(*) FILTER (WHERE order_date >= NOW() - INTERVAL '14 days' AND order_date < NOW() - INTERVAL '7 days')::int     AS last_week
      FROM invex.active_orders
    `);
    const ordersThisWeek = ordersRes.rows[0].this_week;
    const ordersLastWeek = ordersRes.rows[0].last_week;

    // 6. Recent Activity (last 8 movements — orders + adjustments + transfers)
    const recentActivityRes = await query(`
      SELECT
        sm.movement_date,
        p.name AS product_name,
        COALESCE(ps.location_sku, p.sku) AS sku,
        sm.quantity_change,
        sm.source_type,
        l.name AS location_name,
        u.username AS performed_by
      FROM invex.stock_movements sm
      JOIN invex.products p ON sm.product_id = p.id
      JOIN invex.locations l ON sm.location_id = l.id
      LEFT JOIN invex.product_stock ps
        ON ps.product_id = sm.product_id
       AND ps.location_id = sm.location_id
      LEFT JOIN invex.users u ON sm.user_id = u.id
      ORDER BY sm.movement_date DESC
      LIMIT 8
    `);

    // 7. Stock by Category — only categories with stock > 0
    const categoryStockRes = await query(`
      SELECT
        c.name AS category_name,
        COALESCE(SUM(ps.quantity), 0)::bigint AS total_quantity
      FROM invex.categories c
      LEFT JOIN invex.products p ON c.id = p.category_id AND p.is_deleted = FALSE
      LEFT JOIN invex.product_stock ps ON p.id = ps.product_id
      WHERE c.is_deleted = FALSE
      GROUP BY c.name
      HAVING COALESCE(SUM(ps.quantity), 0) > 0
      ORDER BY total_quantity DESC
    `);

    // 8. Daily stock-movement series for the requested range.
    //    `in` = positive quantity_change, `out` = absolute value of negatives.
    //    Uses generate_series so days with no activity still appear as 0/0.
    const seriesRes = await query(
      `
      WITH days AS (
        SELECT generate_series(
          (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day')::date,
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS day
      ),
      moves AS (
        SELECT
          sm.movement_date::date AS day,
          SUM(GREATEST(sm.quantity_change, 0))::bigint  AS in_qty,
          SUM(GREATEST(-sm.quantity_change, 0))::bigint AS out_qty
        FROM invex.stock_movements sm
        WHERE sm.movement_date >= CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day'
        GROUP BY sm.movement_date::date
      )
      SELECT
        d.day,
        COALESCE(m.in_qty, 0)::int  AS in_qty,
        COALESCE(m.out_qty, 0)::int AS out_qty
      FROM days d
      LEFT JOIN moves m ON m.day = d.day
      ORDER BY d.day ASC
    `,
      [days]
    );
    const stockMovementSeries = seriesRes.rows.map((r) => ({
      date: r.day,
      in: r.in_qty,
      out: r.out_qty,
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts,
          productsAdded7d,
          lowStock,
          outOfStock,
          totalValue,
          activeLocations,
          ordersThisWeek,
          ordersLastWeek,
        },
        recentActivity: recentActivityRes.rows,
        charts: {
          stockByCategory: categoryStockRes.rows,
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
    const values = [];
    let whereClause = 'WHERE p.reorder_level > 0';
    
    if (location_id) {
      whereClause += ' AND ps.location_id = $1';
      values.push(location_id);
    }

    const result = await query(`
      SELECT
        p.id as product_id,
        COALESCE(
          (SELECT ps2.location_sku
             FROM invex.product_stock ps2
            WHERE ps2.product_id = p.id
              AND ps2.quantity > 0
              AND ps2.location_sku IS NOT NULL
            ORDER BY ps2.quantity DESC, ps2.location_id ASC
            LIMIT 1),
          p.sku
        ) AS sku,
        p.name as product_name,
        COALESCE(SUM(ps.quantity), 0) as current_stock,
        p.reorder_level
      FROM invex.active_products p
      LEFT JOIN invex.product_stock ps ON p.id = ps.product_id
      ${whereClause}
      GROUP BY p.id, p.sku, p.name, p.reorder_level
      HAVING COALESCE(SUM(ps.quantity), 0) <= p.reorder_level
      ORDER BY (COALESCE(SUM(ps.quantity), 0) - p.reorder_level) ASC, p.name ASC
    `, values);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/expiring
const getExpiringBatches = async (req, res, next) => {
  try {
    const daysStr = req.query.days || '30';
    const days = parseInt(daysStr, 10);
    const { location_id } = req.query;
    
    const conditions = ['pb.is_deleted = FALSE', 'p.is_deleted = FALSE'];
    const values = [days];
    let idx = 2;

    if (location_id) {
      conditions.push(`pb.location_id = $${idx++}`);
      values.push(location_id);
    }

    conditions.push(`pb.expiry_date <= CURRENT_DATE + interval '1 day' * $1`);

    const result = await query(`
      SELECT
        pb.batch_no,
        COALESCE(ps.location_sku, p.sku) AS sku,
        p.name as product_name,
        l.name as location_name,
        pb.quantity,
        pb.expiry_date,
        CURRENT_DATE as today,
        (pb.expiry_date - CURRENT_DATE) as days_until_expiry
      FROM invex.product_batches pb
      JOIN invex.products p ON pb.product_id = p.id
      JOIN invex.locations l ON pb.location_id = l.id
      LEFT JOIN invex.product_stock ps
        ON ps.product_id = pb.product_id
       AND ps.location_id = pb.location_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY pb.expiry_date ASC
    `, values);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/stock-summary
const getStockSummary = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT 
        l.id as location_id,
        l.name as location_name,
        -- Count unique active products that have a stock record at this location with quantity > 0
        COUNT(DISTINCT p.id) FILTER (WHERE ps.quantity > 0) as total_unique_products,
        -- Sum quantities only for active products
        COALESCE(SUM(ps.quantity) FILTER (WHERE p.id IS NOT NULL), 0) as total_items,
        -- Calculate value only for active products
        COALESCE(SUM(ps.quantity * p.unit_price) FILTER (WHERE p.id IS NOT NULL), 0) as total_value
      FROM invex.active_locations l
      LEFT JOIN invex.product_stock ps ON l.id = ps.location_id
      LEFT JOIN invex.active_products p ON ps.product_id = p.id
      GROUP BY l.id, l.name
      ORDER BY l.name ASC
    `);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
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
    const conditions = [];
    const values = [];
    let idx = 1;

    if (location_id) {
      conditions.push(`sm.location_id = $${idx++}`);
      values.push(location_id);
    }

    values.push(limit);
    const limitParam = idx++;
    values.push(offset);
    const offsetParam = idx++;

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT 
        sm.movement_id,
        sm.movement_date,
        COALESCE(ps.location_sku, p.sku) AS sku,
        p.name as product_name,
        sm.quantity_change,
        l.name as location_name,
        u.username as performed_by,
        sm.source_type,
        sm.notes
      FROM invex.stock_movements sm
      JOIN invex.products p ON sm.product_id = p.id
      JOIN invex.locations l ON sm.location_id = l.id
      LEFT JOIN invex.product_stock ps
        ON ps.product_id = sm.product_id
       AND ps.location_id = sm.location_id
      LEFT JOIN invex.users u ON sm.user_id = u.id
      ${whereClause}
      ORDER BY sm.movement_date DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `, values);

    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
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
