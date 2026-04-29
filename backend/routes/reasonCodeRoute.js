const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const reasonCodeController = require('../controllers/reasonCodeController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(reasonCodeController.getAllReasonCodes));
router.get('/:id', asyncHandler(reasonCodeController.getReasonCodeById));
router.post('/', authorize('admin'), asyncHandler(reasonCodeController.createReasonCode));
router.put('/:id', authorize('admin'), asyncHandler(reasonCodeController.updateReasonCode));
router.delete('/:id', authorize('admin'), asyncHandler(reasonCodeController.deleteReasonCode));

module.exports = router;
