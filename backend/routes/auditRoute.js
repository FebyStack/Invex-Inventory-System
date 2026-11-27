const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const auditController = require('../controllers/auditController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All audit log routes require authentication
router.use(authenticate);

// GET /api/audit-logs (Restricted to super_admin and admin)
router.get(
  '/',
  authorize('super_admin', 'admin'),
  asyncHandler(auditController.getAuditLogs)
);

module.exports = router;
