import express from 'express';
import { register, login, refresh } from '../controllers/auth.controller.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 * Body: { email, password, name, role? }
 * Returns: { user, token, refreshToken }
 */
router.post('/register', register);

/**
 * POST /api/auth/login
 * Login user
 * Body: { email, password }
 * Returns: { user, token, refreshToken }
 */
router.post('/login', login);

/**
 * POST /api/auth/refresh
 * Refresh access token
 * Body: { refreshToken }
 * Returns: { token, refreshToken }
 */
router.post('/refresh', refresh);

/**
 * POST /api/auth/logout
 * Logout user (client-side token invalidation)
 * Returns: { message }
 */
router.post('/logout', (req, res) => {
  // Logout is handled client-side by removing tokens
  // This endpoint exists for consistency and future server-side token blacklisting
  return res.status(200).json({ message: 'Logged out successfully' });
});

export default router;
