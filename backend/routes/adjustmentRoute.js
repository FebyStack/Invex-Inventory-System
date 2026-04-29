const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const adjustmentController = require('../controllers/adjustmentController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(adjustmentController.getAllAdjustments));
router.get('/:id', asyncHandler(adjustmentController.getAdjustmentById));
router.post('/', asyncHandler(adjustmentController.createAdjustment));

module.exports = router;
