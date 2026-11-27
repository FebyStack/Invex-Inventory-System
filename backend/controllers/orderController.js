const orderModel = require('../models/orderModel');
const transferModel = require('../models/transferModel');
const stockModel = require('../src/models/stockModel');
const { scopeLocation } = require('../src/utils/locationScope');
const { logActivity } = require('../src/utils/logger');
const { withTransaction } = require('../src/utils/transaction');
const notificationService = require('../services/notificationService');

const ORDER_REF_PREFIX = {
  IN: 'IN',
  OUT: 'OUT',
  TRANSFER: 'TRF',
};

const buildGeneratedReference = (orderType, orderId, itemSkuRefs) => {
  const prefix = ORDER_REF_PREFIX[orderType] || 'ORD';
  const compactSku = String(itemSkuRefs[0] || `ORD-${orderId}`)
    .replace(/[^A-Z0-9-]/gi, '')
    .toUpperCase();
  const multiSuffix = itemSkuRefs.length > 1 ? `+${itemSkuRefs.length - 1}` : '';
  const idSuffix = String(orderId).padStart(5, '0');
  return `${prefix}-${compactSku}${multiSuffix}-${idSuffix}`.slice(0, 50);
};

/**
 * GET /api/orders
 */
exports.getAllOrders = async (req, res, next) => {
  try {
    const { order_type, date_from, date_to } = req.query;
    const scope = scopeLocation(req, res, req.query.location_id);
    if (!scope) return;
    const orders = await orderModel.getAllOrders({
      order_type,
      location_id: scope.locationId,
      date_from,
      date_to,
    });
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

    if (!stockModel.ORDER_TYPES.includes(order_type)) {
      return res.status(400).json({ success: false, message: 'order_type must be IN, OUT, or TRANSFER.' });
    }

    if (order_type === 'IN' && !destination_location_id) {
      return res.status(400).json({ success: false, message: 'destination_location_id is required for stock-in orders.' });
    }

    if (order_type === 'OUT' && !source_location_id) {
      return res.status(400).json({ success: false, message: 'source_location_id is required for stock-out orders.' });
    }

    if (order_type === 'TRANSFER' && (!source_location_id || !destination_location_id)) {
      return res.status(400).json({ success: false, message: 'source_location_id and destination_location_id are required for transfers.' });
    }

    // Non-super-admins can only create orders touching their own location.
    // For TRANSFER it's enough that one side is theirs (they're routing
    // stock to/from their warehouse).
    if (req.user.role !== 'super_admin') {
      const ownLoc = req.user.location_id;
      if (ownLoc == null) {
        return res.status(403).json({ success: false, code: 'NO_LOCATION_ASSIGNMENT', message: 'Your account has no location assigned yet.' });
      }
      const touches = [source_location_id, destination_location_id]
        .filter((v) => v != null)
        .map((v) => parseInt(v, 10));
      const hasOwn = touches.includes(ownLoc);
      if (!hasOwn) {
        return res.status(403).json({
          success: false,
          code: 'LOCATION_FORBIDDEN',
          message: 'You can only create orders that involve your assigned location.',
        });
      }
    }

    const order = await withTransaction(async (client) => {
      // 1. Create the main order record
      const created = await orderModel.createOrder(client, {
        order_type,
        source_location_id,
        destination_location_id,
        supplier_id,
        user_id: req.user.id,
        reference_no,
        notes,
      });

      // 2. Process each item
      const itemSkuRefs = [];
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
          order_id: created.id,
          product_id: item.product_id,
          batch_id: batchId,
          quantity: item.quantity,
          unit_price: item.unit_price,
        });

        // Update stock levels (what each order type does to stock: stockModel.MOVEMENTS)
        const stock = await stockModel.applyMovement(client, order_type, {
          productId: item.product_id,
          from: source_location_id,
          to: destination_location_id,
          qty: item.quantity,
        });
        itemSkuRefs.push(stock.location_sku);

        if (order_type === 'TRANSFER') {
          // Record in location_transfer_logs for centralized transfer history
          await transferModel.insertTransferLog(client, {
            from_location_id: source_location_id,
            to_location_id: destination_location_id,
            product_id: item.product_id,
            batch_id: batchId,
            quantity: item.quantity,
            transferred_by: req.user.id,
            notes: `Order ${created.reference_no || created.id} transfer`,
          });
        }
      }

      if (!created.reference_no) {
        const generatedReference = buildGeneratedReference(order_type, created.id, itemSkuRefs.filter(Boolean));
        const updatedRef = await orderModel.updateOrderReference(client, created.id, generatedReference);
        created.reference_no = updatedRef?.reference_no || generatedReference;
      }

      return created;
    });

    void logActivity(req.user.id, `CREATE_${order_type}_ORDER`, 'orders', order.id, {
      reference_no: order.reference_no,
      itemCount: items.length,
    });

    // Trigger notification scan for any new low-stock items
    notificationService.requestScan();

    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    // Map specific stock error to 400 Bad Request
    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
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
  try {
    const { id } = req.params;

    // Get order and items before deleting
    const order = await orderModel.getOrderById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    await withTransaction(async (client) => {
      // 1. Undo each item's stock movement
      for (const item of order.items) {
        await stockModel.applyMovement(client, order.order_type, {
          productId: item.product_id,
          from: order.source_location_id,
          to: order.destination_location_id,
          qty: item.quantity,
        }, { reverse: true });
      }

      // 2. Soft-delete
      await orderModel.softDeleteOrder(id, client);
    });

    void logActivity(req.user.id, 'DELETE_ORDER', 'orders', id);

    // Trigger notification scan for any newly low-stock items after deletion/reversal
    notificationService.requestScan();

    return res.json({ success: true, message: 'Order deleted and stock reversed successfully.' });
  } catch (error) {
    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({ success: false, message: `Cannot delete order: ${error.message}` });
    }
    return next(error);
  }
};
