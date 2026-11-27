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
// super_admin only: these handlers do not check the record's location yet (see PROJECT.md).
router.post('/', authorize('super_admin'), asyncHandler(batchController.createBatch));
router.put('/:id', authorize('super_admin'), asyncHandler(batchController.updateBatch));
router.delete('/:id', authorize('super_admin'), asyncHandler(batchController.deleteBatch));

module.exports = router;
