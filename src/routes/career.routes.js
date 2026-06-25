import express from 'express';
import multer from 'multer';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { aiOperationRateLimiter } from '../middleware/rateLimit.middleware.js';
import { 
  createOrUpdateProfile, 
  uploadResume,
  analyzeSkillGapController,
  generateRoadmapController,
  getCareerDashboard,
  getJobRoles
} from '../controllers/career.controller.js';

const router = express.Router();

// Configure multer for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10) // Default 5MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and DOCX files are supported.'));
    }
  }
});

/**
 * Career GPS Routes
 * All routes require authentication
 */

// GET /api/career/dashboard - Get career dashboard data
router.get('/dashboard', authenticateJWT, getCareerDashboard);

// GET /api/career/job-roles - Get all available job roles
router.get('/job-roles', authenticateJWT, getJobRoles);

// POST /api/career/profile - Create or update user profile with skills
router.post('/profile', authenticateJWT, createOrUpdateProfile);

// POST /api/career/resume/upload - Upload and parse resume to extract skills (AI operation)
router.post('/resume/upload', authenticateJWT, aiOperationRateLimiter, upload.single('resume'), uploadResume);

// POST /api/career/analyze - Analyze skill gap against target job role (AI operation)
router.post('/analyze', authenticateJWT, aiOperationRateLimiter, analyzeSkillGapController);

// POST /api/career/roadmap - Generate learning roadmap for target job role (AI operation)
router.post('/roadmap', authenticateJWT, aiOperationRateLimiter, generateRoadmapController);

export default router;
