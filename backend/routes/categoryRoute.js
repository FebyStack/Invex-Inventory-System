const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const categoryController = require('../controllers/categoryController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All category routes require authentication
router.use(authenticate);

// GET    /api/categories       — List all categories (admin + staff)
router.get('/', asyncHandler(categoryController.getAll));

// GET    /api/categories/:id   — Get single category (admin + staff)
router.get('/:id', asyncHandler(categoryController.getById));

// POST   /api/categories       — Create category (admin only)
router.post('/', authorize('admin'), asyncHandler(categoryController.create));

// PUT    /api/categories/:id   — Update category (admin only)
router.put('/:id', authorize('admin'), asyncHandler(categoryController.update));

// DELETE /api/categories/:id   — Soft-delete category (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(categoryController.remove));

module.exports = router;
