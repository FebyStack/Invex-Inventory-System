const express = require('express');
const router = express.Router();
const importExportController = require('../controllers/importExportController');
const upload = require('../src/middleware/uploadMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Protect all routes
router.use(authenticate);

// Import Products
router.post('/import/products', authorize('admin'), upload.single('file'), importExportController.importProducts);

// Export Routes
router.get('/export/products', importExportController.exportProducts);
router.get('/export/stock-report', importExportController.exportStockReport);
router.get('/export/movement-log', importExportController.exportMovementLog);

module.exports = router;
