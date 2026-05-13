import pool from '../config/database.js';

/**
 * Analytics Service
 * Provides aggregation and calculation functions for analytics
 * Requirements: 8.1, 8.2, 8.3
 */

/**
 * Calculate skill demand from skill gap analysis data
 * Aggregates skills that users are missing for their target roles
 * @returns {Array} Skills ranked by demand frequency
 * Requirements: 8.2
 */
export async function calculateSkillDemand() {
  try {
    // Query to find skills that are required for target roles but missing from user profiles
    // This represents the "demand" for learning these skills
    const query = `
      SELECT 
        s.id,
        s.name,
        s.category,
        s.description,
        COUNT(DISTINCT up.user_id) as demand_count,
        COUNT(DISTINCT c.id) as course_count
      FROM skills s
      JOIN job_role_skills jrs ON s.id = jrs.skill_id
      JOIN user_profiles up ON jrs.job_role_id = up.target_role_id
      LEFT JOIN course_skills cs ON s.id = cs.skill_id
      LEFT JOIN courses c ON cs.course_id = c.id AND c.is_published = true
      WHERE up.skills IS NOT NULL
      GROUP BY s.id, s.name, s.category, s.description
      HAVING COUNT(DISTINCT up.user_id) > 0
      ORDER BY demand_count DESC
    `;

    const result = await pool.query(query);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      demandCount: parseInt(row.demand_count),
      courseCount: parseInt(row.course_count),
      trendDirection: calculateTrendDirection(parseInt(row.demand_count))
    }));
  } catch (error) {
    console.error('Calculate skill demand error:', error);
    throw error;
  }
}

/**
 * Calculate trend direction based on demand count
 * Simple heuristic: high demand = up, medium = stable, low = down
 * @param {Number} demandCount - Number of users targeting this skill
 * @returns {String} 'up', 'stable', or 'down'
 */
function calculateTrendDirection(demandCount) {
  if (demandCount >= 10) return 'up';
  if (demandCount >= 5) return 'stable';
  return 'down';
}

/**
 * Get platform metrics for a date range
 * @param {String} startDate - Start date (ISO format)
 * @param {String} endDate - End date (ISO format)
 * @returns {Object} Platform metrics
 * Requirements: 8.1
 */
export async function getPlatformMetrics(startDate = null, endDate = null) {
  try {
    const dateFilter = startDate && endDate 
      ? 'WHERE created_at BETWEEN $1 AND $2'
      : '';
    const params = startDate && endDate ? [startDate, endDate] : [];

    // Get user metrics
    const usersQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE role = 'learner') as learners,
        COUNT(*) FILTER (WHERE role = 'creator') as creators,
        COUNT(*) FILTER (WHERE role = 'admin') as admins
      FROM users ${dateFilter}
    `;
    const usersResult = await pool.query(usersQuery, params);

    // Get course metrics
    const coursesQuery = `
      SELECT 
        COUNT(*) as total_courses,
        COUNT(*) FILTER (WHERE is_published = true) as published_courses,
        AVG(duration_hours) as avg_duration
      FROM courses ${dateFilter}
    `;
    const coursesResult = await pool.query(coursesQuery, params);

    // Get enrollment metrics
    const enrollmentsQuery = `
      SELECT 
        COUNT(*) as total_enrollments,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_enrollments,
        COUNT(*) FILTER (WHERE status = 'active') as active_enrollments
      FROM enrollments ${dateFilter.replace('created_at', 'enrolled_at')}
    `;
    const enrollmentsResult = await pool.query(enrollmentsQuery, params);

    // Get active users (last 30 days)
    const activeUsersQuery = `
      SELECT COUNT(DISTINCT user_id) as active_users
      FROM enrollments
      WHERE enrolled_at >= NOW() - INTERVAL '30 days'
    `;
    const activeUsersResult = await pool.query(activeUsersQuery);

    return {
      users: {
        total: parseInt(usersResult.rows[0].total_users),
        learners: parseInt(usersResult.rows[0].learners),
        creators: parseInt(usersResult.rows[0].creators),
        admins: parseInt(usersResult.rows[0].admins),
        active: parseInt(activeUsersResult.rows[0].active_users)
      },
      courses: {
        total: parseInt(coursesResult.rows[0].total_courses),
        published: parseInt(coursesResult.rows[0].published_courses),
        averageDuration: parseFloat(coursesResult.rows[0].avg_duration) || 0
      },
      enrollments: {
        total: parseInt(enrollmentsResult.rows[0].total_enrollments),
        completed: parseInt(enrollmentsResult.rows[0].completed_enrollments),
        active: parseInt(enrollmentsResult.rows[0].active_enrollments),
        completionRate: parseInt(enrollmentsResult.rows[0].total_enrollments) > 0
          ? Math.round((parseInt(enrollmentsResult.rows[0].completed_enrollments) / parseInt(enrollmentsResult.rows[0].total_enrollments)) * 100)
          : 0
      }
    };
  } catch (error) {
    console.error('Get platform metrics error:', error);
    throw error;
  }
}

/**
 * Get creator analytics for a specific creator
 * @param {String} creatorId - Creator user ID
 * @param {String} startDate - Start date (ISO format)
 * @param {String} endDate - End date (ISO format)
 * @returns {Object} Creator analytics
 * Requirements: 8.3
 */
export async function getCreatorMetrics(creatorId, startDate = null, endDate = null) {
  try {
    const dateFilter = startDate && endDate 
      ? 'AND e.enrolled_at BETWEEN $2 AND $3'
      : '';
    const params = startDate && endDate ? [creatorId, startDate, endDate] : [creatorId];

    // Get course metrics
    const coursesQuery = `
      SELECT 
        COUNT(*) as total_courses,
        COUNT(*) FILTER (WHERE is_published = true) as published_courses
      FROM courses
      WHERE creator_id = $1
    `;
    const coursesResult = await pool.query(coursesQuery, [creatorId]);

    // Get enrollment metrics
    const enrollmentsQuery = `
      SELECT 
        COUNT(*) as total_enrollments,
        COUNT(*) FILTER (WHERE e.status = 'completed') as completed_enrollments
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE c.creator_id = $1 ${dateFilter}
    `;
    const enrollmentsResult = await pool.query(enrollmentsQuery, params);

    // Get popular courses
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

    return {
      courses: {
        total: parseInt(coursesResult.rows[0].total_courses),
        published: parseInt(coursesResult.rows[0].published_courses)
      },
      enrollments: {
        total: parseInt(enrollmentsResult.rows[0].total_enrollments),
        completed: parseInt(enrollmentsResult.rows[0].completed_enrollments),
        completionRate: parseInt(enrollmentsResult.rows[0].total_enrollments) > 0
          ? Math.round((parseInt(enrollmentsResult.rows[0].completed_enrollments) / parseInt(enrollmentsResult.rows[0].total_enrollments)) * 100)
          : 0
      },
      popularCourses: popularCoursesResult.rows.map(row => ({
        id: row.id,
        title: row.title,
        enrollmentCount: parseInt(row.enrollment_count)
      }))
    };
  } catch (error) {
    console.error('Get creator metrics error:', error);
    throw error;
  }
}

export default {
  calculateSkillDemand,
  getPlatformMetrics,
  getCreatorMetrics
};
