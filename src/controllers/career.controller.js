import pool from '../config/database.js';
import { parseResumeWithGemini, analyzeSkillGapWithGemini, generateLearningRoadmapWithAI } from '../services/gemini.service.js';
import { extractResumeText } from '../utils/fileParser.js';
import { 
  analyzeSkillGap, 
  recommendCoursesForSkills, 
  generateLearningRoadmap 
} from '../services/career.service.js';

/**
 * Upload and parse resume to extract skills using Google Gemini
 * Optionally analyze skill gap and recommend courses if targetJobRoleId provided
 * POST /api/career/resume/upload
 * @param {Object} req - Express request object with file upload and optional targetJobRoleId
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with extracted skills, profile, and optional analysis
 */
export async function uploadResume(req, res) {
  const client = await pool.connect();
  
  try {
    const userId = req.user.userId;
    const file = req.file;
    const targetJobRoleId = req.body?.targetJobRoleId;

    // Validate file upload
    if (!file) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No file uploaded',
        field: 'file'
      });
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid file type. Only PDF and DOCX files are supported.',
        field: 'file'
      });
    }

    // Extract text from resume
    let resumeText;
    try {
      resumeText = await extractResumeText(file.buffer, file.mimetype);
    } catch (error) {
      return res.status(400).json({
        error: 'File parsing error',
        message: error.message
      });
    }

    // Validate extracted text
    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Resume file appears to be empty or contains insufficient text'
      });
    }

    // Parse resume with Gemini to extract skills
    let extractedSkills;
    try {
      extractedSkills = await parseResumeWithGemini(resumeText);
      console.log(`Successfully extracted ${extractedSkills.length} skills from resume`);
    } catch (error) {
      console.error('Resume parsing error:', error);
      extractedSkills = [];
    }

    // Check if any skills were extracted
    if (extractedSkills.length === 0) {
      return res.status(200).json({
        message: 'No technical skills found in resume',
        extractedSkills: [],
        profile: null
      });
    }

    // Check if profile exists
    const checkQuery = 'SELECT id FROM user_profiles WHERE user_id = $1';
    const checkResult = await client.query(checkQuery, [userId]);

    let profile;
    
    if (checkResult.rows.length > 0) {
      // Update existing profile with extracted skills
      const updateQuery = `
        UPDATE user_profiles 
        SET skills = $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING id, user_id, skills, bio, target_role_id, resume_url, created_at, updated_at
      `;
      const updateResult = await client.query(updateQuery, [JSON.stringify(extractedSkills), userId]);
      profile = updateResult.rows[0];
    } else {
      // Create new profile with extracted skills
      const insertQuery = `
        INSERT INTO user_profiles (user_id, skills)
        VALUES ($1, $2)
        RETURNING id, user_id, skills, bio, target_role_id, resume_url, created_at, updated_at
      `;
      const insertResult = await client.query(insertQuery, [userId, JSON.stringify(extractedSkills)]);
      profile = insertResult.rows[0];
    }

    const response = {
      message: 'Resume parsed successfully',
      extractedSkills,
      profile: {
        profileId: profile.id,
        userId: profile.user_id,
        skills: profile.skills,
        bio: profile.bio,
        targetRoleId: profile.target_role_id,
        resumeUrl: profile.resume_url,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      }
    };

    // If targetJobRoleId provided, perform skill gap analysis and recommendations
    if (targetJobRoleId) {
      try {
        // Validate job role exists
        const jobRoleQuery = 'SELECT id, name FROM job_roles WHERE id = $1';
        const jobRoleResult = await client.query(jobRoleQuery, [targetJobRoleId]);
        
        if (jobRoleResult.rows.length === 0) {
          return res.status(404).json({
            error: 'Not found',
            message: 'Job role not found'
          });
        }

        // Analyze skill gap
        const skillGapAnalysis = await analyzeSkillGap(userId, targetJobRoleId);
        response.skillGapAnalysis = skillGapAnalysis;

        // Get course recommendations for missing skills
        if (skillGapAnalysis.missing.length > 0) {
          const courseRecommendations = await recommendCoursesForSkills(skillGapAnalysis.missing);
          response.courseRecommendations = courseRecommendations;

          // Generate learning roadmap
          const learningRoadmap = await generateLearningRoadmap(userId, targetJobRoleId);
          response.learningRoadmap = learningRoadmap;
        } else {
          response.message = 'Resume analyzed successfully. You have all required skills!';
        }

      } catch (error) {
        console.error('Error in skill gap analysis:', error);
        // Don't fail the entire request, just log the error
        response.analysisError = 'Failed to perform skill gap analysis';
      }
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error uploading resume:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process resume upload'
    });
  } finally {
    client.release();
  }
}

/**
 * Create or update user profile with skills
 * POST /api/career/profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with profile data
 */
export async function createOrUpdateProfile(req, res) {
  const client = await pool.connect();
  
  try {
    const userId = req.user.userId;
    const { skills } = req.body;

    // Validate skills array
    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Skills must be an array',
        field: 'skills'
      });
    }

    // Validate each skill object
    const validLevels = ['beginner', 'intermediate', 'advanced'];
    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      
      if (!skill.name || typeof skill.name !== 'string' || skill.name.trim().length === 0) {
        return res.status(400).json({
          error: 'Validation error',
          message: `Skill at index ${i} must have a non-empty name`,
          field: `skills[${i}].name`
        });
      }

      if (!skill.level || !validLevels.includes(skill.level)) {
        return res.status(400).json({
          error: 'Validation error',
          message: `Skill at index ${i} must have a valid level: ${validLevels.join(', ')}`,
          field: `skills[${i}].level`
        });
      }
    }

    // Check if profile exists
    const checkQuery = 'SELECT id FROM user_profiles WHERE user_id = $1';
    const checkResult = await client.query(checkQuery, [userId]);

    let profile;
    
    if (checkResult.rows.length > 0) {
      // Update existing profile
      const updateQuery = `
        UPDATE user_profiles 
        SET skills = $1, updated_at = NOW()
        WHERE user_id = $2
        RETURNING id, user_id, skills, bio, target_role_id, resume_url, created_at, updated_at
      `;
      const updateResult = await client.query(updateQuery, [JSON.stringify(skills), userId]);
      profile = updateResult.rows[0];
    } else {
      // Create new profile
      const insertQuery = `
        INSERT INTO user_profiles (user_id, skills)
        VALUES ($1, $2)
        RETURNING id, user_id, skills, bio, target_role_id, resume_url, created_at, updated_at
      `;
      const insertResult = await client.query(insertQuery, [userId, JSON.stringify(skills)]);
      profile = insertResult.rows[0];
    }

    return res.status(checkResult.rows.length > 0 ? 200 : 201).json({
      profileId: profile.id,
      userId: profile.user_id,
      skills: profile.skills,
      bio: profile.bio,
      targetRoleId: profile.target_role_id,
      resumeUrl: profile.resume_url,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    });

  } catch (error) {
    console.error('Error creating/updating profile:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create or update profile'
    });
  } finally {
    client.release();
  }
}

/**
 * Analyze skill gap between user's skills and target job role using AI
 * POST /api/career/analyze
 * @param {Object} req - Express request object with jobRoleName in body
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with AI-powered skill gap analysis
 */
export async function analyzeSkillGapController(req, res) {
  let client;
  
  try {
    console.log('[Skill Gap] Starting analysis...');
    console.log('[Skill Gap] User ID:', req.user?.userId);
    console.log('[Skill Gap] Request body:', req.body);
    
    // Try to connect to database
    try {
      client = await pool.connect();
      console.log('[Skill Gap] Database connection successful');
    } catch (dbError) {
      console.error('[Skill Gap] Database connection failed:', dbError.message);
      return res.status(500).json({
        error: 'Database connection error',
        message: 'Unable to connect to database. Please check your connection.',
        details: dbError.message
      });
    }
    
    const userId = req.user.userId;
    const { jobRoleName } = req.body;

    // Validate jobRoleName
    if (!jobRoleName || typeof jobRoleName !== 'string' || jobRoleName.trim().length === 0) {
      console.log('[Skill Gap] Validation failed: jobRoleName missing or invalid');
      return res.status(400).json({
        error: 'Validation error',
        message: 'jobRoleName is required and must be a non-empty string',
        field: 'jobRoleName'
      });
    }

    // Get user profile with skills
    console.log('[Skill Gap] Fetching user profile for userId:', userId);
    const profileQuery = 'SELECT skills FROM user_profiles WHERE user_id = $1';
    const profileResult = await client.query(profileQuery, [userId]);
    
    if (profileResult.rows.length === 0) {
      console.log('[Skill Gap] User profile not found');
      return res.status(404).json({
        error: 'Not found',
        message: 'User profile not found. Please create a profile or upload a resume first.'
      });
    }

    const userSkills = profileResult.rows[0].skills || [];
    console.log('[Skill Gap] User skills count:', userSkills.length);
    
    if (userSkills.length === 0) {
      console.log('[Skill Gap] No skills found in profile');
      return res.status(400).json({
        error: 'Validation error',
        message: 'No skills found in your profile. Please upload a resume first.'
      });
    }

    console.log('[Skill Gap] Calling Gemini API for skill gap analysis:', {
      jobRoleName,
      userSkillsCount: userSkills.length,
      userSkills: userSkills.slice(0, 5) // Log first 5 skills
    });

    // Perform AI-powered skill gap analysis with Gemini
    const analysis = await analyzeSkillGapWithGemini(userSkills, jobRoleName);
    
    console.log('[Skill Gap] Gemini API response received:', {
      hasRequiredSkills: !!analysis.requiredSkills,
      hasMatchedSkills: !!analysis.matchedSkills,
      hasMissingSkills: !!analysis.missingSkills,
      readinessPercentage: analysis.readinessPercentage
    });

    const responseData = {
      jobRole: {
        name: jobRoleName
      },
      requiredSkills: analysis.requiredSkills,
      matchedSkills: analysis.matchedSkills,
      missingSkills: analysis.missingSkills,
      readinessPercentage: analysis.readinessPercentage,
      totalSkills: analysis.totalSkills,
      matchedCount: analysis.matchedCount
    };
    
    console.log('[Skill Gap] Sending response to frontend:', {
      hasJobRole: !!responseData.jobRole,
      requiredSkillsCount: responseData.requiredSkills?.length,
      matchedSkillsCount: responseData.matchedSkills?.length,
      missingSkillsCount: responseData.missingSkills?.length
    });

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('[Skill Gap] Error analyzing skill gap:', error);
    console.error('[Skill Gap] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    if (error.message === 'User profile not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'User profile not found. Please create a profile or upload a resume first.'
      });
    }
    
    if (error.message.includes('GEMINI_API_KEY')) {
      return res.status(500).json({
        error: 'Configuration error',
        message: 'AI service is not properly configured'
      });
    }
    
    if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'API rate limit exceeded. Please try again in a few hours when the quota resets.'
      });
    }
    
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to analyze skill gap. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
      console.log('[Skill Gap] Database connection released');
    }
  }
}

/**
 * Generate learning roadmap for user to reach target job role
 * POST /api/career/roadmap
 * @param {Object} req - Express request object with jobRoleId and optional targetWeeks
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with learning roadmap
 */
export async function generateRoadmapController(req, res) {
  let client;
  
  try {
    console.log('[Roadmap] Starting roadmap generation...');
    console.log('[Roadmap] User ID:', req.user?.userId);
    console.log('[Roadmap] Request body:', req.body);
    
    const userId = req.user.userId;
    const { jobRoleId, jobRoleName, targetWeeks } = req.body;

    // Accept either jobRoleId or jobRoleName
    if (!jobRoleId && !jobRoleName) {
      console.log('[Roadmap] Validation failed: neither jobRoleId nor jobRoleName provided');
      return res.status(400).json({
        error: 'Validation error',
        message: 'Either jobRoleId or jobRoleName is required',
        field: 'jobRoleId'
      });
    }

    // Validate targetWeeks if provided
    if (targetWeeks !== undefined && targetWeeks !== null) {
      const weeks = parseInt(targetWeeks, 10);
      if (isNaN(weeks) || weeks < 1 || weeks > 104) {
        console.log('[Roadmap] Validation failed: invalid targetWeeks');
        return res.status(400).json({
          error: 'Validation error',
          message: 'targetWeeks must be a number between 1 and 104',
          field: 'targetWeeks'
        });
      }
    }

    // Try to connect to database
    try {
      client = await pool.connect();
      console.log('[Roadmap] Database connection successful');
    } catch (dbError) {
      console.error('[Roadmap] Database connection failed:', dbError.message);
      return res.status(500).json({
        error: 'Database connection error',
        message: 'Unable to connect to database. Please check your connection.',
        details: dbError.message
      });
    }

    // Get user profile with skills
    console.log('[Roadmap] Fetching user profile...');
    const profileQuery = 'SELECT skills FROM user_profiles WHERE user_id = $1';
    const profileResult = await client.query(profileQuery, [userId]);
    
    if (profileResult.rows.length === 0) {
      console.log('[Roadmap] User profile not found');
      return res.status(404).json({
        error: 'Not found',
        message: 'User profile not found. Please create a profile or upload a resume first.'
      });
    }

    const userSkills = profileResult.rows[0].skills || [];
    console.log('[Roadmap] User skills count:', userSkills.length);

    // Use jobRoleName for AI-powered roadmap generation
    const targetJobRole = jobRoleName || 'Software Developer';
    console.log('[Roadmap] Generating AI-powered roadmap for:', targetJobRole);

    // Generate AI-powered roadmap using Gemini
    const roadmap = await generateLearningRoadmapWithAI(
      userSkills,
      targetJobRole,
      targetWeeks ? parseInt(targetWeeks, 10) : 12
    );

    console.log('[Roadmap] AI roadmap generated successfully');
    console.log('[Roadmap] Weeks:', roadmap.weeks?.length || roadmap.weeklyPlan?.length);

    // Store roadmap in database (optional - skip if job_role_id lookup fails)
    try {
      // Try to find job role by name
      const jobRoleQuery = 'SELECT id, name FROM job_roles WHERE name ILIKE $1 LIMIT 1';
      const jobRoleResult = await client.query(jobRoleQuery, [targetJobRole]);
      
      if (jobRoleResult.rows.length > 0) {
        const jobRole = jobRoleResult.rows[0];
        console.log('[Roadmap] Found job role in database:', jobRole.name);
        
        // Store in learning_paths table
        const insertQuery = `
          INSERT INTO learning_paths (user_id, job_role_id, roadmap, estimated_weeks, status)
          VALUES ($1, $2, $3, $4, 'active')
          RETURNING id, created_at
        `;
        const insertResult = await client.query(insertQuery, [
          userId,
          jobRole.id,
          JSON.stringify(roadmap),
          roadmap.weeklyPlan?.length || roadmap.weeks?.length || targetWeeks || 12
        ]);
        
        roadmap.roadmapId = insertResult.rows[0].id;
        roadmap.createdAt = insertResult.rows[0].created_at;
        console.log('[Roadmap] Saved to database with ID:', roadmap.roadmapId);
      } else {
        console.log('[Roadmap] Job role not found in database, skipping save');
      }
    } catch (saveError) {
      console.error('[Roadmap] Failed to save roadmap to database:', saveError.message);
      // Continue anyway - roadmap was generated successfully
    }

    return res.status(201).json(roadmap);

  } catch (error) {
    console.error('[Roadmap] Error generating roadmap:', error);
    console.error('[Roadmap] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    if (error.message === 'User profile not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'User profile not found. Please create a profile or upload a resume first.'
      });
    }
    
    if (error.message.includes('GEMINI_API_KEY')) {
      return res.status(500).json({
        error: 'Configuration error',
        message: 'AI service is not properly configured'
      });
    }
    
    if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'API rate limit exceeded. Please try again in a few hours when the quota resets.'
      });
    }
    
    if (error.message.includes('temporarily unavailable') || error.message.includes('high demand')) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'The AI service is experiencing high demand. Please try again in a few minutes.'
      });
    }
    
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate learning roadmap',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
      console.log('[Roadmap] Database connection released');
    }
  }
}


/**
 * Get career dashboard data for the authenticated user
 * GET /api/career/dashboard
 * @returns {Object} { profile, learningPaths, recentAnalysis }
 */
export async function getCareerDashboard(req, res) {
  try {
    const userId = req.user.userId;

    // Get user profile with skills
    const profileQuery = `
      SELECT skills
      FROM user_profiles
      WHERE user_id = $1
    `;
    const profileResult = await pool.query(profileQuery, [userId]);
    
    const profile = profileResult.rows.length > 0 
      ? { skills: profileResult.rows[0].skills || [] }
      : { skills: [] };

    // Get learning paths for the user
    const learningPathsQuery = `
      SELECT 
        lp.id,
        jr.name as job_role,
        lp.roadmap,
        lp.estimated_weeks as weeks,
        lp.created_at
      FROM learning_paths lp
      JOIN job_roles jr ON lp.job_role_id = jr.id
      WHERE lp.user_id = $1
      ORDER BY lp.created_at DESC
      LIMIT 5
    `;
    const learningPathsResult = await pool.query(learningPathsQuery, [userId]);
    
    const learningPaths = learningPathsResult.rows.map(path => ({
      id: path.id,
      jobRole: path.job_role,
      weeks: path.weeks,
      progress: 0, // TODO: Calculate actual progress based on completed courses
      roadmap: path.roadmap,
      createdAt: path.created_at
    }));

    // Get most recent skill gap analysis (if any)
    // For now, return null - this would need a separate table to store analysis history
    const recentAnalysis = null;

    return res.status(200).json({
      profile,
      learningPaths,
      recentAnalysis
    });
  } catch (error) {
    console.error('Get career dashboard error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get career dashboard'
    });
  }
}

/**
 * Get all available job roles
 * GET /api/career/job-roles
 * @returns {Object} JSON response with array of job roles
 */
export async function getJobRoles(req, res) {
  try {
    const query = `
      SELECT id, name, category, description
      FROM job_roles
      ORDER BY category, name
    `;
    const result = await pool.query(query);
    
    return res.status(200).json({
      jobRoles: result.rows
    });
  } catch (error) {
    console.error('Get job roles error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get job roles'
    });
  }
}
