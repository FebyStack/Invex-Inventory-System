/**
 * Global error handling middleware.
 * Catches all errors thrown in route handlers and returns a consistent JSON response.
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || res.statusCode || 500;
  const normalizedStatusCode = statusCode >= 400 ? statusCode : 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  console.error('❌ Error:', err.message);
  if (isDevelopment) {
    console.error(err.stack);
  }

  res.status(normalizedStatusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(isDevelopment ? { stack: err.stack } : {}),
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * and forward them to the error middleware.
 * @param {Function} fn - Async route handler function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, asyncHandler };
