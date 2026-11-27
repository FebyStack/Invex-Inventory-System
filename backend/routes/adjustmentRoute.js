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

// POST   /api/adjustments           — staff may record adjustments at their
// own location; the controller clamps non-super-admins via the location
// scope check, so staff can't reach other locations even if they try.
router.post('/', authorize('super_admin', 'sub_admin', 'staff'), asyncHandler(adjustmentController.createAdjustment));

// DELETE /api/adjustments/:id       (admin only — reversing stock is risky)
// super_admin only: these handlers do not check the record's location yet (see PROJECT.md).
router.delete('/:id', authorize('super_admin'), asyncHandler(adjustmentController.deleteAdjustment));

module.exports = router;
