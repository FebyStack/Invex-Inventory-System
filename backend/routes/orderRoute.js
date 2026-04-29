const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const orderController = require('../controllers/orderController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All order routes require authentication
router.use(authenticate);

// GET    /api/orders              (with filters)
router.get('/', asyncHandler(orderController.getAllOrders));

// GET    /api/orders/:id
router.get('/:id', asyncHandler(orderController.getOrderById));

// POST   /api/orders              (admin only)
router.post('/', authorize('admin'), asyncHandler(orderController.createOrder));

// PUT    /api/orders/:id          (admin only)
router.put('/:id', authorize('admin'), asyncHandler(orderController.updateOrder));

// DELETE /api/orders/:id          (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(orderController.deleteOrder));

module.exports = router;
