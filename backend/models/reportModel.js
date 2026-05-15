const { query } = require('../src/config/db');

/**
 * Active product count plus how many were added in the last 7 days.
 */
const getTotalProducts = async () => {
  const result = await query(`
    SELECT
      COUNT(*)::int                                                          AS total,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int   AS added_7d
    FROM invex.active_products
  `);
  return result.rows[0];
};

/**
 * Unique product counts for low-stock (qty > 0 but <= reorder_level) and
 * out-of-stock (qty = 0), summed across all locations.
 */
const getStockStatusCounts = async () => {
  const result = await query(`
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
  return result.rows[0];
};

/**
 * Total inventory value across all stocked locations.
 */
const getTotalInventoryValue = async () => {
  const result = await query(`
    SELECT COALESCE(SUM(p.unit_price * ps.quantity), 0)::numeric AS total_value
    FROM invex.active_products p
    JOIN invex.product_stock ps ON p.id = ps.product_id
  `);
  return parseFloat(result.rows[0].total_value);
};

/**
 * Count of active locations.
 */
const getActiveLocationsCount = async () => {
  const result = await query(`
    SELECT COUNT(*)::int AS total FROM invex.active_locations
  `);
  return result.rows[0].total;
};

/**
 * Orders placed this week vs last week, for delta calculations.
 */
const getOrdersWeekComparison = async () => {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE order_date >= NOW() - INTERVAL '7 days')::int                                                 AS this_week,
      COUNT(*) FILTER (WHERE order_date >= NOW() - INTERVAL '14 days' AND order_date < NOW() - INTERVAL '7 days')::int     AS last_week
    FROM invex.active_orders
  `);
  return result.rows[0];
};

/**
 * Latest stock movements (orders + adjustments + transfers), most recent first.
 */
const getRecentActivity = async (limit = 8) => {
  const result = await query(
    `SELECT
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
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

/**
 * Stock totals grouped by category — only categories with non-zero stock.
 */
const getStockByCategory = async () => {
  const result = await query(`
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
  return result.rows;
};

/**
 * Daily in/out stock-movement series for the last `days` days. Uses
 * generate_series so zero-activity days still appear with zeros.
 */
const getStockMovementSeries = async (days) => {
  const result = await query(
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
  return result.rows;
};

/**
 * Per-location low-stock rows. If `location_id` is supplied, the result is
 * scoped to that location; otherwise it spans every location. Skips
 * phantom auto-seeded stock rows (location_sku IS NULL).
 */
const getLowStock = async ({ location_id } = {}) => {
  const values = [];
  let locationFilter = '';

  if (location_id) {
    locationFilter = 'AND ps.location_id = $1';
    values.push(location_id);
  }

  const result = await query(`
    SELECT
      p.id   AS product_id,
      COALESCE(ps.location_sku, p.sku) AS sku,
      p.name AS product_name,
      l.name AS location_name,
      ps.quantity::int AS current_stock,
      p.reorder_level
    FROM invex.active_products p
    JOIN invex.product_stock ps
      ON p.id = ps.product_id
     AND ps.location_sku IS NOT NULL
     ${locationFilter}
    JOIN invex.locations l
      ON l.id = ps.location_id
     AND l.is_deleted = FALSE
    WHERE p.reorder_level > 0
      AND ps.quantity <= p.reorder_level
    ORDER BY (ps.quantity - p.reorder_level) ASC, p.name ASC
  `, values);
  return result.rows;
};

/**
 * Batches expiring within `days` days. Optionally scoped to a location.
 */
const getExpiringBatches = async ({ days, location_id } = {}) => {
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
  return result.rows;
};

/**
 * Per-location summary: distinct products with stock, total items, total value.
 */
const getStockSummary = async () => {
  const result = await query(`
    SELECT
      l.id as location_id,
      l.name as location_name,
      COUNT(DISTINCT p.id) FILTER (WHERE ps.quantity > 0) as total_unique_products,
      COALESCE(SUM(ps.quantity) FILTER (WHERE p.id IS NOT NULL), 0) as total_items,
      COALESCE(SUM(ps.quantity * p.unit_price) FILTER (WHERE p.id IS NOT NULL), 0) as total_value
    FROM invex.active_locations l
    LEFT JOIN invex.product_stock ps ON l.id = ps.location_id
    LEFT JOIN invex.active_products p ON ps.product_id = p.id
    GROUP BY l.id, l.name
    ORDER BY l.name ASC
  `);
  return result.rows;
};

/**
 * Stock movement log (orders, adjustments, transfers). Paged via
 * `limit` / `offset`; can be scoped to a location.
 */
const getMovementLog = async ({ limit = 100, offset = 0, location_id } = {}) => {
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
  return result.rows;
};

/**
 * Wide product export. Optionally scoped to a location (joins product_stock).
 */
const exportProducts = async ({ location_id } = {}) => {
  const values = [];
  let whereClause = '';
  let joinClause = '';

  if (location_id) {
    joinClause = 'JOIN invex.product_stock ps ON p.id = ps.product_id';
    whereClause = 'WHERE ps.location_id = $1';
    values.push(location_id);
  }

  const result = await query(`
    SELECT
      p.id, p.name, p.sku,
      c.name as category_name,
      s.name as supplier_name,
      p.unit_price, p.reorder_level,
      p.track_expiry, p.unit_of_measure,
      p.created_at
    FROM invex.active_products p
    LEFT JOIN invex.categories c ON p.category_id = c.id
    LEFT JOIN invex.suppliers s ON p.supplier_id = s.id
    ${joinClause}
    ${whereClause}
    ORDER BY p.id ASC
  `, values);
  return result.rows;
};

/**
 * Per-location stock report with status labels. Skips phantom auto-seeded
 * rows that have no quantity and no location_sku.
 */
const exportStockReport = async ({ location_id } = {}) => {
  const values = [];
  let scope = '';

  if (location_id) {
    scope = `AND ps.location_id = $1`;
    values.push(location_id);
  }

  const result = await query(`
    SELECT
      COALESCE(ps.location_sku, p.sku) AS sku,
      p.name as product_name,
      l.name as location_name,
      ps.quantity as current_stock,
      p.reorder_level,
      CASE WHEN ps.quantity < p.reorder_level THEN 'LOW STOCK' ELSE 'OK' END as status,
      ps.last_updated
    FROM invex.product_stock ps
    JOIN invex.active_products p ON ps.product_id = p.id
    JOIN invex.active_locations l ON ps.location_id = l.id
    WHERE (ps.quantity > 0 OR ps.location_sku IS NOT NULL)
      ${scope}
    ORDER BY l.name ASC, p.name ASC
  `, values);
  return result.rows;
};

/**
 * Full movement log for export (no pagination). Optionally scoped to a location.
 */
const exportMovementLog = async ({ location_id } = {}) => {
  const values = [];
  let whereClause = '';

  if (location_id) {
    whereClause = 'WHERE sm.location_id = $1';
    values.push(location_id);
  }

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
  `, values);
  return result.rows;
};

module.exports = {
  getTotalProducts,
  getStockStatusCounts,
  getTotalInventoryValue,
  getActiveLocationsCount,
  getOrdersWeekComparison,
  getRecentActivity,
  getStockByCategory,
  getStockMovementSeries,
  getLowStock,
  getExpiringBatches,
  getStockSummary,
  getMovementLog,
  exportProducts,
  exportStockReport,
  exportMovementLog,
};
