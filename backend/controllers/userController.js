const userModel = require('../models/userModel');
const { logActivity } = require('../src/utils/logger');
const { validatePassword } = require('../src/utils/passwordPolicy');

const VALID_ROLES = ['super_admin', 'sub_admin', 'staff'];
const ROLES_REQUIRING_LOCATION = ['sub_admin', 'staff'];

/**
 * Normalize the incoming location_id payload field. Returns:
 *   - integer  → an explicit location to set
 *   - null     → an explicit "clear it"
 *   - undefined → caller did not include the field
 */
function parseLocationInput(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * GET /api/users
 * Returns all active users.
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await userModel.getAllUsers();
    return res.json({ success: true, data: users });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/users/:id
 * Returns a single user by ID.
 */
exports.getUserById = async (req, res, next) => {
  try {
    const user = await userModel.getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, data: user });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/users
 * Creates a new user. super_admin only.
 */
exports.createUser = async (req, res, next) => {
  try {
    const { username, full_name, email, password, role } = req.body;

    // Validate required fields
    if (!username || !full_name || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'username, full_name, password, and role are required.',
      });
    }

    // Validate role value
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${VALID_ROLES.join(', ')}.`,
      });
    }

    const locationParsed = parseLocationInput(req.body.location_id);
    if (Number.isNaN(locationParsed)) {
      return res.status(400).json({
        success: false,
        message: 'location_id must be a valid integer.',
      });
    }
    // Sub-admins and staff must be assigned a location at create time so
    // they can actually do something useful when they log in.
    if (ROLES_REQUIRING_LOCATION.includes(role) && (locationParsed == null)) {
      return res.status(400).json({
        success: false,
        message: `${role} users must be assigned a location.`,
      });
    }
    // Super-admins never have a location — null it out even if one was sent.
    const location_id = role === 'super_admin' ? null : locationParsed;

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: pwCheck.message,
      });
    }

    const user = await userModel.createUser({ username, full_name, email, password, role, location_id });

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'CREATE_USER', 'users', user.id, {
      username: user.username,
      role: user.role,
      location_id: user.location_id,
    });

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    // Handle unique constraint violation (duplicate username or email)
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists.',
      });
    }
    // FK violation: location_id pointing nowhere.
    if (err.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Assigned location does not exist.',
      });
    }
    return next(err);
  }
};

/**
 * PUT /api/users/:id
 * Updates an existing user.
 */
exports.updateUser = async (req, res, next) => {
  try {
    const { username, full_name, email, password, role } = req.body;

    // Validate role if provided
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${VALID_ROLES.join(', ')}.`,
      });
    }

    // Validate password if provided (admins resetting another user's password)
    if (password !== undefined && password !== null && password !== '') {
      const pwCheck = validatePassword(password);
      if (!pwCheck.ok) {
        return res.status(400).json({
          success: false,
          code: 'WEAK_PASSWORD',
          message: pwCheck.message,
        });
      }
    }

    // Resolve the location update:
    //   undefined → leave alone
    //   null      → explicit clear (only valid when targetRole becomes super_admin)
    //   integer   → assign
    let locationInput = parseLocationInput(req.body.location_id);
    if (Number.isNaN(locationInput)) {
      return res.status(400).json({
        success: false,
        message: 'location_id must be a valid integer.',
      });
    }

    // If role is being changed (or already known), enforce the role/location
    // pairing. If role isn't being changed, we don't have the existing role
    // here without a DB read; the lighter contract is: when the caller sets
    // role to a location-bound role, they must also send a location_id, or
    // we read the existing one. We'll do the explicit read to keep the rule
    // tight regardless of what the client sent.
    let targetRole = role;
    let targetLocation = locationInput;
    if (targetRole === undefined || targetLocation === undefined) {
      const existing = await userModel.getUserById(req.params.id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      if (targetRole === undefined) targetRole = existing.role;
      if (targetLocation === undefined) targetLocation = existing.location_id ?? null;
    }
    if (targetRole === 'super_admin') {
      // Super admins never carry a location.
      targetLocation = null;
    } else if (ROLES_REQUIRING_LOCATION.includes(targetRole) && targetLocation == null) {
      return res.status(400).json({
        success: false,
        message: `${targetRole} users must be assigned a location.`,
      });
    }

    const updateFields = { username, full_name, email, password, role };
    if (locationInput !== undefined || targetRole !== role) {
      updateFields.location_id = targetLocation;
    }

    const updated = await userModel.updateUser(req.params.id, updateFields);

    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'UPDATE_USER', 'users', updated.id, {
      updatedFields: Object.keys(req.body),
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Username or email already exists.',
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({
        success: false,
        message: 'Assigned location does not exist.',
      });
    }
    return next(err);
  }
};

/**
 * DELETE /api/users/:id
 * Soft-deletes a user. super_admin only.
 */
exports.deleteUser = async (req, res, next) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account.',
      });
    }

    const deleted = await userModel.softDeleteUser(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'DELETE_USER', 'users', deleted.id);

    return res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    return next(err);
  }
};
