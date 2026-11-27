/**
 * Role-based access control for Invex.
 *
 * Three tiers:
 *   super_admin – full access, every location, every endpoint
 *   sub_admin   – full inventory ops, scoped to user.location_id
 *   staff       – read + day-to-day stock ops, scoped to user.location_id
 *
 * Must be used AFTER the authenticate middleware so req.user is populated.
 */

const SUPER_ADMIN = 'super_admin';
const SUB_ADMIN = 'sub_admin';
const STAFF = 'staff';

/**
 * Restrict access to a set of explicit role names.
 *   authorize('super_admin')
 *   authorize('super_admin', 'sub_admin')
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

// Convenience wrappers so route files don't sprinkle role-name string literals.
const requireSuperAdmin = authorize(SUPER_ADMIN);
const requireAdminTier  = authorize(SUPER_ADMIN, SUB_ADMIN);
const requireAnyRole    = authorize(SUPER_ADMIN, SUB_ADMIN, STAFF);

/**
 * Sub-admins and staff need a location assignment before they can do anything
 * location-scoped. If they're still unassigned, surface a clear 403 instead
 * of returning empty data or filtering on `WHERE location_id IS NULL`.
 */
const requireAssignedLocation = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  if (req.user.role === SUPER_ADMIN) return next();
  if (req.user.location_id == null) {
    return res.status(403).json({
      success: false,
      code: 'NO_LOCATION_ASSIGNMENT',
      message: 'Your account has no location assigned yet. Ask a super admin to provision it.',
    });
  }
  next();
};

/**
 * Resolve which location a request should operate on, taking the caller's
 * role into account.
 *
 *   super_admin → may pass any location_id or none (cross-location queries)
 *   sub_admin / staff → forced to their assigned location; if they ask for a
 *     different one, this returns null and the caller can 403.
 *
 * Returns the integer location id to use, or `null` for "all locations"
 * (only meaningful for super_admin). Throws no error — callers decide how
 * to interpret a null when a non-super-admin requested another location.
 */
function resolveLocationScope(req, requestedRaw) {
  const requested = requestedRaw === undefined || requestedRaw === null || requestedRaw === ''
    ? null
    : parseInt(requestedRaw, 10);

  if (req.user.role === SUPER_ADMIN) {
    return { ok: true, locationId: Number.isInteger(requested) ? requested : null, crossLocation: requested == null };
  }

  const assigned = req.user.location_id;
  if (assigned == null) {
    return { ok: false, reason: 'NO_LOCATION_ASSIGNMENT' };
  }
  if (Number.isInteger(requested) && requested !== assigned) {
    return { ok: false, reason: 'LOCATION_FORBIDDEN', assigned };
  }
  return { ok: true, locationId: assigned, crossLocation: false };
}

/**
 * Express middleware that runs resolveLocationScope on a query param and
 * stashes the result on `req.locationScope`. Rejects with 403 when a
 * non-super-admin asked for a location that isn't theirs.
 *
 * Read `req.locationScope.locationId` in controllers instead of
 * `req.query.location_id` to get the access-controlled value.
 */
const attachLocationScope = (paramName = 'location_id') => (req, res, next) => {
  const scope = resolveLocationScope(req, req.query[paramName]);
  if (!scope.ok) {
    if (scope.reason === 'NO_LOCATION_ASSIGNMENT') {
      return res.status(403).json({
        success: false,
        code: 'NO_LOCATION_ASSIGNMENT',
        message: 'Your account has no location assigned yet.',
      });
    }
    return res.status(403).json({
      success: false,
      code: 'LOCATION_FORBIDDEN',
      message: `You can only access data for your assigned location.`,
    });
  }
  req.locationScope = scope;
  next();
};

module.exports = {
  authorize,
  requireSuperAdmin,
  requireAdminTier,
  requireAnyRole,
  requireAssignedLocation,
  attachLocationScope,
  resolveLocationScope,
  // Re-exported so other modules don't string-literal these.
  ROLES: { SUPER_ADMIN, SUB_ADMIN, STAFF },
};
