const { resolveLocationScope } = require('../../middleware/roleMiddleware');

/**
 * Controller helper that resolves the effective location_id for a request.
 *
 * Returns:
 *   { locationId, crossLocation }  on success
 *   null                            after responding with the appropriate 403
 *
 * Usage in a controller:
 *
 *   const scope = scopeLocation(req, res, req.query.location_id);
 *   if (!scope) return; // response already sent
 *   const rows = await model.list({ location_id: scope.locationId });
 *
 * Pass `requested` separately (instead of always reading req.query.location_id)
 * because some controllers receive it as a route param or a different key
 * (e.g. from_location_id / to_location_id).
 */
function scopeLocation(req, res, requested) {
  const scope = resolveLocationScope(req, requested);
  if (scope.ok) return scope;

  if (scope.reason === 'NO_LOCATION_ASSIGNMENT') {
    res.status(403).json({
      success: false,
      code: 'NO_LOCATION_ASSIGNMENT',
      message: 'Your account has no location assigned yet.',
    });
    return null;
  }
  res.status(403).json({
    success: false,
    code: 'LOCATION_FORBIDDEN',
    message: 'You can only access data for your assigned location.',
  });
  return null;
}

module.exports = { scopeLocation };
