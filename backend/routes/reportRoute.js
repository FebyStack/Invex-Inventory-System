const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Protect all routes
router.use(authenticate);

// Reports API
router.get('/dashboard', reportController.getDashboardData);
router.get('/low-stock', reportController.getLowStock);
router.get('/expiring', reportController.getExpiringBatches);
router.get('/stock-summary', reportController.getStockSummary);
router.get('/movement-log', reportController.getMovementLog);

module.exports = router;
