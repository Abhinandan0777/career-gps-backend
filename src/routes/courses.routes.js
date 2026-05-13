import express from 'express';
import { authenticateJWT, authorize, requireApprovedCreator } from '../middleware/auth.middleware.js';
import {
  createCourse,
  listCourses,
  getCourseById,
  updateCourse,
  deleteCourse
} from '../controllers/courses.controller.js';
import { getCourseLessons } from '../controllers/lessons.controller.js';

const router = express.Router();

/**
 * @route   POST /api/courses
 * @desc    Create a new course
 * @access  Creator (APPROVED), Admin
 */
router.post('/', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, createCourse);

/**
 * @route   GET /api/courses
 * @desc    List courses with pagination and filters
 * @access  Public (published courses) / Authenticated (all courses for creators/admins)
 */
router.get('/', (req, res, next) => {
  // Optional authentication - attach user if token present
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  next();
}, listCourses);

/**
 * @route   GET /api/courses/:id
 * @desc    Get course details by ID
 * @access  Public (published courses) / Authenticated (unpublished for owner/admin)
 */
router.get('/:id', (req, res, next) => {
  // Optional authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  next();
}, getCourseById);

/**
 * @route   PUT /api/courses/:id
 * @desc    Update course
 * @access  Creator (APPROVED owner), Admin
 */
router.put('/:id', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, updateCourse);

/**
 * @route   DELETE /api/courses/:id
 * @desc    Delete course
 * @access  Creator (APPROVED owner), Admin
 */
router.delete('/:id', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, deleteCourse);

/**
 * @route   GET /api/courses/:id/lessons
 * @desc    Get all lessons for a course ordered by order field
 * @access  Public (published courses) / Authenticated (unpublished for owner/admin)
 */
router.get('/:id/lessons', (req, res, next) => {
  // Optional authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  next();
}, getCourseLessons);

export default router;
