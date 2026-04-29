const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const adjustmentController = require('../controllers/adjustmentController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

// GET    /api/adjustments
router.get('/', asyncHandler(adjustmentController.getAllAdjustments));

// GET    /api/adjustments/:id
router.get('/:id', asyncHandler(adjustmentController.getAdjustmentById));

// POST   /api/adjustments           (admin only)
router.post('/', authorize('admin'), asyncHandler(adjustmentController.createAdjustment));

// DELETE /api/adjustments/:id       (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(adjustmentController.deleteAdjustment));

module.exports = router;
