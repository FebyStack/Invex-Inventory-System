const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../src/config/db');
const config = require('../src/config/env');
const { logActivity } = require('../src/utils/logger');

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    config.jwt.secret,
    { expiresIn: '8h' }
  );

exports.register = async (req, res, next) => {
  try {
    const { username, password, full_name, email, role } = req.body;

    // 1. Validate input
    if (!username || !password || !full_name || !role || !email) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, full name, email, and role are required.',
      });
    }

    // 2. Check if user already exists
    const existingUser = await query('SELECT id FROM invex.users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken.',
      });
    }

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Insert into database
    const newUserResult = await query(
      `INSERT INTO invex.users (username, password, full_name, email, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, full_name, email, role, created_at`,
      [username, hashedPassword, full_name, email, role]
    );

    const newUser = newUserResult.rows[0];

    // 5. Log activity (async)
    void logActivity(newUser.id, 'REGISTER', 'users', newUser.id, {
      username: newUser.username,
      message: 'New user registered successfully.',
    });

    // 6. Send response
    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: newUser,
    });
  } catch (error) {
    return next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.',
      });
    }

    const userResult = await query(
      `SELECT id, username, password, role
       FROM invex.users
       WHERE username = $1 AND is_deleted = FALSE
       LIMIT 1`,
      [username]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    const token = signToken(user);
    void logActivity(user.id, 'LOGIN', 'users', user.id, {
      username: user.username,
      message: 'User logged in successfully.',
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    void logActivity(req.user.id, 'LOGOUT', 'users', req.user.id, {
      username: req.user.username,
      message: 'User logged out successfully.',
    });

    return res.json({
      success: true,
      message: 'Logout successful.',
    });
  } catch (error) {
    return next(error);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters.',
      });
    }

    // Get current user's password hash
    const userResult = await query(
      'SELECT id, password FROM invex.users WHERE id = $1 AND is_deleted = FALSE',
      [req.user.id]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(current_password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    // Hash new password and update
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    await query(
      'UPDATE invex.users SET password = $1 WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    void logActivity(req.user.id, 'CHANGE_PASSWORD', 'users', req.user.id);

    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    return next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const userResult = await query(
      `SELECT id, username, full_name, email, role, created_at
       FROM invex.users
       WHERE id = $1 AND is_deleted = FALSE
       LIMIT 1`,
      [req.user.id]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    return next(error);
  }
};
