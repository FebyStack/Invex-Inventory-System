const { query } = require('../src/config/db');

/**
 * Create a new order.
 * @param {Object} client - DB client (for transactions)
 * @param {Object} data - Order data
 */
const createOrder = async (client, { order_type, source_location_id, destination_location_id, supplier_id, user_id, reference_no, notes }) => {
  const result = await client.query(
    `INSERT INTO invex.orders (order_type, source_location_id, destination_location_id, supplier_id, user_id, reference_no, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, order_type, source_location_id, destination_location_id, supplier_id, user_id, reference_no, notes, order_date`,
    [order_type, source_location_id || null, destination_location_id || null, supplier_id || null, user_id, reference_no || null, notes || null]
  );
  return result.rows[0];
};

/**
 * Create a new order item.
 * @param {Object} client - DB client
 * @param {Object} data - Item data
 */
const createOrderItem = async (client, { order_id, product_id, batch_id, quantity, unit_price }) => {
  const result = await client.query(
    `INSERT INTO invex.order_items (order_id, product_id, batch_id, quantity, unit_price)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, order_id, product_id, batch_id, quantity, unit_price`,
    [order_id, product_id, batch_id || null, quantity, unit_price]
  );
  return result.rows[0];
};

/**
 * Create or update a product batch (UPSERT) for IN orders.
 */
const createBatch = async (client, { product_id, location_id, batch_no, quantity, expiry_date }) => {
  const result = await client.query(
    `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (product_id, location_id, batch_no) 
     DO UPDATE SET 
       quantity = invex.product_batches.quantity + EXCLUDED.quantity,
       expiry_date = EXCLUDED.expiry_date
     RETURNING id, batch_no, expiry_date`,
    [product_id, location_id, batch_no, quantity, expiry_date]
  );
  return result.rows[0];
};

/**
 * Get all orders with optional filters.
 */
const getAllOrders = async ({ order_type, location_id, date_from, date_to }) => {
  let sql = `
    SELECT o.id, o.order_type, o.order_date, o.reference_no, o.notes,
           sl.name AS source_name, dl.name AS destination_name,
           u.full_name AS created_by
    FROM invex.orders o
    LEFT JOIN invex.locations sl ON o.source_location_id = sl.id
    LEFT JOIN invex.locations dl ON o.destination_location_id = dl.id
    JOIN invex.users u ON o.user_id = u.id
    WHERE o.is_deleted = FALSE
  `;
  const values = [];
  let idx = 1;

  if (order_type) {
    sql += ` AND o.order_type = $${idx++}`;
    values.push(order_type);
  }

  if (location_id) {
    sql += ` AND (o.source_location_id = $${idx} OR o.destination_location_id = $${idx})`;
    values.push(location_id);
    idx++;
  }

  if (date_from) {
    sql += ` AND o.order_date >= $${idx++}`;
    values.push(date_from);
  }

  if (date_to) {
    sql += ` AND o.order_date <= $${idx++}`;
    values.push(date_to);
  }

  sql += ` ORDER BY o.order_date DESC`;

  const result = await query(sql, values);
  return result.rows;
};

/**
 * Get order details by ID, including items.
 */
const getOrderById = async (id) => {
  // Get order row
  const orderRes = await query(
    `SELECT o.*, sl.name AS source_name, dl.name AS destination_name, sup.name AS supplier_name, u.full_name AS created_by
     FROM invex.orders o
     LEFT JOIN invex.locations sl ON o.source_location_id = sl.id
     LEFT JOIN invex.locations dl ON o.destination_location_id = dl.id
     LEFT JOIN invex.suppliers sup ON o.supplier_id = sup.id
     JOIN invex.users u ON o.user_id = u.id
     WHERE o.id = $1 AND o.is_deleted = FALSE`,
    [id]
  );

  if (orderRes.rowCount === 0) return null;

  const order = orderRes.rows[0];

  // Get items
  const itemsRes = await query(
    `SELECT oi.*, p.name AS product_name, p.sku
     FROM invex.order_items oi
     JOIN invex.products p ON oi.product_id = p.id
     WHERE oi.order_id = $1 AND oi.is_deleted = FALSE`,
    [id]
  );

  order.items = itemsRes.rows;
  return order;
};

/**
 * Update order notes and reference_no.
 */
const updateOrder = async (id, { reference_no, notes }) => {
  const result = await query(
    `UPDATE invex.orders
     SET reference_no = COALESCE($1, reference_no),
         notes = COALESCE($2, notes)
     WHERE id = $3 AND is_deleted = FALSE
     RETURNING id, reference_no, notes`,
    [reference_no || null, notes || null, id]
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete an order.
 */
const softDeleteOrder = async (id, client) => {
  const executeQuery = client ? client.query.bind(client) : query;

  const result = await executeQuery(
    `UPDATE invex.orders SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, order_type, source_location_id, destination_location_id`,
    [id]
  );

  if (result.rowCount === 0) return null;

  // Also soft-delete items
  await executeQuery(
    `UPDATE invex.order_items SET is_deleted = TRUE
     WHERE order_id = $1`,
    [id]
  );

  return result.rows[0];
};

/**
 * Get all active items for an order.
 */
const getOrderItems = async (orderId) => {
  const result = await query(
    `SELECT * FROM invex.order_items WHERE order_id = $1 AND is_deleted = FALSE`,
    [orderId]
  );
  return result.rows;
};

module.exports = {
  createOrder,
  createOrderItem,
  createBatch,
  getAllOrders,
  getOrderById,
  updateOrder,
  softDeleteOrder,
  getOrderItems,
};
