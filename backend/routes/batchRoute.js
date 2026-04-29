const express = require('express');
const router = express.Router();
const batchController = require('../controllers/batchController');
const { protect } = require('../middleware/authMiddleware');

// All batch routes are protected
router.use(protect);

router.get('/', batchController.getAllBatches);
router.get('/expiring', batchController.getExpiringBatches); // Must be before /:id
router.get('/:id', batchController.getBatchById);
router.post('/', batchController.createBatch);
router.put('/:id', batchController.updateBatch);
router.delete('/:id', batchController.deleteBatch);

module.exports = router;
