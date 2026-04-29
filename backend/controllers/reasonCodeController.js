const reasonCodeModel = require('../models/reasonCodeModel');
const { logActivity } = require('../src/utils/logger');

/**
 * GET /api/reason-codes
 */
exports.getAll = async (req, res, next) => {
  try {
    const codes = await reasonCodeModel.getAll();
    return res.json({ success: true, count: codes.length, data: codes });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/reason-codes/:id
 */
exports.getById = async (req, res, next) => {
  try {
    const code = await reasonCodeModel.getById(req.params.id);
    if (!code) {
      return res.status(404).json({ success: false, message: 'Reason code not found.' });
    }
    return res.json({ success: true, data: code });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/reason-codes
 */
exports.create = async (req, res, next) => {
  try {
    const { code, description, adjustment_type } = req.body;

    if (!code || !description || !adjustment_type) {
      return res.status(400).json({
        success: false,
        message: 'code, description, and adjustment_type are required.',
      });
    }

    if (!['INCREASE', 'DECREASE', 'BOTH'].includes(adjustment_type)) {
      return res.status(400).json({
        success: false,
        message: 'adjustment_type must be INCREASE, DECREASE, or BOTH.',
      });
    }

    const exists = await reasonCodeModel.codeExists(code.toUpperCase());
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'A reason code with this code already exists.',
      });
    }

    const created = await reasonCodeModel.create({
      code: code.toUpperCase(),
      description,
      adjustment_type,
    });

    void logActivity(req.user.id, 'CREATE_REASON_CODE', 'reason_codes', created.id, {
      code: created.code,
    });

    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return next(error);
  }
};

/**
 * DELETE /api/reason-codes/:id
 */
exports.remove = async (req, res, next) => {
  try {
    const deleted = await reasonCodeModel.softDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Reason code not found.' });
    }

    void logActivity(req.user.id, 'DELETE_REASON_CODE', 'reason_codes', deleted.id, {
      code: deleted.code,
    });

    return res.json({ success: true, message: 'Reason code deleted successfully.' });
  } catch (error) {
    return next(error);
  }
};
