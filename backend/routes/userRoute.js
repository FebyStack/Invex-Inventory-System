const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const userController = require('../controllers/userController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All user routes require authentication AND admin role.
// Staff manage their own profile via /api/auth/me and /api/auth/change-password.
router.use(authenticate);
router.use(authorize('admin'));

// GET    /api/users
router.get('/', asyncHandler(userController.getAllUsers));

// GET    /api/users/:id
router.get('/:id', asyncHandler(userController.getUserById));

// POST   /api/users
router.post('/', asyncHandler(userController.createUser));

// PUT    /api/users/:id
router.put('/:id', asyncHandler(userController.updateUser));

// DELETE /api/users/:id
router.delete('/:id', asyncHandler(userController.deleteUser));

module.exports = router;
