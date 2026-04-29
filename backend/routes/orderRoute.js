const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const orderController = require('../controllers/orderController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(orderController.getAllOrders));
router.get('/:id', asyncHandler(orderController.getOrderById));
router.post('/', asyncHandler(orderController.createOrder));

module.exports = router;
