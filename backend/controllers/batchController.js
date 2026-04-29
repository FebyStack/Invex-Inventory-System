const batchModel = require('../models/batchModel');
const productModel = require('../models/productModel');
const { logActivity } = require('../src/utils/logger');

/**
 * GET /api/batches
 */
exports.getAllBatches = async (req, res, next) => {
  try {
    const batches = await batchModel.getAllBatches();
    return res.json({ success: true, data: batches });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/batches/expiring
 * Must be declared BEFORE /:id so it doesn't match as an ID.
 */
exports.getExpiringBatches = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const expiring = await batchModel.getExpiringBatches(days);
    return res.json({ success: true, data: expiring });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/batches/:id
 */
exports.getBatchById = async (req, res, next) => {
  try {
    const batch = await batchModel.getBatchById(req.params.id);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }
    return res.json({ success: true, data: batch });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/batches
 */
exports.createBatch = async (req, res, next) => {
  try {
    const { product_id, location_id, batch_no, quantity, expiry_date } = req.body;

    if (!product_id || !location_id || !batch_no || quantity === undefined || !expiry_date) {
      return res.status(400).json({ success: false, message: 'Missing required batch fields.' });
    }

    // Validation: Product must have track_expiry = TRUE
    const product = await productModel.getProductById(product_id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    if (!product.track_expiry) {
      return res.status(400).json({ success: false, message: 'Cannot create batch: Product does not track expiry.' });
    }

    const batch = await batchModel.createBatch({ product_id, location_id, batch_no, quantity, expiry_date });
    void logActivity(req.user.id, 'CREATE_BATCH', 'product_batches', batch.id, { batch_no });

    return res.status(201).json({ success: true, data: batch });
  } catch (error) {
    // Unique constraint violation check
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Batch already exists for this product and location.' });
    }
    return next(error);
  }
};

/**
 * PUT /api/batches/:id
 */
exports.updateBatch = async (req, res, next) => {
  try {
    const { batch_no, quantity, expiry_date } = req.body;
    const updated = await batchModel.updateBatch(req.params.id, { batch_no, quantity, expiry_date });
    
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }

    void logActivity(req.user.id, 'UPDATE_BATCH', 'product_batches', updated.id, { batch_no });
    return res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Another batch with this number already exists.' });
    }
    return next(error);
  }
};

/**
 * DELETE /api/batches/:id
 */
exports.deleteBatch = async (req, res, next) => {
  try {
    const deleted = await batchModel.softDeleteBatch(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Batch not found.' });
    }
    
    void logActivity(req.user.id, 'DELETE_BATCH', 'product_batches', req.params.id);
    return res.json({ success: true, message: 'Batch deleted successfully.' });
  } catch (error) {
    // Prevent deletion if linked to order items or adjustments
    if (error.code === '23503') {
      return res.status(400).json({ success: false, message: 'Cannot delete batch: It is linked to existing orders or adjustments.' });
    }
    return next(error);
  }
};
