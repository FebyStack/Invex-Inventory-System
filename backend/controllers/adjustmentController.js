const adjustmentModel = require('../models/adjustmentModel');
const productModel = require('../models/productModel');
const reasonCodeModel = require('../models/reasonCodeModel');
const stockModel = require('../src/models/stockModel');
const { scopeLocation } = require('../src/utils/locationScope');
const { logActivity } = require('../src/utils/logger');
const { withTransaction } = require('../src/utils/transaction');
const notificationService = require('../services/notificationService');

/**
 * GET /api/adjustments
 */
exports.getAllAdjustments = async (req, res, next) => {
  try {
    const { product_id, adjustment_type } = req.query;
    const scope = scopeLocation(req, res, req.query.location_id);
    if (!scope) return;
    const adjustments = await adjustmentModel.getAllAdjustments({
      product_id,
      location_id: scope.locationId,
      adjustment_type,
    });
    return res.json({ success: true, count: adjustments.length, data: adjustments });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/adjustments/:id
 */
exports.getAdjustmentById = async (req, res, next) => {
  try {
    const adjustment = await adjustmentModel.getAdjustmentById(req.params.id);
    if (!adjustment) {
      return res.status(404).json({ success: false, message: 'Adjustment not found.' });
    }
    return res.json({ success: true, data: adjustment });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/adjustments
 * Strict validation + transactional stock update.
 */
exports.createAdjustment = async (req, res, next) => {
  try {
    const { product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes } = req.body;

    // --- Validation ---
    if (!product_id || !location_id || !adjustment_type || !quantity_change || !reason_code_id) {
      return res.status(400).json({
        success: false,
        message: 'product_id, location_id, adjustment_type, quantity_change, and reason_code_id are required.',
      });
    }

    if (!stockModel.ADJUSTMENT_TYPES.includes(adjustment_type)) {
      return res.status(400).json({
        success: false,
        message: 'adjustment_type must be INCREASE, DECREASE, or TRANSFER.',
      });
    }

    const { to_location_id } = req.body;
    if (adjustment_type === 'TRANSFER' && !to_location_id) {
      return res.status(400).json({
        success: false,
        message: 'to_location_id is required for transfers.',
      });
    }

    if (adjustment_type === 'TRANSFER' && String(location_id) === String(to_location_id)) {
      return res.status(400).json({
        success: false,
        message: 'Source and destination locations must be different.',
      });
    }

    // Lock non-super-admins to their assigned location. For a TRANSFER it's
    // enough that one side is theirs.
    if (req.user.role !== 'super_admin') {
      const ownLoc = req.user.location_id;
      if (ownLoc == null) {
        return res.status(403).json({ success: false, code: 'NO_LOCATION_ASSIGNMENT', message: 'Your account has no location assigned yet.' });
      }
      const fromInt = parseInt(location_id, 10);
      const toInt = adjustment_type === 'TRANSFER' ? parseInt(to_location_id, 10) : null;
      const touchesOwn = fromInt === ownLoc || toInt === ownLoc;
      if (!touchesOwn) {
        return res.status(403).json({
          success: false,
          code: 'LOCATION_FORBIDDEN',
          message: 'You can only adjust stock for your assigned location.',
        });
      }
    }

    const qty = Number(quantity_change);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'quantity_change must be a positive integer.',
      });
    }

    // Validate reason code exists and is not soft-deleted
    const reasonCode = await reasonCodeModel.getById(reason_code_id);
    if (!reasonCode) {
      return res.status(400).json({
        success: false,
        message: 'Reason code not found or has been deleted.',
      });
    }

    // Validate adjustment_type matches what the reason code allows
    if (reasonCode.adjustment_type !== 'BOTH' && reasonCode.adjustment_type !== adjustment_type) {
      return res.status(400).json({
        success: false,
        message: `Reason code "${reasonCode.code}" only allows ${reasonCode.adjustment_type} adjustments, but you requested ${adjustment_type}.`,
      });
    }

    // --- Transaction ---
    const { adjustment, productName } = await withTransaction(async (client) => {
      // 1. Insert adjustment record
      const created = await adjustmentModel.createAdjustment(client, {
        product_id,
        location_id,
        to_location_id: adjustment_type === 'TRANSFER' ? to_location_id : null,
        batch_id,
        adjustment_type,
        quantity_change: qty,
        reason_code_id,
        notes,
        user_id: req.user.id,
      });

      // Get product name for logging
      const name = (await productModel.getProductName(product_id, client)) || `Product #${product_id}`;

      // 2. Update product_stock (what each adjustment type does to stock: stockModel.MOVEMENTS)
      await stockModel.applyMovement(client, adjustment_type, {
        productId: product_id,
        from: location_id,
        to: to_location_id,
        qty,
      });

      return { adjustment: created, productName: name };
    });

    // Log activity
    void logActivity(req.user.id, `STOCK_${adjustment_type}`, 'stock_adjustments', adjustment.id, {
      product_id,
      product_name: productName,
      location_id,
      to_location_id: adjustment_type === 'TRANSFER' ? to_location_id : null,
      quantity_change: qty,
      reason: reasonCode.code,
    });

    // Trigger notification scan
    notificationService.requestScan();

    return res.status(201).json({ success: true, data: adjustment });
  } catch (error) {
    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

/**
 * DELETE /api/adjustments/:id
 * Soft-delete and reverse the stock change.
 */
exports.deleteAdjustment = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check exists
    const existing = await adjustmentModel.getAdjustmentById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Adjustment not found.' });
    }

    const deleted = await withTransaction(async (client) => {
      // 1. Soft-delete
      const row = await adjustmentModel.softDeleteAdjustment(id, client);

      // 2. Undo its stock movement
      await stockModel.applyMovement(client, row.adjustment_type, {
        productId: row.product_id,
        from: row.location_id,
        to: row.to_location_id,
        qty: row.quantity_change,
      }, { reverse: true });

      return row;
    });

    void logActivity(req.user.id, 'DELETE_ADJUSTMENT', 'stock_adjustments', deleted.id);

    // Trigger notification scan after reversal
    notificationService.requestScan();

    return res.json({ success: true, message: 'Adjustment deleted and stock reversed.' });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/products/:id/history
 * Returns the full movement ledger for a product.
 */
exports.getProductHistory = async (req, res, next) => {
  try {
    const scope = scopeLocation(req, res, req.query.location_id);
    if (!scope) return;
    const history = await adjustmentModel.getProductHistory(req.params.id, scope.locationId);
    return res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    return next(error);
  }
};
