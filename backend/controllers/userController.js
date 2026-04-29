const userModel = require('../models/userModel');
const { logActivity } = require('../src/utils/logger');

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
 * Creates a new user. Requires admin role.
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
    if (!['admin', 'staff'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either "admin" or "staff".',
      });
    }

    const user = await userModel.createUser({ username, full_name, email, password, role });

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'CREATE_USER', 'users', user.id, {
      username: user.username,
      role: user.role,
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
    if (role && !['admin', 'staff'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either "admin" or "staff".',
      });
    }

    const updated = await userModel.updateUser(req.params.id, {
      username,
      full_name,
      email,
      password,
      role,
    });

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
    return next(err);
  }
};

/**
 * DELETE /api/users/:id
 * Soft-deletes a user. Requires admin role.
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
