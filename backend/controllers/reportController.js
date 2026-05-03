const { query } = require('../src/config/db');

// GET /api/reports/dashboard
const getDashboardData = async (req, res, next) => {
  try {
    // 1. Total active products
    const totalProductsRes = await query('SELECT COUNT(*) FROM invex.active_products');
    const totalProducts = parseInt(totalProductsRes.rows[0].count, 10);

    // 2. Low stock and Out of stock count
    const stockStatusRes = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE ps.quantity < p.reorder_level AND ps.quantity > 0) as low_stock,
        COUNT(*) FILTER (WHERE ps.quantity = 0) as out_of_stock
      FROM invex.active_products p
      LEFT JOIN invex.product_stock ps ON p.id = ps.product_id
    `);
    const lowStock = parseInt(stockStatusRes.rows[0].low_stock, 10);
    const outOfStock = parseInt(stockStatusRes.rows[0].out_of_stock, 10);

    // 3. Total Inventory Value (unit_price * quantity)
    const valueRes = await query(`
      SELECT COALESCE(SUM(p.unit_price * ps.quantity), 0) as total_value
      FROM invex.active_products p
      JOIN invex.product_stock ps ON p.id = ps.product_id
    `);
    const totalValue = parseFloat(valueRes.rows[0].total_value);

    // 4. Recent Activity (last 5 movements)
    const recentActivityRes = await query(`
      SELECT 
        sm.movement_date,
        p.name as product_name,
        sm.quantity_change,
        sm.source_type,
        u.username as performed_by
      FROM invex.stock_movements sm
      JOIN invex.products p ON sm.product_id = p.id
      LEFT JOIN invex.users u ON sm.user_id = u.id
      ORDER BY sm.movement_date DESC
      LIMIT 5
    `);

    // 5. Stock by Category (for charts)
    const categoryStockRes = await query(`
      SELECT 
        c.name as category_name,
        COALESCE(SUM(ps.quantity), 0) as total_quantity
      FROM invex.categories c
      LEFT JOIN invex.products p ON c.id = p.category_id AND p.is_deleted = FALSE
      LEFT JOIN invex.product_stock ps ON p.id = ps.product_id
      WHERE c.is_deleted = FALSE
      GROUP BY c.name
      ORDER BY total_quantity DESC
    `);

    res.json({
      success: true,
      data: {
        summary: {
          totalProducts,
          lowStock,
          outOfStock,
          totalValue
        },
        recentActivity: recentActivityRes.rows,
        charts: {
          stockByCategory: categoryStockRes.rows
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/low-stock
const getLowStock = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT 
        p.id as product_id,
        p.sku,
        p.name as product_name,
        COALESCE(SUM(ps.quantity), 0) as current_stock,
        p.reorder_level
      FROM invex.active_products p
      LEFT JOIN invex.product_stock ps ON p.id = ps.product_id
      GROUP BY p.id, p.sku, p.name, p.reorder_level
      HAVING COALESCE(SUM(ps.quantity), 0) <= p.reorder_level
      ORDER BY (COALESCE(SUM(ps.quantity), 0) - p.reorder_level) ASC, p.name ASC
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

// GET /api/reports/expiring
const getExpiringBatches = async (req, res, next) => {
  try {
    const daysStr = req.query.days || '30';
    const days = parseInt(daysStr, 10);
    
    const result = await query(`
      SELECT 
        pb.batch_no,
        p.sku,
        p.name as product_name,
        l.name as location_name,
        pb.quantity,
        pb.expiry_date,
        CURRENT_DATE as today,
        (pb.expiry_date - CURRENT_DATE) as days_until_expiry
      FROM invex.product_batches pb
      JOIN invex.active_products p ON pb.product_id = p.id
      JOIN invex.active_locations l ON pb.location_id = l.id
      WHERE pb.is_deleted = FALSE
        AND pb.quantity > 0
        AND pb.expiry_date <= CURRENT_DATE + interval '1 day' * $1
      ORDER BY pb.expiry_date ASC
    `, [days]);

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
        COUNT(DISTINCT ps.product_id) as total_unique_products,
        COALESCE(SUM(ps.quantity), 0) as total_items,
        COALESCE(SUM(ps.quantity * p.unit_price), 0) as total_value
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
        p.sku,
        p.name as product_name,
        sm.quantity_change,
        l.name as location_name,
        u.username as performed_by,
        sm.source_type,
        sm.notes
      FROM invex.stock_movements sm
      JOIN invex.products p ON sm.product_id = p.id
      JOIN invex.locations l ON sm.location_id = l.id
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
