const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const userController = require('../controllers/userController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All user routes require authentication
router.use(authenticate);

// GET    /api/users
router.get('/', asyncHandler(userController.getAllUsers));

// GET    /api/users/:id
router.get('/:id', asyncHandler(userController.getUserById));

// POST   /api/users          (admin only)
router.post('/', authorize('admin'), asyncHandler(userController.createUser));

// PUT    /api/users/:id
router.put('/:id', asyncHandler(userController.updateUser));

// DELETE /api/users/:id       (admin only)
router.delete('/:id', authorize('admin'), asyncHandler(userController.deleteUser));

module.exports = router;
