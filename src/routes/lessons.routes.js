import express from 'express';
import multer from 'multer';
import { authenticateJWT, authorize, requireApprovedCreator } from '../middleware/auth.middleware.js';
import { aiOperationRateLimiter } from '../middleware/rateLimit.middleware.js';
import {
  createLesson,
  getLessonById,
  updateLesson,
  deleteLesson,
  completeLessonHandler,
  analyzeTranscript,
  analyzeTranscriptDemo,
  getTranscript,
  saveTranscript,
  fetchYouTubeTranscript,
  deleteTranscript
} from '../controllers/lessons.controller.js';

const router = express.Router();

// Configure multer for video upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime' // .mov files
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, WebM, OGG, and MOV video files are allowed.'));
    }
  }
});

/**
 * @route   POST /api/lessons
 * @desc    Create a new lesson (with optional video upload)
 * @access  Creator (APPROVED), Admin
 */
router.post('/', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, upload.single('video'), createLesson);

/**
 * @route   GET /api/lessons/:id
 * @desc    Get lesson details by ID
 * @access  Public (published courses) / Authenticated (unpublished for owner/admin)
 */
router.get('/:id', (req, res, next) => {
  // Optional authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  next();
}, getLessonById);

/**
 * @route   PUT /api/lessons/:id
 * @desc    Update lesson (with optional video upload)
 * @access  Creator (APPROVED course owner), Admin
 */
router.put('/:id', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, upload.single('video'), updateLesson);

/**
 * @route   DELETE /api/lessons/:id
 * @desc    Delete lesson
 * @access  Creator (APPROVED course owner), Admin
 */
router.delete('/:id', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, deleteLesson);

/**
 * @route   POST /api/lessons/:id/complete
 * @desc    Mark lesson as complete
 * @access  Authenticated (enrolled learners)
 */
router.post('/:id/complete', authenticateJWT, completeLessonHandler);

/**
 * @route   POST /api/lessons/analyze-transcript-demo
 * @desc    Analyze transcript without lesson context (demo/testing) - AI operation
 * @access  Authenticated
 */
router.post('/analyze-transcript-demo', authenticateJWT, aiOperationRateLimiter, analyzeTranscriptDemo);

/**
 * @route   GET /api/lessons/:lessonId/transcript
 * @desc    Get transcript for a lesson
 * @access  Public (for published courses) / Authenticated (for unpublished)
 */
router.get('/:lessonId/transcript', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  next();
}, getTranscript);

/**
 * @route   POST /api/lessons/:lessonId/transcript
 * @desc    Create or update transcript for a lesson
 * @access  Creator (APPROVED course owner), Admin
 */
router.post('/:lessonId/transcript', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, saveTranscript);

/**
 * @route   POST /api/lessons/:lessonId/transcript/fetch-youtube
 * @desc    Fetch transcript from YouTube video - AI operation
 * @access  Creator (APPROVED course owner), Admin
 */
router.post('/:lessonId/transcript/fetch-youtube', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, aiOperationRateLimiter, fetchYouTubeTranscript);

/**
 * @route   DELETE /api/lessons/:lessonId/transcript
 * @desc    Delete transcript for a lesson
 * @access  Creator (APPROVED course owner), Admin
 */
router.delete('/:lessonId/transcript', authenticateJWT, authorize('creator', 'admin'), requireApprovedCreator, deleteTranscript);

/**
 * @route   POST /api/lessons/:lessonId/analyze-transcript
 * @desc    Analyze lesson transcript and generate structured learning materials - AI operation
 * @access  Authenticated (enrolled learners or course creator)
 */
router.post('/:lessonId/analyze-transcript', authenticateJWT, aiOperationRateLimiter, analyzeTranscript);

export default router;
