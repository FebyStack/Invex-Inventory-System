const { pool } = require('../src/config/db');
const orderModel = require('../models/orderModel');
const stockModel = require('../src/models/stockModel');
const { logActivity } = require('../src/utils/logger');

/**
 * GET /api/orders
 */
exports.getAllOrders = async (req, res, next) => {
  try {
    const { order_type, location_id, date_from, date_to } = req.query;
    const orders = await orderModel.getAllOrders({ order_type, location_id, date_from, date_to });
    return res.json({ success: true, data: orders });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/orders/:id
 */
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await orderModel.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    return res.json({ success: true, data: order });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/orders
 * Complex transactional creation of an order and its items.
 */
exports.createOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      order_type,
      source_location_id,
      destination_location_id,
      supplier_id,
      reference_no,
      notes,
      items, // Array of { product_id, quantity, unit_price, batch_no, expiry_date }
    } = req.body;

    if (!order_type || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'order_type and items[] are required.' });
    }

    await client.query('BEGIN');

    // 1. Create the main order record
    const order = await orderModel.createOrder(client, {
      order_type,
      source_location_id,
      destination_location_id,
      supplier_id,
      user_id: req.user.id,
      reference_no,
      notes,
    });

    // 2. Process each item
    for (const item of items) {
      let batchId = null;

      // Handle batch creation for IN orders if expiry tracking is on
      if (order_type === 'IN' && item.batch_no && item.expiry_date) {
        const batch = await orderModel.createBatch(client, {
          product_id: item.product_id,
          location_id: destination_location_id,
          batch_no: item.batch_no,
          quantity: item.quantity,
          expiry_date: item.expiry_date,
        });
        batchId = batch.id;
      }

      // Create order item
      await orderModel.createOrderItem(client, {
        order_id: order.id,
        product_id: item.product_id,
        batch_id: batchId,
        quantity: item.quantity,
        unit_price: item.unit_price,
      });

      // Update stock levels
      if (order_type === 'IN') {
        await stockModel.incrementStock(item.product_id, destination_location_id, item.quantity, client);
      } else if (order_type === 'OUT') {
        await stockModel.decrementStock(item.product_id, source_location_id, item.quantity, client);
      } else if (order_type === 'TRANSFER') {
        // Atomic transfer: out from source, in to destination
        await stockModel.decrementStock(item.product_id, source_location_id, item.quantity, client);
        await stockModel.incrementStock(item.product_id, destination_location_id, item.quantity, client);
      }
    }

    await client.query('COMMIT');

    // Log activity
    void logActivity(req.user.id, `CREATE_${order_type}_ORDER`, 'orders', order.id, {
      reference_no: order.reference_no,
      itemCount: items.length,
    });

    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    await client.query('ROLLBACK');
    // Map specific stock error to 400 Bad Request
    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/orders/:id
 * Only allow updating notes and reference_no.
 */
exports.updateOrder = async (req, res, next) => {
  try {
    const { reference_no, notes } = req.body;
    const updated = await orderModel.updateOrder(req.params.id, { reference_no, notes });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    void logActivity(req.user.id, 'UPDATE_ORDER', 'orders', updated.id, { reference_no });

    return res.json({ success: true, data: updated });
  } catch (error) {
    return next(error);
  }
};

/**
 * DELETE /api/orders/:id
 * Soft delete and REVERSE stock changes.
 */
exports.deleteOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    // Get order and items before deleting
    const order = await orderModel.getOrderById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    await client.query('BEGIN');

    // 1. Reverse the stock logic
    for (const item of order.items) {
      if (order.order_type === 'IN') {
        // Reverse IN: decrement destination
        await stockModel.decrementStock(item.product_id, order.destination_location_id, item.quantity, client);
      } else if (order.order_type === 'OUT') {
        // Reverse OUT: increment source
        await stockModel.incrementStock(item.product_id, order.source_location_id, item.quantity, client);
      } else if (order.order_type === 'TRANSFER') {
        // Reverse TRANSFER: increment source, decrement destination
        await stockModel.incrementStock(item.product_id, order.source_location_id, item.quantity, client);
        await stockModel.decrementStock(item.product_id, order.destination_location_id, item.quantity, client);
      }
    }

    // 2. Soft-delete
    await orderModel.softDeleteOrder(id, client);

    await client.query('COMMIT');

    void logActivity(req.user.id, 'DELETE_ORDER', 'orders', id);

    return res.json({ success: true, message: 'Order deleted and stock reversed successfully.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({ success: false, message: `Cannot delete order: ${error.message}` });
    }
    return next(error);
  } finally {
    client.release();
  }
};
