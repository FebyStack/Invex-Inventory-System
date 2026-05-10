const jwt = require('jsonwebtoken');
const config = require('../src/config/env');

/**
 * Authentication middleware.
 * Verifies the JWT token from the Authorization header.
 * Attaches the decoded user payload to req.user on success.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Session expired. Please sign in again.',
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_INVALID',
        message: 'Invalid authentication token.',
      });
    }
    if (error.name === 'NotBeforeError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_NOT_ACTIVE',
        message: 'Token is not yet active.',
      });
    }
    return res.status(401).json({
      success: false,
      code: 'AUTH_FAILED',
      message: 'Authentication failed.',
    });
  }
};

module.exports = { authenticate };
