const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const transferController = require('../controllers/transferController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

// GET    /api/transfers
router.get('/', asyncHandler(transferController.getAllTransfers));

// GET    /api/transfers/:id
router.get('/:id', asyncHandler(transferController.getTransferById));

// POST   /api/transfers
router.post('/', asyncHandler(transferController.createTransfer));

// DELETE /api/transfers/:id       (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(transferController.deleteTransfer));

module.exports = router;
