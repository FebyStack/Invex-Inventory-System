require('dotenv').config({ path: './.env' });
const { query, pool } = require('./src/config/db');

async function runTest() {
  try {
    // 1. Insert an order and order_item
    console.log('Inserting order...');
    const orderRes = await query(
      `INSERT INTO invex.orders (order_type, source_location_id, destination_location_id, user_id, status)
       VALUES ('IN', NULL, 1, 1, 'COMPLETED')
       RETURNING id`
    );
    const orderId = orderRes.rows[0].id;

    console.log('Inserting order item...');
    await query(
      `INSERT INTO invex.order_items (order_id, product_id, quantity, unit_price)
       VALUES ($1, 1, 50, 100.00)`,
      [orderId]
    );

    // 2. Insert a stock adjustment
    console.log('Inserting stock adjustment...');
    await query(
      `INSERT INTO invex.stock_adjustments (product_id, location_id, reason_code_id, adjustment_type, quantity, user_id, remarks)
       VALUES (1, 1, 1, 'INCREASE', 10, 1, 'Test adjustment')`
    );

    // 3. Select from stock_movements view
    console.log('Running SELECT on stock_movements view...');
    const res = await query(
      `SELECT * FROM invex.stock_movements WHERE product_id = 1 ORDER BY movement_date DESC LIMIT 5;`
    );
    
    console.log('\n--- STOCK MOVEMENTS ---');
    console.table(res.rows);
    console.log('-----------------------\n');
    
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await pool.end();
  }
}

runTest();
