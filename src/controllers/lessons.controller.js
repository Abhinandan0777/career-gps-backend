import pool from '../config/database.js';
import { analyzeTranscriptWithAI } from '../services/gemini.service.js';

/**
 * Create a new lesson
 * POST /api/lessons
 * @param {Object} req.body - { courseId, title, content, videoUrl, order, durationMinutes }
 * @returns {Object} { lesson }
 */
export async function createLesson(req, res) {
  try {
    const { courseId, title, content, videoUrl, order, durationMinutes } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Validate required fields
    if (!courseId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Course ID is required',
        field: 'courseId'
      });
    }

    if (!title) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title is required',
        field: 'title'
      });
    }

    // Validate title length
    if (title.length < 3 || title.length > 255) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title must be between 3 and 255 characters',
        field: 'title'
      });
    }

    if (order === undefined || order === null) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Order is required',
        field: 'order'
      });
    }

    // Validate order is positive integer
    if (!Number.isInteger(order) || order < 1) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Order must be a positive integer',
        field: 'order'
      });
    }

    // Validate duration if provided
    if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes < 0)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Duration must be a positive integer',
        field: 'durationMinutes'
      });
    }

    // Verify course exists and check ownership
    const courseQuery = 'SELECT creator_id FROM courses WHERE id = $1';
    const courseResult = await pool.query(courseQuery, [courseId]);

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Course not found'
      });
    }

    const course = courseResult.rows[0];

    // Check authorization (course owner or admin)
    // Convert both to strings for comparison to handle UUID type differences
    const courseCreatorId = String(course.creator_id);
    const currentUserId = String(userId);
    
    console.log('Authorization check:', {
      courseCreatorId,
      currentUserId,
      match: courseCreatorId === currentUserId,
      userRole
    });
    
    if (courseCreatorId !== currentUserId && userRole !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to add lessons to this course'
      });
    }

    // Create lesson
    const insertLessonQuery = `
      INSERT INTO lessons (course_id, title, content, video_url, "order", duration_minutes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, course_id, title, content, video_url, "order", duration_minutes, created_at, updated_at
    `;

    try {
      const insertResult = await pool.query(insertLessonQuery, [
        courseId,
        title,
        content || null,
        videoUrl || null,
        order,
        durationMinutes || null
      ]);

      const lesson = insertResult.rows[0];

      return res.status(201).json({
        lesson: {
          id: lesson.id,
          courseId: lesson.course_id,
          title: lesson.title,
          content: lesson.content,
          videoUrl: lesson.video_url,
          order: lesson.order,
          durationMinutes: lesson.duration_minutes,
          createdAt: lesson.created_at,
          updatedAt: lesson.updated_at
        }
      });
    } catch (error) {
      // Handle unique constraint violation for (course_id, order)
      if (error.code === '23505' && error.constraint === 'lessons_course_id_order_key') {
        return res.status(409).json({
          error: 'Conflict',
          message: 'A lesson with this order already exists in the course',
          field: 'order'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Create lesson error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create lesson'
    });
  }
}

/**
 * Get lesson by ID
 * GET /api/lessons/:id
 * @param {Object} req.params - { id }
 * @returns {Object} { lesson }
 */
export async function getLessonById(req, res) {
  try {
    const { id } = req.params;

    const lessonQuery = `
      SELECT 
        l.id, l.course_id, l.title, l.content, l.video_url, l."order", 
        l.duration_minutes, l.created_at, l.updated_at,
        c.is_published, c.creator_id,
        EXISTS(SELECT 1 FROM transcripts t WHERE t.lesson_id = l.id) as has_transcript
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1
    `;
    const lessonResult = await pool.query(lessonQuery, [id]);

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    const lesson = lessonResult.rows[0];

    // Check if user can view unpublished course's lesson
    if (!lesson.is_published) {
      // Convert both to strings for comparison to handle UUID type differences
      const courseCreatorId = String(lesson.creator_id);
      const currentUserId = req.user ? String(req.user.userId) : null;
      
      if (!req.user || (courseCreatorId !== currentUserId && req.user.role !== 'admin')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view lesson from unpublished course'
        });
      }
    }

    return res.status(200).json({
      lesson: {
        id: lesson.id,
        courseId: lesson.course_id,
        title: lesson.title,
        content: lesson.content,
        videoUrl: lesson.video_url,
        order: lesson.order,
        durationMinutes: lesson.duration_minutes,
        hasTranscript: lesson.has_transcript,
        createdAt: lesson.created_at,
        updatedAt: lesson.updated_at
      }
    });
  } catch (error) {
    console.error('Get lesson error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get lesson'
    });
  }
}

/**
 * Update lesson
 * PUT /api/lessons/:id
 * @param {Object} req.params - { id }
 * @param {Object} req.body - { title, content, videoUrl, order, durationMinutes }
 * @returns {Object} { lesson }
 */
export async function updateLesson(req, res) {
  try {
    const { id } = req.params;
    const { title, content, videoUrl, order, durationMinutes } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Get existing lesson and course
    const existingLessonQuery = `
      SELECT l.course_id, c.creator_id
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1
    `;
    const existingLessonResult = await pool.query(existingLessonQuery, [id]);

    if (existingLessonResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    const existingLesson = existingLessonResult.rows[0];

    // Check authorization (course owner or admin)
    // Convert both to strings for comparison to handle UUID type differences
    const courseCreatorId = String(existingLesson.creator_id);
    const currentUserId = String(userId);
    
    console.log('Update lesson authorization check:', {
      courseCreatorId,
      currentUserId,
      match: courseCreatorId === currentUserId,
      userRole
    });
    
    if (courseCreatorId !== currentUserId && userRole !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this lesson'
      });
    }

    // Validate title if provided
    if (title !== undefined && (title.length < 3 || title.length > 255)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title must be between 3 and 255 characters',
        field: 'title'
      });
    }

    // Validate order if provided
    if (order !== undefined && (!Number.isInteger(order) || order < 1)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Order must be a positive integer',
        field: 'order'
      });
    }

    // Validate duration if provided
    if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes < 0)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Duration must be a positive integer',
        field: 'durationMinutes'
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }

    if (content !== undefined) {
      updates.push(`content = $${paramIndex}`);
      params.push(content);
      paramIndex++;
    }

    if (videoUrl !== undefined) {
      updates.push(`video_url = $${paramIndex}`);
      params.push(videoUrl);
      paramIndex++;
    }

    if (order !== undefined) {
      updates.push(`"order" = $${paramIndex}`);
      params.push(order);
      paramIndex++;
    }

    if (durationMinutes !== undefined) {
      updates.push(`duration_minutes = $${paramIndex}`);
      params.push(durationMinutes);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No fields to update'
      });
    }

    // Update lesson
    const updateQuery = `
      UPDATE lessons
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, course_id, title, content, video_url, "order", duration_minutes, created_at, updated_at
    `;
    params.push(id);

    try {
      const updateResult = await pool.query(updateQuery, params);
      const lesson = updateResult.rows[0];

      return res.status(200).json({
        lesson: {
          id: lesson.id,
          courseId: lesson.course_id,
          title: lesson.title,
          content: lesson.content,
          videoUrl: lesson.video_url,
          order: lesson.order,
          durationMinutes: lesson.duration_minutes,
          createdAt: lesson.created_at,
          updatedAt: lesson.updated_at
        }
      });
    } catch (error) {
      // Handle unique constraint violation for (course_id, order)
      if (error.code === '23505' && error.constraint === 'lessons_course_id_order_key') {
        return res.status(409).json({
          error: 'Conflict',
          message: 'A lesson with this order already exists in the course',
          field: 'order'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Update lesson error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update lesson'
    });
  }
}

/**
 * Delete lesson
 * DELETE /api/lessons/:id
 * @param {Object} req.params - { id }
 * @returns {Object} { message }
 */
export async function deleteLesson(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Get existing lesson and course
    const existingLessonQuery = `
      SELECT l.course_id, c.creator_id
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1
    `;
    const existingLessonResult = await pool.query(existingLessonQuery, [id]);

    if (existingLessonResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    const existingLesson = existingLessonResult.rows[0];

    // Check authorization (course owner or admin)
    // Convert both to strings for comparison to handle UUID type differences
    const courseCreatorId = String(existingLesson.creator_id);
    const currentUserId = String(userId);
    
    console.log('Delete lesson authorization check:', {
      courseCreatorId,
      currentUserId,
      match: courseCreatorId === currentUserId,
      userRole
    });
    
    if (courseCreatorId !== currentUserId && userRole !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this lesson'
      });
    }

    // Delete lesson (cascade will handle related records)
    await pool.query('DELETE FROM lessons WHERE id = $1', [id]);

    return res.status(200).json({
      message: 'Lesson deleted successfully'
    });
  } catch (error) {
    console.error('Delete lesson error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete lesson'
    });
  }
}

/**
 * Get course lessons ordered by order field
 * GET /api/courses/:id/lessons
 * @param {Object} req.params - { id }
 * @returns {Object} { lessons }
 */
export async function getCourseLessons(req, res) {
  try {
    const { id } = req.params;

    // Verify course exists
    const courseQuery = 'SELECT is_published, creator_id FROM courses WHERE id = $1';
    const courseResult = await pool.query(courseQuery, [id]);

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Course not found'
      });
    }

    const course = courseResult.rows[0];

    // Check if user can view unpublished course's lessons
    if (!course.is_published) {
      // Convert both to strings for comparison to handle UUID type differences
      const courseCreatorId = String(course.creator_id);
      const currentUserId = req.user ? String(req.user.userId) : null;
      
      if (!req.user || (courseCreatorId !== currentUserId && req.user.role !== 'admin')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view lessons from unpublished course'
        });
      }
    }

    // Get lessons ordered by order field
    const lessonsQuery = `
      SELECT id, course_id, title, content, video_url, "order", duration_minutes, created_at, updated_at
      FROM lessons
      WHERE course_id = $1
      ORDER BY "order" ASC
    `;
    const lessonsResult = await pool.query(lessonsQuery, [id]);

    const lessons = lessonsResult.rows.map(lesson => ({
      id: lesson.id,
      courseId: lesson.course_id,
      title: lesson.title,
      content: lesson.content,
      videoUrl: lesson.video_url,
      order: lesson.order,
      durationMinutes: lesson.duration_minutes,
      createdAt: lesson.created_at,
      updatedAt: lesson.updated_at
    }));

    return res.status(200).json({
      lessons
    });
  } catch (error) {
    console.error('Get course lessons error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get course lessons'
    });
  }
}

/**
 * Mark lesson as complete
 * POST /api/lessons/:id/complete
 * @param {Object} req.params - { id }
 * @returns {Object} { completed, progress, certificateId }
 */
export async function completeLessonHandler(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Import completion service
    const { markLessonComplete } = await import('../services/completion.service.js');

    // Mark lesson complete
    const result = await markLessonComplete(userId, id);

    return res.status(200).json({
      completed: result.completed,
      progress: result.progress,
      completedLessons: result.completedLessons,
      totalLessons: result.totalLessons,
      courseCompleted: result.courseCompleted,
      certificateId: result.certificateId || null
    });
  } catch (error) {
    console.error('Complete lesson error:', error);

    // Handle specific error cases
    if (error.message === 'Lesson not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    if (error.message === 'User is not enrolled in this course') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be enrolled in the course to complete lessons'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to mark lesson as complete'
    });
  }
}


/**
 * Analyze lesson transcript and generate structured learning materials
 * POST /api/lessons/:lessonId/analyze-transcript
 * @param {Object} req.body - { transcript }
 * @returns {Object} { notes, keyConcepts, highlights, mcqs }
 */
export async function analyzeTranscript(req, res) {
  try {
    console.log('[Transcript Analysis] Starting analysis...');
    const lessonId = req.params.lessonId;
    const { transcript } = req.body;
    const userId = req.user.userId;

    // Validate transcript
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      console.log('[Transcript Analysis] Validation failed: transcript missing or invalid');
      return res.status(400).json({
        error: 'Validation error',
        message: 'Transcript text is required and must be a non-empty string',
        field: 'transcript'
      });
    }

    // Verify lesson exists and user has access
    const lessonQuery = `
      SELECT l.id, l.title, l.course_id, c.creator_id, c.is_published
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1
    `;
    const lessonResult = await pool.query(lessonQuery, [lessonId]);

    if (lessonResult.rows.length === 0) {
      console.log('[Transcript Analysis] Lesson not found');
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    const lesson = lessonResult.rows[0];

    // Check if user is enrolled in the course or is the creator
    const isCreator = String(lesson.creator_id) === String(userId);
    
    if (!isCreator) {
      const enrollmentQuery = `
        SELECT id FROM enrollments 
        WHERE user_id = $1 AND course_id = $2 AND status = 'active'
      `;
      const enrollmentResult = await pool.query(enrollmentQuery, [userId, lesson.course_id]);
      
      if (enrollmentResult.rows.length === 0 && !lesson.is_published) {
        console.log('[Transcript Analysis] Access denied: user not enrolled');
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You must be enrolled in this course to analyze transcripts'
        });
      }
    }

    console.log('[Transcript Analysis] Calling AI service...');
    console.log('[Transcript Analysis] Transcript length:', transcript.length);

    // Analyze transcript with AI
    const analysis = await analyzeTranscriptWithAI(transcript);

    console.log('[Transcript Analysis] Analysis completed successfully');
    console.log('[Transcript Analysis] Generated:', {
      noteSections: analysis.notes?.sections?.length,
      keyConcepts: analysis.keyConcepts?.length,
      highlights: analysis.highlights?.length,
      mcqs: analysis.mcqs?.length
    });

    return res.status(200).json({
      lessonId,
      lessonTitle: lesson.title,
      ...analysis
    });

  } catch (error) {
    console.error('[Transcript Analysis] Error:', error);
    console.error('[Transcript Analysis] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'API rate limit exceeded. Please try again later.'
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
      message: 'Failed to analyze transcript',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Analyze transcript without lesson context (for demo/testing)
 * POST /api/lessons/analyze-transcript-demo
 * @param {Object} req.body - { transcript }
 * @returns {Object} { notes, keyConcepts, highlights, mcqs }
 */
export async function analyzeTranscriptDemo(req, res) {
  try {
    console.log('[Transcript Analysis Demo] Starting analysis...');
    const { transcript } = req.body;

    // Validate transcript
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      console.log('[Transcript Analysis Demo] Validation failed: transcript missing or invalid');
      return res.status(400).json({
        error: 'Validation error',
        message: 'Transcript text is required and must be a non-empty string',
        field: 'transcript'
      });
    }

    console.log('[Transcript Analysis Demo] Calling AI service...');
    console.log('[Transcript Analysis Demo] Transcript length:', transcript.length);

    // Analyze transcript with AI
    const analysis = await analyzeTranscriptWithAI(transcript);

    console.log('[Transcript Analysis Demo] Analysis completed successfully');
    console.log('[Transcript Analysis Demo] Generated:', {
      noteSections: analysis.notes?.sections?.length,
      keyConcepts: analysis.keyConcepts?.length,
      highlights: analysis.highlights?.length,
      mcqs: analysis.mcqs?.length
    });

    return res.status(200).json({
      lessonTitle: 'Demo Analysis',
      ...analysis
    });

  } catch (error) {
    console.error('[Transcript Analysis Demo] Error:', error);
    console.error('[Transcript Analysis Demo] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'API rate limit exceeded. Please try again later.'
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
      message: 'Failed to analyze transcript',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}


/**
 * Get transcript for a lesson
 * GET /api/lessons/:lessonId/transcript
 * @returns {Object} { transcript }
 */
export async function getTranscript(req, res) {
  try {
    const lessonId = req.params.lessonId;

    const query = `
      SELECT t.id, t.content, t.timestamps, t.language, t.created_at, t.updated_at
      FROM transcripts t
      WHERE t.lesson_id = $1
    `;
    
    const result = await pool.query(query, [lessonId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Transcript not found for this lesson'
      });
    }
    
    const transcript = result.rows[0];
    
    return res.status(200).json({
      transcript: {
        id: transcript.id,
        text: transcript.content,
        segments: transcript.timestamps,
        language: transcript.language,
        createdAt: transcript.created_at,
        updatedAt: transcript.updated_at
      }
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get transcript'
    });
  }
}

/**
 * Create or update transcript for a lesson
 * POST /api/lessons/:lessonId/transcript
 * @param {Object} req.body - { content, timestamps, language }
 * @returns {Object} { transcript }
 */
export async function saveTranscript(req, res) {
  try {
    const lessonId = req.params.lessonId;
    const userId = req.user.userId;
    const { content, timestamps, language = 'en' } = req.body;

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Transcript content is required',
        field: 'content'
      });
    }

    // Validate transcript length
    const MIN_LENGTH = 50; // Minimum 50 characters
    const MAX_LENGTH = 500000; // Maximum 500,000 characters (500 KB)
    const RECOMMENDED_MAX = 100000; // Recommended max for optimal AI processing

    if (content.length < MIN_LENGTH) {
      return res.status(400).json({
        error: 'Validation error',
        message: `Transcript is too short. Minimum ${MIN_LENGTH} characters required.`,
        field: 'content',
        currentLength: content.length,
        minLength: MIN_LENGTH
      });
    }

    if (content.length > MAX_LENGTH) {
      return res.status(400).json({
        error: 'Validation error',
        message: `Transcript is too long. Maximum ${MAX_LENGTH} characters allowed.`,
        field: 'content',
        currentLength: content.length,
        maxLength: MAX_LENGTH,
        suggestion: 'Consider splitting this into multiple lessons for better learning experience.'
      });
    }

    // Warning for large transcripts (but still allow)
    if (content.length > RECOMMENDED_MAX) {
      console.warn(`[Transcript] Large transcript detected: ${content.length} characters (recommended max: ${RECOMMENDED_MAX})`);
    }

    // Verify lesson exists and user is the creator
    const lessonQuery = `
      SELECT l.id, c.creator_id
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1
    `;
    const lessonResult = await pool.query(lessonQuery, [lessonId]);

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    const lesson = lessonResult.rows[0];
    
    if (String(lesson.creator_id) !== String(userId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the course creator can add transcripts'
      });
    }

    // Check if transcript already exists
    const checkQuery = 'SELECT id FROM transcripts WHERE lesson_id = $1';
    const checkResult = await pool.query(checkQuery, [lessonId]);

    let transcript;
    
    if (checkResult.rows.length > 0) {
      // Update existing transcript
      const updateQuery = `
        UPDATE transcripts
        SET content = $1, timestamps = $2, language = $3, updated_at = NOW()
        WHERE lesson_id = $4
        RETURNING id, content, timestamps, language, created_at, updated_at
      `;
      const updateResult = await pool.query(updateQuery, [
        content,
        timestamps ? JSON.stringify(timestamps) : null,
        language,
        lessonId
      ]);
      transcript = updateResult.rows[0];
    } else {
      // Create new transcript
      const insertQuery = `
        INSERT INTO transcripts (lesson_id, content, timestamps, language)
        VALUES ($1, $2, $3, $4)
        RETURNING id, content, timestamps, language, created_at, updated_at
      `;
      const insertResult = await pool.query(insertQuery, [
        lessonId,
        content,
        timestamps ? JSON.stringify(timestamps) : null,
        language
      ]);
      transcript = insertResult.rows[0];
    }

    return res.status(200).json({
      transcript: {
        id: transcript.id,
        text: transcript.content,
        segments: transcript.timestamps,
        language: transcript.language,
        createdAt: transcript.created_at,
        updatedAt: transcript.updated_at
      }
    });
  } catch (error) {
    console.error('Save transcript error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to save transcript'
    });
  }
}

/**
 * Fetch transcript from YouTube video
 * POST /api/lessons/:lessonId/transcript/fetch-youtube
 * @returns {Object} { transcript }
 */
export async function fetchYouTubeTranscript(req, res) {
  try {
    const lessonId = req.params.lessonId;
    const userId = req.user.userId;
    const { language = 'en' } = req.body;

    // Verify lesson exists and user is the creator
    const lessonQuery = `
      SELECT l.id, l.video_url, c.creator_id
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1
    `;
    const lessonResult = await pool.query(lessonQuery, [lessonId]);

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    const lesson = lessonResult.rows[0];
    
    if (String(lesson.creator_id) !== String(userId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the course creator can fetch transcripts'
      });
    }

    if (!lesson.video_url) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Lesson does not have a video URL'
      });
    }

    // Fetch YouTube captions
    const { fetchYouTubeCaptions } = await import('../services/youtube.service.js');
    
    try {
      const captionData = await fetchYouTubeCaptions(lesson.video_url, language);
      
      // Save the fetched transcript
      const checkQuery = 'SELECT id FROM transcripts WHERE lesson_id = $1';
      const checkResult = await pool.query(checkQuery, [lessonId]);

      let transcript;
      
      if (checkResult.rows.length > 0) {
        // Update existing transcript
        const updateQuery = `
          UPDATE transcripts
          SET content = $1, timestamps = $2, language = $3, updated_at = NOW()
          WHERE lesson_id = $4
          RETURNING id, content, timestamps, language, created_at, updated_at
        `;
        const updateResult = await pool.query(updateQuery, [
          captionData.content,
          JSON.stringify(captionData.timestamps),
          captionData.language,
          lessonId
        ]);
        transcript = updateResult.rows[0];
      } else {
        // Create new transcript
        const insertQuery = `
          INSERT INTO transcripts (lesson_id, content, timestamps, language)
          VALUES ($1, $2, $3, $4)
          RETURNING id, content, timestamps, language, created_at, updated_at
        `;
        const insertResult = await pool.query(insertQuery, [
          lessonId,
          captionData.content,
          JSON.stringify(captionData.timestamps),
          captionData.language
        ]);
        transcript = insertResult.rows[0];
      }

      return res.status(200).json({
        transcript: {
          id: transcript.id,
          text: transcript.content,
          segments: transcript.timestamps,
          language: transcript.language,
          createdAt: transcript.created_at,
          updatedAt: transcript.updated_at
        },
        source: captionData.source
      });
    } catch (fetchError) {
      return res.status(400).json({
        error: 'Fetch error',
        message: fetchError.message || 'Failed to fetch YouTube captions. The video may not have captions available.'
      });
    }
  } catch (error) {
    console.error('Fetch YouTube transcript error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch YouTube transcript'
    });
  }
}

/**
 * Delete transcript for a lesson
 * DELETE /api/lessons/:lessonId/transcript
 * @returns {Object} { message }
 */
export async function deleteTranscript(req, res) {
  try {
    const lessonId = req.params.lessonId;
    const userId = req.user.userId;

    // Verify lesson exists and user is the creator
    const lessonQuery = `
      SELECT l.id, c.creator_id
      FROM lessons l
      JOIN courses c ON l.course_id = c.id
      WHERE l.id = $1
    `;
    const lessonResult = await pool.query(lessonQuery, [lessonId]);

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Lesson not found'
      });
    }

    const lesson = lessonResult.rows[0];
    
    if (String(lesson.creator_id) !== String(userId)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the course creator can delete transcripts'
      });
    }

    // Delete transcript
    const deleteQuery = 'DELETE FROM transcripts WHERE lesson_id = $1 RETURNING id';
    const deleteResult = await pool.query(deleteQuery, [lessonId]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Transcript not found'
      });
    }

    return res.status(200).json({
      message: 'Transcript deleted successfully'
    });
  } catch (error) {
    console.error('Delete transcript error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete transcript'
    });
  }
}
