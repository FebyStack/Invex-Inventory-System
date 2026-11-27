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

// POST   /api/orders              — staff may file orders involving their
// assigned location (e.g. receiving an IN order at their warehouse). The
// controller's location guard rejects any order that doesn't touch the
// caller's location, so staff can't move stock between strangers' sites.
router.post('/', authorize('super_admin', 'sub_admin', 'staff'), asyncHandler(orderController.createOrder));

// PUT    /api/orders/:id          (admin only — back-dating refs / notes
//                                  on completed orders is an audit-trail
//                                  concern, kept off-limits for staff)
// super_admin only: these handlers do not check the record's location yet (see PROJECT.md).
router.put('/:id', authorize('super_admin'), asyncHandler(orderController.updateOrder));

// DELETE /api/orders/:id          (admin only — reversing stock is risky)
router.delete('/:id', authorize('super_admin'), asyncHandler(orderController.deleteOrder));

module.exports = router;
