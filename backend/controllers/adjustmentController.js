const { pool } = require('../src/config/db');
const adjustmentModel = require('../models/adjustmentModel');
const reasonCodeModel = require('../models/reasonCodeModel');
const stockModel = require('../src/models/stockModel');
const { logActivity } = require('../src/utils/logger');

/**
 * GET /api/adjustments
 */
exports.getAllAdjustments = async (req, res, next) => {
  try {
    const { product_id, location_id, adjustment_type } = req.query;
    const adjustments = await adjustmentModel.getAllAdjustments({ product_id, location_id, adjustment_type });
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
  const client = await pool.connect();
  try {
    const { product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes } = req.body;

    // --- Validation ---
    if (!product_id || !location_id || !adjustment_type || !quantity_change || !reason_code_id) {
      return res.status(400).json({
        success: false,
        message: 'product_id, location_id, adjustment_type, quantity_change, and reason_code_id are required.',
      });
    }

    if (!['INCREASE', 'DECREASE'].includes(adjustment_type)) {
      return res.status(400).json({
        success: false,
        message: 'adjustment_type must be INCREASE or DECREASE.',
      });
    }

    if (quantity_change <= 0) {
      return res.status(400).json({
        success: false,
        message: 'quantity_change must be greater than 0.',
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
    await client.query('BEGIN');

    // 1. Insert adjustment record
    const adjustment = await adjustmentModel.createAdjustment(client, {
      product_id,
      location_id,
      batch_id,
      adjustment_type,
      quantity_change,
      reason_code_id,
      notes,
      user_id: req.user.id,
    });

    // 2. Update product_stock
    if (adjustment_type === 'INCREASE') {
      await stockModel.incrementStock(product_id, location_id, quantity_change, client);
    } else {
      await stockModel.decrementStock(product_id, location_id, quantity_change, client);
    }

    await client.query('COMMIT');

    // Log activity
    void logActivity(req.user.id, `STOCK_${adjustment_type}`, 'stock_adjustments', adjustment.id, {
      product_id,
      location_id,
      quantity_change,
      reason: reasonCode.code,
    });

    return res.status(201).json({ success: true, data: adjustment });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/adjustments/:id
 * Soft-delete and reverse the stock change.
 */
exports.deleteAdjustment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Check exists
    const existing = await adjustmentModel.getAdjustmentById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Adjustment not found.' });
    }

    await client.query('BEGIN');

    // 1. Soft-delete
    const deleted = await adjustmentModel.softDeleteAdjustment(id, client);

    // 2. Reverse stock
    if (deleted.adjustment_type === 'INCREASE') {
      await stockModel.decrementStock(deleted.product_id, deleted.location_id, deleted.quantity_change, client);
    } else {
      await stockModel.incrementStock(deleted.product_id, deleted.location_id, deleted.quantity_change, client);
    }

    await client.query('COMMIT');

    void logActivity(req.user.id, 'DELETE_ADJUSTMENT', 'stock_adjustments', deleted.id);

    return res.json({ success: true, message: 'Adjustment deleted and stock reversed.' });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
};

/**
 * GET /api/products/:id/history
 * Returns the full movement ledger for a product.
 */
exports.getProductHistory = async (req, res, next) => {
  try {
    const history = await adjustmentModel.getProductHistory(req.params.id, req.query.location_id);
    return res.json({ success: true, count: history.length, data: history });
  } catch (error) {
    return next(error);
  }
};
