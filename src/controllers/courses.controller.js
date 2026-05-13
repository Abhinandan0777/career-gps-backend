import pool from '../config/database.js';

/**
 * Create a new course
 * POST /api/courses
 * @param {Object} req.body - { title, description, skillIds, durationHours, difficulty, isPublished }
 * @returns {Object} { course }
 */
export async function createCourse(req, res) {
  try {
    const { title, description, skillIds, durationHours, difficulty, isPublished } = req.body;
    const creatorId = req.user.userId;

    // Validate required fields
    if (!title) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title is required',
        field: 'title'
      });
    }

    // Validate title length
    if (title.length < 5 || title.length > 255) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title must be between 5 and 255 characters',
        field: 'title'
      });
    }

    // Validate difficulty if provided
    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    if (difficulty && !validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Difficulty must be one of: beginner, intermediate, advanced',
        field: 'difficulty'
      });
    }

    // Validate duration if provided
    if (durationHours !== undefined && (durationHours < 0 || !Number.isInteger(durationHours))) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Duration must be a positive integer',
        field: 'durationHours'
      });
    }

    // Create course record
    const insertCourseQuery = `
      INSERT INTO courses (title, description, creator_id, duration_hours, difficulty, is_published)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, description, creator_id, thumbnail_url, duration_hours, difficulty, is_published, created_at, updated_at
    `;
    const insertCourseResult = await pool.query(insertCourseQuery, [
      title,
      description || null,
      creatorId,
      durationHours || null,
      difficulty || null,
      isPublished || false
    ]);

    const course = insertCourseResult.rows[0];

    // Link skills to course if provided
    if (skillIds && Array.isArray(skillIds) && skillIds.length > 0) {
      const insertSkillsQuery = `
        INSERT INTO course_skills (course_id, skill_id)
        VALUES ($1, $2)
        ON CONFLICT (course_id, skill_id) DO NOTHING
      `;
      
      for (const skillId of skillIds) {
        await pool.query(insertSkillsQuery, [course.id, skillId]);
      }
    }

    return res.status(201).json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        creatorId: course.creator_id,
        thumbnailUrl: course.thumbnail_url,
        durationHours: course.duration_hours,
        difficulty: course.difficulty,
        isPublished: course.is_published,
        createdAt: course.created_at,
        updatedAt: course.updated_at
      }
    });
  } catch (error) {
    console.error('Create course error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create course'
    });
  }
}

/**
 * List courses with pagination and filters
 * GET /api/courses
 * @param {Object} req.query - { page, limit, skillId, creatorId, difficulty, isPublished }
 * @returns {Object} { courses, pagination }
 */
export async function listCourses(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      skillId,
      creatorId,
      difficulty,
      isPublished,
      search
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause based on filters
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by search query (title or description)
    if (search) {
      conditions.push(`(c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by skill
    if (skillId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM course_skills cs
        WHERE cs.course_id = c.id AND cs.skill_id = $${paramIndex}
      )`);
      params.push(skillId);
      paramIndex++;
    }

    // Filter by creator
    if (creatorId) {
      conditions.push(`c.creator_id = $${paramIndex}`);
      params.push(creatorId);
      paramIndex++;
    }

    // Filter by difficulty
    if (difficulty) {
      conditions.push(`c.difficulty = $${paramIndex}`);
      params.push(difficulty);
      paramIndex++;
    }

    // Filter by publication status
    // If user is not creator/admin, only show published courses
    if (isPublished !== undefined) {
      conditions.push(`c.is_published = $${paramIndex}`);
      params.push(isPublished === 'true');
      paramIndex++;
    } else if (!req.user || (req.user.role !== 'creator' && req.user.role !== 'admin')) {
      conditions.push('c.is_published = true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) FROM courses c ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get courses with pagination
    const coursesQuery = `
      SELECT
        c.id, c.title, c.description, c.creator_id, c.thumbnail_url,
        c.duration_hours, c.difficulty, c.is_published, c.created_at, c.updated_at,
        u.name as creator_name
      FROM courses c
      LEFT JOIN users u ON c.creator_id = u.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);
    const coursesResult = await pool.query(coursesQuery, params);

    const courses = coursesResult.rows.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      creatorId: course.creator_id,
      creatorName: course.creator_name,
      thumbnailUrl: course.thumbnail_url,
      durationHours: course.duration_hours,
      difficulty: course.difficulty,
      isPublished: course.is_published,
      createdAt: course.created_at,
      updatedAt: course.updated_at
    }));

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      courses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('List courses error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list courses'
    });
  }
}



/**
 * Get course by ID with details
 * GET /api/courses/:id
 * @param {Object} req.params - { id }
 * @returns {Object} { course, skills, lessons }
 */
export async function getCourseById(req, res) {
  try {
    const { id } = req.params;

    // Get course details
    const courseQuery = `
      SELECT 
        c.id, c.title, c.description, c.creator_id, c.thumbnail_url,
        c.duration_hours, c.difficulty, c.is_published, c.created_at, c.updated_at,
        u.name as creator_name, u.email as creator_email
      FROM courses c
      LEFT JOIN users u ON c.creator_id = u.id
      WHERE c.id = $1
    `;
    const courseResult = await pool.query(courseQuery, [id]);

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Course not found'
      });
    }

    const course = courseResult.rows[0];

    // Check if user can view unpublished course
    if (!course.is_published) {
      if (!req.user || (req.user.userId !== course.creator_id && req.user.role !== 'admin')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Cannot view unpublished course'
        });
      }
    }

    // Get course skills
    const skillsQuery = `
      SELECT s.id, s.name, s.category, s.description
      FROM skills s
      JOIN course_skills cs ON s.id = cs.skill_id
      WHERE cs.course_id = $1
    `;
    const skillsResult = await pool.query(skillsQuery, [id]);

    // Get course lessons count
    const lessonsCountQuery = 'SELECT COUNT(*) FROM lessons WHERE course_id = $1';
    const lessonsCountResult = await pool.query(lessonsCountQuery, [id]);
    const lessonsCount = parseInt(lessonsCountResult.rows[0].count);

    return res.status(200).json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        creatorId: course.creator_id,
        creatorName: course.creator_name,
        thumbnailUrl: course.thumbnail_url,
        durationHours: course.duration_hours,
        difficulty: course.difficulty,
        isPublished: course.is_published,
        lessonsCount,
        createdAt: course.created_at,
        updatedAt: course.updated_at
      },
      skills: skillsResult.rows.map(skill => ({
        id: skill.id,
        name: skill.name,
        category: skill.category,
        description: skill.description
      }))
    });
  } catch (error) {
    console.error('Get course error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get course'
    });
  }
}

/**
 * Update course
 * PUT /api/courses/:id
 * @param {Object} req.params - { id }
 * @param {Object} req.body - { title, description, skillIds, durationHours, difficulty, isPublished }
 * @returns {Object} { course }
 */
export async function updateCourse(req, res) {
  try {
    const { id } = req.params;
    const { title, description, skillIds, durationHours, difficulty, isPublished } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Get existing course
    const existingCourseQuery = 'SELECT creator_id FROM courses WHERE id = $1';
    const existingCourseResult = await pool.query(existingCourseQuery, [id]);

    if (existingCourseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Course not found'
      });
    }

    const existingCourse = existingCourseResult.rows[0];

    // Check authorization (owner or admin)
    if (existingCourse.creator_id !== userId && userRole !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this course'
      });
    }

    // Validate title if provided
    if (title !== undefined && (title.length < 5 || title.length > 255)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title must be between 5 and 255 characters',
        field: 'title'
      });
    }

    // Validate difficulty if provided
    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    if (difficulty !== undefined && !validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Difficulty must be one of: beginner, intermediate, advanced',
        field: 'difficulty'
      });
    }

    // Validate duration if provided
    if (durationHours !== undefined && (durationHours < 0 || !Number.isInteger(durationHours))) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Duration must be a positive integer',
        field: 'durationHours'
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

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (durationHours !== undefined) {
      updates.push(`duration_hours = $${paramIndex}`);
      params.push(durationHours);
      paramIndex++;
    }

    if (difficulty !== undefined) {
      updates.push(`difficulty = $${paramIndex}`);
      params.push(difficulty);
      paramIndex++;
    }

    if (isPublished !== undefined) {
      updates.push(`is_published = $${paramIndex}`);
      params.push(isPublished);
      paramIndex++;
    }

    if (updates.length === 0 && !skillIds) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No fields to update'
      });
    }

    // Update course if there are field updates
    if (updates.length > 0) {
      const updateQuery = `
        UPDATE courses
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING id, title, description, creator_id, thumbnail_url, duration_hours, difficulty, is_published, created_at, updated_at
      `;
      params.push(id);
      const updateResult = await pool.query(updateQuery, params);
    }

    // Update skills if provided
    if (skillIds !== undefined && Array.isArray(skillIds)) {
      // Delete existing skills
      await pool.query('DELETE FROM course_skills WHERE course_id = $1', [id]);

      // Insert new skills
      if (skillIds.length > 0) {
        const insertSkillsQuery = `
          INSERT INTO course_skills (course_id, skill_id)
          VALUES ($1, $2)
          ON CONFLICT (course_id, skill_id) DO NOTHING
        `;
        
        for (const skillId of skillIds) {
          await pool.query(insertSkillsQuery, [id, skillId]);
        }
      }
    }

    // Get updated course
    const courseQuery = `
      SELECT id, title, description, creator_id, thumbnail_url, duration_hours, difficulty, is_published, created_at, updated_at
      FROM courses
      WHERE id = $1
    `;
    const courseResult = await pool.query(courseQuery, [id]);
    const course = courseResult.rows[0];

    return res.status(200).json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        creatorId: course.creator_id,
        thumbnailUrl: course.thumbnail_url,
        durationHours: course.duration_hours,
        difficulty: course.difficulty,
        isPublished: course.is_published,
        createdAt: course.created_at,
        updatedAt: course.updated_at
      }
    });
  } catch (error) {
    console.error('Update course error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update course'
    });
  }
}

/**
 * Delete course
 * DELETE /api/courses/:id
 * @param {Object} req.params - { id }
 * @returns {Object} { message }
 */
export async function deleteCourse(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Get existing course
    const existingCourseQuery = 'SELECT creator_id FROM courses WHERE id = $1';
    const existingCourseResult = await pool.query(existingCourseQuery, [id]);

    if (existingCourseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Course not found'
      });
    }

    const existingCourse = existingCourseResult.rows[0];

    // Check authorization (owner or admin)
    if (existingCourse.creator_id !== userId && userRole !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this course'
      });
    }

    // Delete course (cascade will handle related records)
    await pool.query('DELETE FROM courses WHERE id = $1', [id]);

    return res.status(200).json({
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Delete course error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete course'
    });
  }
}
