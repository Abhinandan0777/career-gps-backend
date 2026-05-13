import pool from '../config/database.js';
import {
  enrollUserInCourse,
  checkExistingEnrollment,
  getEnrollmentWithProgress
} from '../services/enrollment.service.js';

/**
 * Enroll user in a course
 * POST /api/enrollments
 * @param {Object} req.body - { courseId }
 * @returns {Object} { enrollment }
 * Requirements: 5.1
 */
export async function enrollInCourse(req, res) {
  try {
    const { courseId } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!courseId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Course ID is required',
        field: 'courseId'
      });
    }

    // Enroll user in course (idempotent)
    const enrollment = await enrollUserInCourse(userId, courseId);

    // Determine status code (201 for new, 200 for existing)
    const statusCode = enrollment.enrolled_at && 
      new Date(enrollment.enrolled_at).getTime() > Date.now() - 1000 ? 201 : 200;

    return res.status(statusCode).json({
      enrollment: {
        id: enrollment.id,
        userId: enrollment.user_id,
        courseId: enrollment.course_id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolled_at,
        completedAt: enrollment.completed_at,
        updatedAt: enrollment.updated_at
      }
    });
  } catch (error) {
    console.error('Enroll in course error:', error);

    if (error.message === 'Course not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Course not found'
      });
    }

    if (error.message === 'Cannot enroll in unpublished course') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Cannot enroll in unpublished course'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to enroll in course'
    });
  }
}

/**
 * Get user's enrollments
 * GET /api/enrollments
 * @param {Object} req.query - { status, page, limit }
 * @returns {Object} { enrollments, pagination }
 * Requirements: 5.1
 */
export async function getUserEnrollments(req, res) {
  try {
    const userId = req.user.userId;
    const {
      status,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = ['e.user_id = $1'];
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`e.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM enrollments e 
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get enrollments with course details
    const enrollmentsQuery = `
      SELECT 
        e.id, e.user_id, e.course_id, e.status, e.enrolled_at, e.completed_at, e.updated_at,
        c.title as course_title, c.description as course_description,
        c.thumbnail_url, c.duration_hours, c.difficulty
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE ${whereClause}
      ORDER BY e.enrolled_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);
    const enrollmentsResult = await pool.query(enrollmentsQuery, params);

    const enrollments = enrollmentsResult.rows.map(enrollment => ({
      id: enrollment.id,
      userId: enrollment.user_id,
      courseId: enrollment.course_id,
      status: enrollment.status,
      enrolledAt: enrollment.enrolled_at,
      completedAt: enrollment.completed_at,
      updatedAt: enrollment.updated_at,
      course: {
        title: enrollment.course_title,
        description: enrollment.course_description,
        thumbnailUrl: enrollment.thumbnail_url,
        durationHours: enrollment.duration_hours,
        difficulty: enrollment.difficulty
      }
    }));

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      enrollments,
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
    console.error('Get user enrollments error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get enrollments'
    });
  }
}

/**
 * Get enrollment details with progress
 * GET /api/enrollments/:id
 * @param {Object} req.params - { id }
 * @returns {Object} { enrollment, progress }
 * Requirements: 5.1, 5.3
 */
export async function getEnrollmentDetails(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Get enrollment with progress
    const enrollmentData = await getEnrollmentWithProgress(id);

    // Verify user owns this enrollment
    if (enrollmentData.enrollment.user_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view this enrollment'
      });
    }

    return res.status(200).json({
      enrollment: {
        id: enrollmentData.enrollment.id,
        userId: enrollmentData.enrollment.user_id,
        courseId: enrollmentData.enrollment.course_id,
        status: enrollmentData.enrollment.status,
        enrolledAt: enrollmentData.enrollment.enrolled_at,
        completedAt: enrollmentData.enrollment.completed_at,
        updatedAt: enrollmentData.enrollment.updated_at,
        course: {
          title: enrollmentData.enrollment.course_title,
          description: enrollmentData.enrollment.course_description
        }
      },
      progress: {
        completedLessons: enrollmentData.completedLessons,
        totalLessons: enrollmentData.totalLessons,
        percentage: enrollmentData.progress
      }
    });
  } catch (error) {
    console.error('Get enrollment details error:', error);

    if (error.message === 'Enrollment not found') {
      return res.status(404).json({
        error: 'Not found',
        message: 'Enrollment not found'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get enrollment details'
    });
  }
}

/**
 * Unenroll from course
 * DELETE /api/enrollments/:id
 * @param {Object} req.params - { id }
 * @returns {Object} { message }
 * Requirements: 5.1
 */
export async function unenrollFromCourse(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Get enrollment to verify ownership
    const enrollmentQuery = 'SELECT user_id FROM enrollments WHERE id = $1';
    const enrollmentResult = await pool.query(enrollmentQuery, [id]);

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Enrollment not found'
      });
    }

    const enrollment = enrollmentResult.rows[0];

    // Verify user owns this enrollment
    if (enrollment.user_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this enrollment'
      });
    }

    // Delete enrollment (cascade will handle completions)
    await pool.query('DELETE FROM enrollments WHERE id = $1', [id]);

    return res.status(200).json({
      message: 'Successfully unenrolled from course'
    });
  } catch (error) {
    console.error('Unenroll from course error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to unenroll from course'
    });
  }
}
