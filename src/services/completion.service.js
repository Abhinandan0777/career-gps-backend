import pool from '../config/database.js';
import { generateCertificate } from './certificate.service.js';

/**
 * Mark a lesson as complete for a user with idempotency
 * 
 * @param {string} userId - User UUID
 * @param {string} lessonId - Lesson UUID
 * @returns {Promise<Object>} Completion result with progress and certificate info
 * 
 * Requirements: 5.2, 5.3, 5.5
 * 
 * Preconditions:
 * - userId must exist in users table
 * - lessonId must exist in lessons table
 * - User must be enrolled in the lesson's course
 * 
 * Postconditions:
 * - Returns existing completion if already completed (idempotent)
 * - Creates new completion record if not completed
 * - Unique constraint (user_id, lesson_id) prevents duplicates
 * - Calculates and returns course progress percentage
 * - Updates enrollment status to 'completed' if progress reaches 100%
 * - completed_at timestamp is set to NOW() for new completions
 */
export async function markLessonComplete(userId, lessonId) {
  const client = await pool.connect();
  let clientReleased = false;
  
  try {
    await client.query('BEGIN');
    
    // Step 1: Verify the lesson exists and get course_id
    const lessonQuery = 'SELECT id, course_id, title FROM lessons WHERE id = $1';
    const lessonResult = await client.query(lessonQuery, [lessonId]);
    
    if (lessonResult.rows.length === 0) {
      throw new Error('Lesson not found');
    }
    
    const lesson = lessonResult.rows[0];
    const courseId = lesson.course_id;
    
    // Step 2: Verify user is enrolled in the course
    const enrollmentQuery = `
      SELECT id, status
      FROM enrollments
      WHERE user_id = $1 AND course_id = $2
    `;
    const enrollmentResult = await client.query(enrollmentQuery, [userId, courseId]);
    
    if (enrollmentResult.rows.length === 0) {
      throw new Error('User is not enrolled in this course');
    }
    
    const enrollment = enrollmentResult.rows[0];
    
    // Step 3: Check if lesson is already completed (idempotency check)
    const existingCompletionQuery = `
      SELECT id, user_id, lesson_id, completed_at
      FROM completions
      WHERE user_id = $1 AND lesson_id = $2
    `;
    const existingCompletionResult = await client.query(existingCompletionQuery, [userId, lessonId]);
    
    let isNewCompletion = false;
    
    // If not already completed, create completion record
    if (existingCompletionResult.rows.length === 0) {
      const insertCompletionQuery = `
        INSERT INTO completions (user_id, lesson_id, completed_at)
        VALUES ($1, $2, NOW())
        RETURNING id, user_id, lesson_id, completed_at
      `;
      await client.query(insertCompletionQuery, [userId, lessonId]);
      isNewCompletion = true;
    }
    
    // Step 4: Calculate course progress
    const progress = await calculateCourseProgress(client, userId, courseId);
    
    // Step 5: Update enrollment status to 'completed' if progress reaches 100%
    let certificateId = null;
    
    if (progress.percentage === 100 && enrollment.status !== 'completed') {
      const updateEnrollmentQuery = `
        UPDATE enrollments
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND course_id = $2
      `;
      await client.query(updateEnrollmentQuery, [userId, courseId]);
    }
    
    // Commit the transaction before generating certificate
    await client.query('COMMIT');
    
    // Step 6: Generate certificate when progress reaches 100%
    if (progress.percentage === 100) {
      try {
        // Generate certificate (idempotent - returns existing if already generated)
        const certificateResult = await generateCertificate(userId, courseId);
        certificateId = certificateResult.certificate.id;
      } catch (certError) {
        // Log certificate generation error but don't fail the completion
        console.error('Certificate generation error:', certError);
        // Certificate ID remains null if generation fails
      }
    }
    
    return {
      completed: true,
      isNewCompletion,
      progress: progress.percentage,
      completedLessons: progress.completedLessons,
      totalLessons: progress.totalLessons,
      courseCompleted: progress.percentage === 100,
      certificateId
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
}

/**
 * Calculate course progress for a user
 * 
 * @param {Object} client - Database client (for transaction support)
 * @param {string} userId - User UUID
 * @param {string} courseId - Course UUID
 * @returns {Promise<Object>} Progress data with percentage
 * 
 * Requirements: 5.3
 * 
 * Preconditions:
 * - userId must exist in users table
 * - courseId must exist in courses table
 * 
 * Postconditions:
 * - percentage is between 0 and 100 (inclusive)
 * - completedLessons never exceeds totalLessons
 */
export async function calculateCourseProgress(client, userId, courseId) {
  // Get total lessons in the course
  const totalLessonsQuery = `
    SELECT COUNT(*) as total
    FROM lessons
    WHERE course_id = $1
  `;
  const totalLessonsResult = await client.query(totalLessonsQuery, [courseId]);
  const totalLessons = parseInt(totalLessonsResult.rows[0].total);
  
  // Handle edge case: course with no lessons
  if (totalLessons === 0) {
    return {
      completedLessons: 0,
      totalLessons: 0,
      percentage: 0
    };
  }
  
  // Get completed lessons for this user in this course
  const completedLessonsQuery = `
    SELECT COUNT(*) as completed
    FROM completions c
    JOIN lessons l ON c.lesson_id = l.id
    WHERE c.user_id = $1 AND l.course_id = $2
  `;
  const completedLessonsResult = await client.query(completedLessonsQuery, [userId, courseId]);
  const completedLessons = parseInt(completedLessonsResult.rows[0].completed);
  
  // Calculate progress percentage
  const percentage = Math.round((completedLessons / totalLessons) * 100);
  
  return {
    completedLessons,
    totalLessons,
    percentage
  };
}

/**
 * Get course progress for a user (standalone version without transaction)
 * 
 * @param {string} userId - User UUID
 * @param {string} courseId - Course UUID
 * @returns {Promise<Object>} Progress data with percentage
 * 
 * Requirements: 5.3
 */
export async function getCourseProgress(userId, courseId) {
  const client = await pool.connect();
  
  try {
    return await calculateCourseProgress(client, userId, courseId);
  } finally {
    client.release();
  }
}
