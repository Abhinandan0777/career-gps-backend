import express from 'express';
import { listSkills } from '../controllers/skills.controller.js';

const router = express.Router();

// GET /api/skills - List all skills
router.get('/', listSkills);

export default router;
