const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const ctrl = require('../controllers/activityLogController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// Admin-only audit trail viewer. Staff cannot access these endpoints.
router.use(authenticate);
router.use(authorize('admin'));

router.get('/', asyncHandler(ctrl.list));
router.get('/facets', asyncHandler(ctrl.facets));

module.exports = router;
