const { query, pool } = require('../src/config/db');

exports.getAllOrders = async (req, res) => {
  const result = await query(`
    SELECT o.*, u.username as creator_name,
           sl.name as source_location_name,
           dl.name as destination_location_name,
           s.name as supplier_name
    FROM invex.active_orders o
    JOIN invex.users u ON o.user_id = u.id
    LEFT JOIN invex.locations sl ON o.source_location_id = sl.id
    LEFT JOIN invex.locations dl ON o.destination_location_id = dl.id
    LEFT JOIN invex.suppliers s ON o.supplier_id = s.id
    ORDER BY o.order_date DESC
  `);
  res.json({ success: true, data: result.rows });
};

exports.getOrderById = async (req, res) => {
  const orderRes = await query(`
    SELECT o.*, u.username as creator_name,
           sl.name as source_location_name,
           dl.name as destination_location_name,
           s.name as supplier_name
    FROM invex.active_orders o
    JOIN invex.users u ON o.user_id = u.id
    LEFT JOIN invex.locations sl ON o.source_location_id = sl.id
    LEFT JOIN invex.locations dl ON o.destination_location_id = dl.id
    LEFT JOIN invex.suppliers s ON o.supplier_id = s.id
    WHERE o.id = $1
  `, [req.params.id]);

  if (orderRes.rowCount === 0) return res.status(404).json({ success: false, message: 'Order not found' });

  const itemsRes = await query(`
    SELECT oi.*, p.name as product_name, p.sku
    FROM invex.order_items oi
    JOIN invex.products p ON oi.product_id = p.id
    WHERE oi.order_id = $1 AND oi.is_deleted = FALSE
  `, [req.params.id]);

  res.json({ 
    success: true, 
    data: { 
      ...orderRes.rows[0],
      items: itemsRes.rows
    } 
  });
};

exports.createOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { 
      order_type, source_location_id, destination_location_id, 
      supplier_id, reference_no, notes, items 
    } = req.body;
    const user_id = req.user.id;

    // 1. Create the Order
    const orderRes = await client.query(
      `INSERT INTO invex.orders (order_type, source_location_id, destination_location_id, supplier_id, user_id, reference_no, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [order_type, source_location_id, destination_location_id, supplier_id, user_id, reference_no, notes]
    );
    const orderId = orderRes.rows[0].id;

    // 2. Process Items and Update Stock
    for (const item of items) {
      const { product_id, quantity, unit_price, batch_id } = item;

      // Insert order item
      await client.query(
        `INSERT INTO invex.order_items (order_id, product_id, batch_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, product_id, batch_id, quantity, unit_price]
      );

      // Stock logic
      if (order_type === 'IN') {
        await updateStock(client, product_id, destination_location_id, quantity);
      } else if (order_type === 'OUT') {
        await updateStock(client, product_id, source_location_id, -quantity);
      } else if (order_type === 'TRANSFER') {
        await updateStock(client, product_id, source_location_id, -quantity);
        await updateStock(client, product_id, destination_location_id, quantity);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: orderRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

async function updateStock(client, productId, locationId, qtyChange) {
  // Upsert into product_stock
  const result = await client.query(
    `INSERT INTO invex.product_stock (product_id, location_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id, location_id)
     DO UPDATE SET quantity = invex.product_stock.quantity + $3, last_updated = CURRENT_TIMESTAMP
     RETURNING quantity`,
    [productId, locationId, qtyChange]
  );
  
  if (result.rows[0].quantity < 0) {
    throw new Error(`Insufficient stock for product ID ${productId} at location ID ${locationId}`);
  }
}
