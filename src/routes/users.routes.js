import express from 'express';
import { getMe, updateMe, deleteMe, listCreators } from '../controllers/users.controller.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * GET /api/users/creators
 * List all creators (public endpoint)
 * Returns: { creators }
 */
router.get('/creators', listCreators);

/**
 * GET /api/users/me
 * Get current user profile
 * Requires authentication
 * Returns: { user, profile }
 */
router.get('/me', authenticateJWT, getMe);

/**
 * PUT /api/users/me
 * Update current user profile
 * Requires authentication
 * Body: { name?, bio?, avatar? }
 * Returns: { user }
 */
router.put('/me', authenticateJWT, updateMe);

/**
 * DELETE /api/users/me
 * Delete current user account
 * Requires authentication
 * Returns: { message, userId }
 */
router.delete('/me', authenticateJWT, deleteMe);

export default router;
