import { verifyToken } from '../utils/jwt.js';
import pool from '../config/database.js';

/**
 * Middleware to authenticate JWT tokens from Authorization header
 * Verifies Bearer token and attaches decoded user to req.user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
export function authenticateJWT(req, res, next) {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No authorization header provided'
      });
    }

    // Check for Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Invalid authorization format',
        message: 'Authorization header must be in format: Bearer <token>'
      });
    }

    const token = parts[1];

    // Verify token using jwt utility
    const decoded = verifyToken(token, false);

    // Attach decoded user to request object
    req.user = {
      userId: decoded.userId,
      role: decoded.role
    };

    next();
  } catch (error) {
    // Handle token verification errors
    return res.status(401).json({
      error: 'Invalid token',
      message: error.message
    });
  }
}

/**
 * Middleware factory for role-based access control
 * Creates middleware that checks if authenticated user has required role
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 * @returns {Function} Express middleware function
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    // Ensure user is authenticated first
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to access this resource'
      });
    }

    // Check if user's role is in the allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
      });
    }

    next();
  };
}

/**
 * Middleware to check if creator has an approved application
 * Must be used AFTER authenticateJWT and authorize('creator')
 * Blocks access if creator application is not approved
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
export async function requireApprovedCreator(req, res, next) {
  try {
    // Only check for creators (admins bypass this check)
    if (req.user.role !== 'creator') {
      return next();
    }

    // Check if creator has an approved application
    const query = `
      SELECT status 
      FROM creator_applications 
      WHERE user_id = $1 AND status = 'approved'
      LIMIT 1
    `;
    
    const result = await pool.query(query, [req.user.userId]);

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: 'Creator approval required',
        message: 'Your creator application must be approved before accessing this feature',
        code: 'CREATOR_NOT_APPROVED',
        action: 'Please submit a creator application or wait for approval'
      });
    }

    next();
  } catch (error) {
    console.error('Creator approval check error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to verify creator approval status'
    });
  }
}
