const { query, pool } = require('../src/config/db');

exports.getAllAdjustments = async (req, res) => {
  const result = await query(`
    SELECT sa.*, p.name as product_name, l.name as location_name, rc.code as reason_code, u.username as creator_name
    FROM invex.stock_adjustments sa
    JOIN invex.products p ON sa.product_id = p.id
    JOIN invex.locations l ON sa.location_id = l.id
    JOIN invex.reason_codes rc ON sa.reason_code_id = rc.id
    JOIN invex.users u ON sa.user_id = u.id
    WHERE sa.is_deleted = FALSE
    ORDER BY sa.adjustment_date DESC
  `);
  res.json({ success: true, data: result.rows });
};

exports.getAdjustmentById = async (req, res) => {
  const result = await query(`
    SELECT sa.*, p.name as product_name, l.name as location_name, rc.code as reason_code, u.username as creator_name
    FROM invex.stock_adjustments sa
    JOIN invex.products p ON sa.product_id = p.id
    JOIN invex.locations l ON sa.location_id = l.id
    JOIN invex.reason_codes rc ON sa.reason_code_id = rc.id
    JOIN invex.users u ON sa.user_id = u.id
    WHERE sa.id = $1 AND sa.is_deleted = FALSE
  `, [req.params.id]);
  
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Adjustment not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.createAdjustment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes } = req.body;
    const user_id = req.user.id;

    // 1. Create Adjustment record
    const adjRes = await client.query(
      `INSERT INTO invex.stock_adjustments (product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes, user_id]
    );

    // 2. Update Stock
    const qty = adjustment_type === 'INCREASE' ? quantity_change : -quantity_change;
    
    const stockResult = await client.query(
      `INSERT INTO invex.product_stock (product_id, location_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET quantity = invex.product_stock.quantity + $3, last_updated = CURRENT_TIMESTAMP
       RETURNING quantity`,
      [product_id, location_id, qty]
    );

    if (stockResult.rows[0].quantity < 0) {
      throw new Error(`Insufficient stock for product ID ${product_id} at location ID ${location_id} to perform decrease.`);
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: adjRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
