const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const config = require('../src/config/env');
const { logActivity } = require('../src/utils/logger');
const { validatePassword } = require('../src/utils/passwordPolicy');

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
    const { username, password, full_name, email, role: requestedRole } = req.body;
    const role = 'staff'; // Strictly enforce staff role for public registration

    // 1. Validate input
    if (!username || !password || !full_name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, full name, and email are required.',
      });
    }

    // Security: Block explicit attempts to register with privileged roles
    if (requestedRole && requestedRole !== 'staff') {
      void logActivity(0, 'SECURITY_VIOLATION', 'auth', null, {
        username,
        email,
        attemptedRole: requestedRole,
        message: 'Unauthorized attempt to register with privileged role via public endpoint.'
      });
      return res.status(403).json({
        success: false,
        message: 'Registration with privileged roles is not allowed. Please contact an administrator.'
      });
    }

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: pwCheck.message,
      });
    }

    // 2. Check if user already exists
    if (await userModel.usernameExists(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken.',
      });
    }

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Insert into database
    const newUser = await userModel.createWithHashedPassword({
      username,
      password: hashedPassword,
      full_name,
      email,
      role,
    });

    // 5. Log activity (async)
    void logActivity(newUser.id, 'REGISTER', 'users', newUser.id, {
      username: newUser.username,
      full_name: newUser.full_name,
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

    const user = await userModel.findByUsernameWithPassword(username);

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
      full_name: user.full_name,
      message: 'User logged in successfully.',
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
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
      full_name: req.user.full_name,
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

    const pwCheck = validatePassword(new_password);
    if (!pwCheck.ok) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: pwCheck.message,
      });
    }

    // Get current user's password hash
    const user = await userModel.getUserWithPasswordById(req.user.id);
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

    await userModel.updatePasswordHash(req.user.id, hashedPassword);

    void logActivity(req.user.id, 'CHANGE_PASSWORD', 'users', req.user.id);

    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    return next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await userModel.getUserById(req.user.id);

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
