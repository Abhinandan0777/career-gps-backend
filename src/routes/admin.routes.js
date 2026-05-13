import express from 'express';
import { authenticateJWT, authorize } from '../middleware/auth.middleware.js';
import {
  createAdmin,
  listApplications,
  reviewApplication,
  getPlatformAnalytics,
  getSkillDemandAnalytics,
  listUsers,
  updateUserRole,
  deleteUser
} from '../controllers/admin.controller.js';

const router = express.Router();

/**
 * @route   POST /api/admin/create-admin
 * @desc    Create a new admin user (admin-only)
 * @access  Admin only
 */
router.post('/create-admin', authenticateJWT, authorize('admin'), createAdmin);

/**
 * @route   GET /api/admin/applications
 * @desc    List creator applications with optional status filter
 * @access  Admin only
 */
router.get('/applications', authenticateJWT, authorize('admin'), listApplications);

/**
 * @route   PUT /api/admin/applications/:id
 * @desc    Review creator application (approve/reject)
 * @access  Admin only
 */
router.put('/applications/:id', authenticateJWT, authorize('admin'), reviewApplication);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get platform-wide analytics
 * @access  Admin only
 */
router.get('/analytics', authenticateJWT, authorize('admin'), getPlatformAnalytics);

/**
 * @route   GET /api/admin/skill-demand
 * @desc    Get skill demand analytics
 * @access  Admin only
 */
router.get('/skill-demand', authenticateJWT, authorize('admin'), getSkillDemandAnalytics);

/**
 * @route   GET /api/admin/users
 * @desc    List all users with filtering
 * @access  Admin only
 */
router.get('/users', authenticateJWT, authorize('admin'), listUsers);

/**
 * @route   PUT /api/admin/users/:id
 * @desc    Update user role
 * @access  Admin only
 */
router.put('/users/:id', authenticateJWT, authorize('admin'), updateUserRole);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Delete user
 * @access  Admin only
 */
router.delete('/users/:id', authenticateJWT, authorize('admin'), deleteUser);

export default router;
