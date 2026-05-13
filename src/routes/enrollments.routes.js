import express from 'express';
import { authenticateJWT, authorize } from '../middleware/auth.middleware.js';
import {
  enrollInCourse,
  getUserEnrollments,
  getEnrollmentDetails,
  unenrollFromCourse
} from '../controllers/enrollments.controller.js';

const router = express.Router();

/**
 * @route   POST /api/enrollments
 * @desc    Enroll in a course
 * @access  Learner only
 */
router.post('/', authenticateJWT, authorize('learner'), enrollInCourse);

/**
 * @route   GET /api/enrollments
 * @desc    Get user's enrollments
 * @access  Authenticated
 */
router.get('/', authenticateJWT, getUserEnrollments);

/**
 * @route   GET /api/enrollments/:id
 * @desc    Get enrollment details with progress
 * @access  Authenticated (owner only)
 */
router.get('/:id', authenticateJWT, getEnrollmentDetails);

/**
 * @route   DELETE /api/enrollments/:id
 * @desc    Unenroll from course
 * @access  Authenticated (owner only)
 */
router.delete('/:id', authenticateJWT, unenrollFromCourse);

export default router;
