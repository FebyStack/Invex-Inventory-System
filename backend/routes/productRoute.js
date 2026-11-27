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
router.post('/', authorize('super_admin', 'sub_admin'), asyncHandler(productController.createProduct));

// PUT    /api/products/:id        (admin only)
// super_admin only: these handlers do not check the record's location yet (see PROJECT.md).
router.put('/:id', authorize('super_admin'), asyncHandler(productController.updateProduct));

// POST   /api/products/:id/set-stock   — staff may set their own location's
// total. Translates a target total quantity into an INCREASE/DECREASE
// adjustment. The controller forces a non-super-admin's location_id to
// their assigned one before writing, so staff can't touch other locations.
router.post('/:id/set-stock', authorize('super_admin', 'sub_admin', 'staff'), asyncHandler(productController.setStock));

// POST   /api/products/:id/adjust-stock   — staff may edit per-location
// totals at their assigned location only. Each row in the batched payload
// runs through scopeLocation(), so any out-of-scope row 403s the request.
router.post('/:id/adjust-stock', authorize('super_admin', 'sub_admin', 'staff'), asyncHandler(productController.adjustStock));

// DELETE /api/products/:id          (admin only)
router.delete('/:id', authorize('super_admin'), asyncHandler(productController.deleteProduct));

module.exports = router;
