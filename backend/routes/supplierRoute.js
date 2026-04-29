const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const supplierController = require('../controllers/supplierController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All supplier routes require authentication
router.use(authenticate);

// GET    /api/suppliers       — List all suppliers (admin + staff)
router.get('/', asyncHandler(supplierController.getAll));

// GET    /api/suppliers/:id   — Get single supplier (admin + staff)
router.get('/:id', asyncHandler(supplierController.getById));

// POST   /api/suppliers       — Create supplier (admin only)
router.post('/', authorize('admin'), asyncHandler(supplierController.create));

// PUT    /api/suppliers/:id   — Update supplier (admin only)
router.put('/:id', authorize('admin'), asyncHandler(supplierController.update));

// DELETE /api/suppliers/:id   — Soft-delete supplier (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(supplierController.remove));

module.exports = router;
