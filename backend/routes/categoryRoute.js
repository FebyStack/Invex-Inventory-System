const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const categoryController = require('../controllers/categoryController');
const { asyncHandler } = require('../middleware/errorMiddleware');

router.use(authenticate);

router.get('/', asyncHandler(categoryController.getAllCategories));
router.get('/:id', asyncHandler(categoryController.getCategoryById));
router.post('/', authorize('admin'), asyncHandler(categoryController.createCategory));
router.put('/:id', authorize('admin'), asyncHandler(categoryController.updateCategory));
router.delete('/:id', authorize('admin'), asyncHandler(categoryController.deleteCategory));

module.exports = router;
