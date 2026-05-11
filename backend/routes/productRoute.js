const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const productController = require('../controllers/productController');
const adjustmentController = require('../controllers/adjustmentController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All product routes require authentication
router.use(authenticate);

// GET    /api/products              (with optional ?search, ?category_id, ?supplier_id)
router.get('/', asyncHandler(productController.getAllProducts));

// GET    /api/products/next-sku     (generated SKU for a location)
router.get('/next-sku', asyncHandler(productController.getNextSku));

// GET    /api/products/:id
router.get('/:id', asyncHandler(productController.getProductById));

// GET    /api/products/:id/stock    (stock levels per location)
router.get('/:id/stock', asyncHandler(productController.getProductStock));

// GET    /api/products/:id/history  (full movement ledger from stock_movements view)
router.get('/:id/history', asyncHandler(adjustmentController.getProductHistory));

// POST   /api/products              (admin only)
router.post('/', authorize('admin'), asyncHandler(productController.createProduct));

// PUT    /api/products/:id        (admin only)
router.put('/:id', authorize('admin'), asyncHandler(productController.updateProduct));

// POST   /api/products/:id/set-stock   (admin only)
// Translates a target total quantity into an INCREASE/DECREASE adjustment.
router.post('/:id/set-stock', authorize('admin'), asyncHandler(productController.setStock));

// POST   /api/products/:id/adjust-stock   (admin only)
// Batched per-location stock editor used by the Products page modal.
router.post('/:id/adjust-stock', authorize('admin'), asyncHandler(productController.adjustStock));

// DELETE /api/products/:id          (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(productController.deleteProduct));

module.exports = router;
