import pool from '../config/database.js';

/**
 * Enroll a user in a course with idempotency
 * 
 * @param {string} userId - User UUID
 * @param {string} courseId - Course UUID
 * @returns {Promise<Object>} Enrollment record
 * 
 * Requirements: 5.1, 11.5
 * 
 * Preconditions:
 * - userId must exist in users table
 * - courseId must exist in courses table
 * - Course must be published (is_published = true)
 * 
 * Postconditions:
 * - Returns existing enrollment if already enrolled (idempotent)
 * - Creates new enrollment with 'active' status if not enrolled
 * - Unique constraint (user_id, course_id) prevents duplicates
 * - enrolled_at timestamp is set to NOW() for new enrollments
 */
export async function enrollUserInCourse(userId, courseId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Step 1: Verify the course exists and is published
    const courseQuery = 'SELECT id, title, is_published FROM courses WHERE id = $1';
    const courseResult = await client.query(courseQuery, [courseId]);
    
    if (courseResult.rows.length === 0) {
      throw new Error('Course not found');
    }
    
    const course = courseResult.rows[0];
    
    if (!course.is_published) {
      throw new Error('Cannot enroll in unpublished course');
    }
    
    // Step 2: Check if enrollment already exists (idempotency check)
    const existingEnrollmentQuery = `
      SELECT id, user_id, course_id, status, enrolled_at, completed_at, updated_at
      FROM enrollments
      WHERE user_id = $1 AND course_id = $2
    `;
    const existingEnrollmentResult = await client.query(existingEnrollmentQuery, [userId, courseId]);
    
    // If enrollment exists, return it (idempotent behavior)
    if (existingEnrollmentResult.rows.length > 0) {
      await client.query('COMMIT');
      return existingEnrollmentResult.rows[0];
    }
    
    // Step 3: Create new enrollment with 'active' status
    const insertEnrollmentQuery = `
      INSERT INTO enrollments (user_id, course_id, status, enrolled_at)
      VALUES ($1, $2, 'active', NOW())
      RETURNING id, user_id, course_id, status, enrolled_at, completed_at, updated_at
    `;
    const insertResult = await client.query(insertEnrollmentQuery, [userId, courseId]);
    
    await client.query('COMMIT');
    
    return insertResult.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if a user is already enrolled in a course
 * 
 * @param {string} userId - User UUID
 * @param {string} courseId - Course UUID
 * @returns {Promise<Object|null>} Enrollment record or null if not enrolled
 * 
 * Requirements: 5.1
 */
export async function checkExistingEnrollment(userId, courseId) {
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT id, user_id, course_id, status, enrolled_at, completed_at, updated_at
      FROM enrollments
      WHERE user_id = $1 AND course_id = $2
    `;
    const result = await client.query(query, [userId, courseId]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
    
  } finally {
    client.release();
  }
}

/**
 * Get enrollment details with progress information
 * 
 * @param {string} enrollmentId - Enrollment UUID
 * @returns {Promise<Object>} Enrollment with progress details
 * 
 * Requirements: 5.3
 */
export async function getEnrollmentWithProgress(enrollmentId) {
  const client = await pool.connect();
  
  try {
    // Get enrollment details
    const enrollmentQuery = `
      SELECT e.id, e.user_id, e.course_id, e.status, e.enrolled_at, e.completed_at, e.updated_at,
             c.title as course_title, c.description as course_description
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.id = $1
    `;
    const enrollmentResult = await client.query(enrollmentQuery, [enrollmentId]);
    
    if (enrollmentResult.rows.length === 0) {
      throw new Error('Enrollment not found');
    }
    
    const enrollment = enrollmentResult.rows[0];
    
    // Get total lessons in the course
    const totalLessonsQuery = `
      SELECT COUNT(*) as total
      FROM lessons
      WHERE course_id = $1
    `;
    const totalLessonsResult = await client.query(totalLessonsQuery, [enrollment.course_id]);
    const totalLessons = parseInt(totalLessonsResult.rows[0].total);
    
    // Get completed lessons for this user
    const completedLessonsQuery = `
      SELECT COUNT(*) as completed
      FROM completions c
      JOIN lessons l ON c.lesson_id = l.id
      WHERE c.user_id = $1 AND l.course_id = $2
    `;
    const completedLessonsResult = await client.query(completedLessonsQuery, [enrollment.user_id, enrollment.course_id]);
    const completedLessons = parseInt(completedLessonsResult.rows[0].completed);
    
    // Calculate progress percentage
    const progress = totalLessons > 0 
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;
    
    return {
      enrollment,
      totalLessons,
      completedLessons,
      progress
    };
    
  } finally {
    client.release();
  }
}
