import jwt from 'jsonwebtoken';

/**
 * Generate a JWT access token with 1 hour expiry
 * @param {string} userId - User ID to include in token payload
 * @param {string} role - User role to include in token payload
 * @returns {string} Signed JWT access token
 * @throws {Error} If userId or role is invalid, or JWT_SECRET is not configured
 */
export function generateAccessToken(userId, role) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID must be a non-empty string');
  }

  if (!role || typeof role !== 'string') {
    throw new Error('Role must be a non-empty string');
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }

  const payload = {
    userId,
    role
  };

  const options = {
    expiresIn: '1h'
  };

  const token = jwt.sign(payload, secret, options);
  return token;
}

/**
 * Generate a JWT refresh token with 7 days expiry
 * @param {string} userId - User ID to include in token payload
 * @param {string} role - User role to include in token payload
 * @returns {string} Signed JWT refresh token
 * @throws {Error} If userId or role is invalid, or JWT_REFRESH_SECRET is not configured
 */
export function generateRefreshToken(userId, role) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID must be a non-empty string');
  }

  if (!role || typeof role !== 'string') {
    throw new Error('Role must be a non-empty string');
  }

  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is not configured');
  }

  const payload = {
    userId,
    role
  };

  const options = {
    expiresIn: '7d'
  };

  const token = jwt.sign(payload, secret, options);
  return token;
}

/**
 * Verify a JWT token and return the decoded payload
 * @param {string} token - JWT token to verify
 * @param {boolean} isRefreshToken - Whether this is a refresh token (default: false)
 * @returns {Object} Decoded token payload containing userId and role
 * @throws {Error} If token is invalid, expired, or signature verification fails
 */
export function verifyToken(token, isRefreshToken = false) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }

  const secret = isRefreshToken 
    ? process.env.JWT_REFRESH_SECRET 
    : process.env.JWT_SECRET;

  if (!secret) {
    const secretType = isRefreshToken ? 'JWT_REFRESH_SECRET' : 'JWT_SECRET';
    throw new Error(`${secretType} environment variable is not configured`);
  }

  try {
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token signature');
    } else {
      throw new Error('Token verification failed');
    }
  }
}
