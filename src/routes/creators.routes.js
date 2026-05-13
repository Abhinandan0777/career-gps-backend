import express from 'express';
import { authenticateJWT, authorize, requireApprovedCreator } from '../middleware/auth.middleware.js';
import {
  applyForCreator,
  getMyApplication,
  getCreatorDashboard,
  getCreatorCourses,
  getCreatorAnalytics
} from '../controllers/creators.controller.js';

const router = express.Router();

/**
 * @route   POST /api/creators/apply
 * @desc    Submit creator application
 * @access  Creator only (unapproved creators can apply)
 */
router.post('/apply', authenticateJWT, authorize('creator'), applyForCreator);

/**
 * @route   GET /api/creators/application
 * @desc    Get user's creator application status
 * @access  Authenticated
 */
router.get('/application', authenticateJWT, getMyApplication);

/**
 * @route   GET /api/creators/dashboard
 * @desc    Get creator dashboard overview
 * @access  Creator only (APPROVED)
 */
router.get('/dashboard', authenticateJWT, authorize('creator'), requireApprovedCreator, getCreatorDashboard);

/**
 * @route   GET /api/creators/courses
 * @desc    Get creator's courses with enrollment stats
 * @access  Creator only (APPROVED)
 */
router.get('/courses', authenticateJWT, authorize('creator'), requireApprovedCreator, getCreatorCourses);

/**
 * @route   GET /api/creators/analytics
 * @desc    Get creator analytics with trends
 * @access  Creator only (APPROVED)
 */
router.get('/analytics', authenticateJWT, authorize('creator'), requireApprovedCreator, getCreatorAnalytics);

export default router;
