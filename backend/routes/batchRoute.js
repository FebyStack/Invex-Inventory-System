const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const batchController = require('../controllers/batchController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(batchController.getAllBatches));
router.get('/expiring', asyncHandler(batchController.getExpiringBatches));
router.get('/:id', asyncHandler(batchController.getBatchById));
router.post('/', authorize('admin'), asyncHandler(batchController.createBatch));
router.put('/:id', authorize('admin'), asyncHandler(batchController.updateBatch));
router.delete('/:id', authorize('admin'), asyncHandler(batchController.deleteBatch));

module.exports = router;
