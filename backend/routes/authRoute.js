const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const authController = require('../controllers/authController');
const { asyncHandler } = require('../middleware/errorMiddleware');

// POST /api/auth/register
router.post('/register', asyncHandler(authController.register));

// POST /api/auth/login
router.post('/login', asyncHandler(authController.login));

// POST /api/auth/logout
router.post('/logout', authenticate, asyncHandler(authController.logout));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(authController.getMe));

module.exports = router;
