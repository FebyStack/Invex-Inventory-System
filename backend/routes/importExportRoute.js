const express = require('express');
const router = express.Router();
const importExportController = require('../controllers/importExportController');
const upload = require('../src/middleware/uploadMiddleware');
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// NOTE: this router is mounted at '/api' (see backend/src/app.js) so it
// shares its prefix with every other API route. Using `router.use(authenticate)`
// here would force the auth middleware to run for EVERY /api/* request — even
// ones owned by other routers (e.g. /api/health) — and reject them with 401
// before Express ever tries the next router. Apply auth per-route instead.

// Import Products — two-step flow:
//   POST /import/products         → parse + validate the upload, returns rows
//   POST /import/products/commit  → create products from the reviewed rows
router.post('/import/products', authenticate, authorize('admin'), upload.single('file'), importExportController.importProducts);
router.post('/import/products/commit', authenticate, authorize('admin'), importExportController.commitImportedProducts);

// Export Routes
router.get('/export/products', authenticate, importExportController.exportProducts);
router.get('/export/stock-report', authenticate, importExportController.exportStockReport);
router.get('/export/movement-log', authenticate, importExportController.exportMovementLog);

module.exports = router;
