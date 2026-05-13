import pool from '../config/database.js';

/**
 * Submit creator application
 * POST /api/creators/apply
 * @param {Object} req.body - { bio, expertise, portfolioUrl }
 * @returns {Object} { application }
 * Requirements: 7.1
 */
export async function applyForCreator(req, res) {
  try {
    const { bio, expertise, portfolioUrl } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!bio || !expertise) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Bio and expertise are required',
        field: !bio ? 'bio' : 'expertise'
      });
    }

    // Check if user already has an application
    const existingQuery = 'SELECT id, status FROM creator_applications WHERE user_id = $1';
    const existingResult = await pool.query(existingQuery, [userId]);

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'You already have a creator application',
        application: {
          id: existingResult.rows[0].id,
          status: existingResult.rows[0].status
        }
      });
    }

    // Create new application
    const insertQuery = `
      INSERT INTO creator_applications (user_id, bio, expertise, portfolio_url, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id, user_id, bio, expertise, portfolio_url, status, created_at, updated_at
    `;
    const insertResult = await pool.query(insertQuery, [userId, bio, expertise, portfolioUrl || null]);
    const application = insertResult.rows[0];

    return res.status(201).json({
      application: {
        id: application.id,
        userId: application.user_id,
        bio: application.bio,
        expertise: application.expertise,
        portfolioUrl: application.portfolio_url,
        status: application.status,
        createdAt: application.created_at,
        updatedAt: application.updated_at
      }
    });
  } catch (error) {
    console.error('Apply for creator error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to submit creator application'
    });
  }
}

/**
 * Get user's creator application status
 * GET /api/creators/application
 * @returns {Object} { application }
 * Requirements: 7.1
 */
export async function getMyApplication(req, res) {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT 
        id, user_id, bio, expertise, portfolio_url, status, 
        admin_notes, reviewed_at, created_at, updated_at
      FROM creator_applications
      WHERE user_id = $1
    `;
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'No creator application found'
      });
    }

    const application = result.rows[0];

    return res.status(200).json({
      application: {
        id: application.id,
        userId: application.user_id,
        bio: application.bio,
        expertise: application.expertise,
        portfolioUrl: application.portfolio_url,
        status: application.status,
        adminNotes: application.admin_notes,
        reviewedAt: application.reviewed_at,
        createdAt: application.created_at,
        updatedAt: application.updated_at
      }
    });
  } catch (error) {
    console.error('Get my application error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get application'
    });
  }
}

/**
 * Get creator dashboard overview
 * GET /api/creators/dashboard
 * @returns {Object} { totalCourses, totalEnrollments, totalCompletions, averageRating }
 * Requirements: 8.3
 */
export async function getCreatorDashboard(req, res) {
  try {
    const creatorId = req.user.userId;

    // Get total courses
    const coursesQuery = 'SELECT COUNT(*) as count FROM courses WHERE creator_id = $1';
    const coursesResult = await pool.query(coursesQuery, [creatorId]);
    const totalCourses = parseInt(coursesResult.rows[0].count);

    // Get total enrollments across creator's courses
    const enrollmentsQuery = `
      SELECT COUNT(*) as count
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.creator_id = $1
    `;
    const enrollmentsResult = await pool.query(enrollmentsQuery, [creatorId]);
    const totalEnrollments = parseInt(enrollmentsResult.rows[0].count);

    // Get total completions
    const completionsQuery = `
      SELECT COUNT(*) as count
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.creator_id = $1 AND e.status = 'completed'
    `;
    const completionsResult = await pool.query(completionsQuery, [creatorId]);
    const totalCompletions = parseInt(completionsResult.rows[0].count);

    // Calculate completion rate
    const completionRate = totalEnrollments > 0 
      ? Math.round((totalCompletions / totalEnrollments) * 100) 
      : 0;

    // Get certificates issued for creator's courses
    const certificatesQuery = `
      SELECT COUNT(*) as count
      FROM certificates cert
      JOIN courses c ON cert.course_id = c.id
      WHERE c.creator_id = $1
    `;
    const certificatesResult = await pool.query(certificatesQuery, [creatorId]);
    const certificatesIssued = parseInt(certificatesResult.rows[0].count);

    // Get recent courses (last 5)
    const recentCoursesQuery = `
      SELECT 
        c.id, c.title, c.is_published, c.created_at,
        COUNT(e.id) as enrollment_count
      FROM courses c
      LEFT JOIN enrollments e ON c.id = e.course_id
      WHERE c.creator_id = $1
      GROUP BY c.id, c.title, c.is_published, c.created_at
      ORDER BY c.created_at DESC
      LIMIT 5
    `;
    const recentCoursesResult = await pool.query(recentCoursesQuery, [creatorId]);
    const recentCourses = recentCoursesResult.rows.map(course => ({
      id: course.id,
      title: course.title,
      isPublished: course.is_published,
      enrollmentCount: parseInt(course.enrollment_count),
      createdAt: course.created_at
    }));

    return res.status(200).json({
      totalCourses,
      totalEnrollments,
      totalCompletions,
      completionRate,
      certificatesIssued,
      recentCourses
    });
  } catch (error) {
    console.error('Get creator dashboard error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get creator dashboard'
    });
  }
}

/**
 * Get creator's courses with enrollment stats
 * GET /api/creators/courses
 * @param {Object} req.query - { page?, limit? }
 * @returns {Object} { courses, pagination }
 * Requirements: 8.3
 */
export async function getCreatorCourses(req, res) {
  try {
    const creatorId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get courses with enrollment counts
    const query = `
      SELECT 
        c.id, c.title, c.description, c.thumbnail_url, c.duration_hours,
        c.difficulty, c.is_published, c.created_at, c.updated_at,
        COUNT(DISTINCT e.id) as enrollment_count,
        COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completion_count,
        ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) as skills
      FROM courses c
      LEFT JOIN enrollments e ON c.id = e.course_id
      LEFT JOIN course_skills cs ON c.id = cs.course_id
      LEFT JOIN skills s ON cs.skill_id = s.id
      WHERE c.creator_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [creatorId, parseInt(limit), offset]);

    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM courses WHERE creator_id = $1';
    const countResult = await pool.query(countQuery, [creatorId]);
    const total = parseInt(countResult.rows[0].count);

    // Format courses
    const courses = result.rows.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnail_url,
      durationHours: course.duration_hours,
      difficulty: course.difficulty,
      isPublished: course.is_published,
      skills: course.skills || [],
      enrollmentCount: parseInt(course.enrollment_count),
      completionCount: parseInt(course.completion_count),
      completionRate: parseInt(course.enrollment_count) > 0 
        ? Math.round((parseInt(course.completion_count) / parseInt(course.enrollment_count)) * 100)
        : 0,
      createdAt: course.created_at,
      updatedAt: course.updated_at
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return res.status(200).json({
      courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext,
        hasPrev
      }
    });
  } catch (error) {
    console.error('Get creator courses error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get creator courses'
    });
  }
}

/**
 * Get creator analytics with trends
 * GET /api/creators/analytics
 * @param {Object} req.query - { startDate?, endDate? }
 * @returns {Object} { enrollmentTrends, completionTrends, popularCourses }
 * Requirements: 8.3
 */
export async function getCreatorAnalytics(req, res) {
  try {
    const creatorId = req.user.userId;
    const { startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = '';
    const queryParams = [creatorId];
    if (startDate && endDate) {
      dateFilter = 'AND e.enrolled_at BETWEEN $2 AND $3';
      queryParams.push(startDate, endDate);
    }

    // Get enrollment trends (by month)
    const enrollmentTrendsQuery = `
      SELECT 
        DATE_TRUNC('month', e.enrolled_at) as month,
        COUNT(*) as enrollments
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.creator_id = $1 ${dateFilter}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `;
    const enrollmentTrendsResult = await pool.query(enrollmentTrendsQuery, queryParams);

    const enrollmentTrends = enrollmentTrendsResult.rows.map(row => ({
      month: row.month,
      enrollments: parseInt(row.enrollments)
    }));

    // Get completion trends (by month)
    const completionTrendsQuery = `
      SELECT 
        DATE_TRUNC('month', e.completed_at) as month,
        COUNT(*) as completions
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.creator_id = $1 AND e.status = 'completed' ${dateFilter.replace('enrolled_at', 'completed_at')}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `;
    const completionTrendsResult = await pool.query(completionTrendsQuery, queryParams);

    const completionTrends = completionTrendsResult.rows.map(row => ({
      month: row.month,
      completions: parseInt(row.completions)
    }));

    // Get popular courses (top 5 by enrollments)
    const popularCoursesQuery = `
      SELECT 
        c.id, c.title, 
        COUNT(e.id) as enrollment_count
      FROM courses c
      LEFT JOIN enrollments e ON c.id = e.course_id
      WHERE c.creator_id = $1
      GROUP BY c.id, c.title
      ORDER BY enrollment_count DESC
      LIMIT 5
    `;
    const popularCoursesResult = await pool.query(popularCoursesQuery, [creatorId]);

    const popularCourses = popularCoursesResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      enrollmentCount: parseInt(row.enrollment_count)
    }));

    return res.status(200).json({
      enrollmentTrends,
      completionTrends,
      popularCourses,
      dateRange: startDate && endDate ? { startDate, endDate } : null
    });
  } catch (error) {
    console.error('Get creator analytics error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get creator analytics'
    });
  }
}
