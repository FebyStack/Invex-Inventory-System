const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const reasonCodeController = require('../controllers/reasonCodeController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

// GET    /api/reason-codes
router.get('/', asyncHandler(reasonCodeController.getAll));

// GET    /api/reason-codes/:id
router.get('/:id', asyncHandler(reasonCodeController.getById));

// POST   /api/reason-codes          (admin only)
router.post('/', authorize('admin'), asyncHandler(reasonCodeController.create));

// DELETE /api/reason-codes/:id      (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(reasonCodeController.remove));

module.exports = router;
