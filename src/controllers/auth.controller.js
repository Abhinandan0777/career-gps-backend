import pool from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt.js';

/**
 * Register a new user
 * POST /api/auth/register
 * @param {Object} req.body - { email, password, name, role }
 * @returns {Object} { user, token, refreshToken }
 */
export async function register(req, res) {
  try {
    const { email, password, name, role } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email, password, and name are required',
        fields: {
          email: !email ? 'Email is required' : undefined,
          password: !password ? 'Password is required' : undefined,
          name: !name ? 'Name is required' : undefined
        }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid email format',
        field: 'email'
      });
    }

    // Validate password length (minimum 6 characters for production)
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Password must be at least 6 characters long',
        field: 'password'
      });
    }

    // Validate name length
    if (name.length < 2 || name.length > 255) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name must be between 2 and 255 characters',
        field: 'name'
      });
    }

    // Block admin registration from public endpoint
    if (role === 'admin') {
      return res.status(403).json({
        error: {
          code: 'UNAUTHORIZED',
          field: 'role',
          message: 'Admin registration is not allowed'
        }
      });
    }

    // Allow learner and creator registration
    const validRoles = ['learner', 'creator'];
    const userRole = role || 'learner';
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          field: 'role',
          message: 'Role must be either learner or creator'
        }
      });
    }

    // Check for duplicate email
    const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
    const existingUserResult = await pool.query(existingUserQuery, [email]);

    if (existingUserResult.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Email already exists',
        field: 'email'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user record
    const insertUserQuery = `
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, name, role, avatar_url, created_at, updated_at
    `;
    const insertUserResult = await pool.query(insertUserQuery, [
      email,
      passwordHash,
      name,
      userRole
    ]);

    const user = insertUserResult.rows[0];

    // Generate JWT tokens
    const token = generateAccessToken(String(user.id), user.role);
    const refreshToken = generateRefreshToken(String(user.id), user.role);

    // Return user and tokens (exclude password_hash)
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register user'
    });
  }
}

/**
 * Login user
 * POST /api/auth/login
 * @param {Object} req.body - { email, password }
 * @returns {Object} { user, token, refreshToken }
 */
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    // FEATURE 3: Better error messages - Check required fields
    if (!email) {
      return res.status(400).json({
        error: {
          code: 'FIELD_REQUIRED',
          field: 'email',
          message: 'Email is required'
        }
      });
    }

    if (!password) {
      return res.status(400).json({
        error: {
          code: 'FIELD_REQUIRED',
          field: 'password',
          message: 'Password is required'
        }
      });
    }

    // Query user by email
    const userQuery = `
      SELECT id, email, password_hash, name, role, avatar_url, created_at, updated_at
      FROM users
      WHERE email = $1
    `;
    const userResult = await pool.query(userQuery, [email]);

    // Check if user exists
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          field: 'email',
          message: 'Email is not registered'
        }
      });
    }

    const user = userResult.rows[0];

    // Verify password
    const { comparePassword } = await import('../utils/password.js');
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          field: 'password',
          message: 'Incorrect password'
        }
      });
    }

    // Generate JWT tokens
    const token = generateAccessToken(String(user.id), user.role);
    const refreshToken = generateRefreshToken(String(user.id), user.role);

    // Return user and tokens (exclude password_hash)
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      token,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to login'
    });
  }
}

/**
 * Refresh access token
 * POST /api/auth/refresh
 * @param {Object} req.body - { refreshToken }
 * @returns {Object} { token, refreshToken }
 */
export async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;

    // Validate required field
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Refresh token is required',
        field: 'refreshToken'
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyToken(refreshToken, true);
    } catch (error) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: error.message || 'Invalid refresh token'
      });
    }

    // Verify user still exists and get current role
    const userQuery = 'SELECT id, role FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Generate new tokens
    const token = generateAccessToken(String(user.id), user.role);
    const newRefreshToken = generateRefreshToken(String(user.id), user.role);

    return res.status(200).json({
      token,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to refresh token'
    });
  }
}
