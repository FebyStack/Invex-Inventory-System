/**
 * Role-based access control middleware.
 * Restricts access to routes based on the user's role.
 * Must be used AFTER the authenticate middleware.
 *
 * @param  {...string} allowedRoles - Roles permitted to access the route (e.g., 'admin', 'manager', 'staff')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }

    next();
  };
};

module.exports = { authorize };
