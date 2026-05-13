import pool from '../config/database.js';
import { hashPassword } from '../utils/password.js';

/**
 * FEATURE 2: Create admin user (admin-only endpoint)
 * POST /api/admin/create-admin
 * @param {Object} req.body - { name, email, password }
 * @returns {Object} { message, user }
 */
export async function createAdmin(req, res) {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name, email, and password are required',
          fields: {
            name: !name ? 'Name is required' : undefined,
            email: !email ? 'Email is required' : undefined,
            password: !password ? 'Password is required' : undefined
          }
        }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          field: 'email',
          message: 'Invalid email format'
        }
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          field: 'password',
          message: 'Password must be at least 6 characters long'
        }
      });
    }

    // Check for duplicate email
    const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
    const existingUserResult = await pool.query(existingUserQuery, [email]);

    if (existingUserResult.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          field: 'email',
          message: 'Email already exists'
        }
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin user
    const insertUserQuery = `
      INSERT INTO users (email, password_hash, name, role)
      VALUES ($1, $2, $3, 'admin')
      RETURNING id, email, name, role, created_at, updated_at
    `;
    const insertUserResult = await pool.query(insertUserQuery, [
      email,
      passwordHash,
      name
    ]);

    const user = insertUserResult.rows[0];

    return res.status(201).json({
      message: 'Admin created successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create admin user'
      }
    });
  }
}

/**
 * List creator applications with optional status filter
 * GET /api/admin/applications
 * @param {Object} req.query - { status?, page?, limit? }
 * @returns {Object} { applications, pagination }
 * Requirements: 7.2, 7.6
 */
export async function listApplications(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Build query with optional status filter
    let query = `
      SELECT 
        ca.id, ca.user_id, ca.bio, ca.expertise, ca.portfolio_url, 
        ca.status, ca.admin_notes, ca.reviewed_by, ca.reviewed_at,
        ca.created_at, ca.updated_at,
        u.name as user_name, u.email as user_email
      FROM creator_applications ca
      JOIN users u ON ca.user_id = u.id
    `;
    const queryParams = [];
    let paramIndex = 1;

    // Add status filter if provided
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query += ` WHERE ca.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    // Add ordering and pagination
    query += ` ORDER BY ca.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), offset);

    // Execute query
    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM creator_applications';
    const countParams = [];
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      countQuery += ' WHERE status = $1';
      countParams.push(status);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Format applications
    const applications = result.rows.map(app => ({
      id: app.id,
      userId: app.user_id,
      userName: app.user_name,
      userEmail: app.user_email,
      bio: app.bio,
      expertise: app.expertise,
      portfolioUrl: app.portfolio_url,
      status: app.status,
      adminNotes: app.admin_notes,
      reviewedBy: app.reviewed_by,
      reviewedAt: app.reviewed_at,
      createdAt: app.created_at,
      updatedAt: app.updated_at
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return res.status(200).json({
      applications,
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
    console.error('List applications error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list applications'
    });
  }
}

/**
 * Review creator application (approve or reject)
 * PUT /api/admin/applications/:id
 * @param {Object} req.params - { id }
 * @param {Object} req.body - { status: 'approved' | 'rejected', adminNotes? }
 * @returns {Object} { application }
 * Requirements: 7.2, 7.3, 7.6
 */
export async function reviewApplication(req, res) {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const reviewerId = req.user.userId;

    // Validate status
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Status must be either "approved" or "rejected"',
        field: 'status'
      });
    }

    // Start transaction
    await client.query('BEGIN');

    // Get application
    const appQuery = 'SELECT * FROM creator_applications WHERE id = $1';
    const appResult = await client.query(appQuery, [id]);

    if (appResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Not found',
        message: 'Application not found'
      });
    }

    const application = appResult.rows[0];

    // Check if already reviewed
    if (application.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Conflict',
        message: `Application has already been ${application.status}`
      });
    }

    // Update application status
    const updateAppQuery = `
      UPDATE creator_applications
      SET status = $1, admin_notes = $2, reviewed_by = $3, reviewed_at = NOW()
      WHERE id = $4
      RETURNING id, user_id, bio, expertise, portfolio_url, status, 
                admin_notes, reviewed_by, reviewed_at, created_at, updated_at
    `;
    const updateAppResult = await client.query(updateAppQuery, [
      status,
      adminNotes || null,
      reviewerId,
      id
    ]);
    const updatedApplication = updateAppResult.rows[0];

    // If approved, update user role to 'creator'
    if (status === 'approved') {
      const updateUserQuery = `
        UPDATE users
        SET role = 'creator'
        WHERE id = $1
      `;
      await client.query(updateUserQuery, [application.user_id]);
    }

    // Commit transaction
    await client.query('COMMIT');

    return res.status(200).json({
      application: {
        id: updatedApplication.id,
        userId: updatedApplication.user_id,
        bio: updatedApplication.bio,
        expertise: updatedApplication.expertise,
        portfolioUrl: updatedApplication.portfolio_url,
        status: updatedApplication.status,
        adminNotes: updatedApplication.admin_notes,
        reviewedBy: updatedApplication.reviewed_by,
        reviewedAt: updatedApplication.reviewed_at,
        createdAt: updatedApplication.created_at,
        updatedAt: updatedApplication.updated_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Review application error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to review application'
    });
  } finally {
    client.release();
  }
}

/**
 * Get platform-wide analytics
 * GET /api/admin/analytics
 * @param {Object} req.query - { startDate?, endDate? }
 * @returns {Object} { totalUsers, totalCourses, totalEnrollments, activeUsers, completionRate }
 * Requirements: 8.1
 */
export async function getPlatformAnalytics(req, res) {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = '';
    const queryParams = [];
    if (startDate && endDate) {
      dateFilter = 'WHERE created_at BETWEEN $1 AND $2';
      queryParams.push(startDate, endDate);
    }

    // Get total users
    const usersQuery = `SELECT COUNT(*) as count FROM users ${dateFilter}`;
    const usersResult = await pool.query(usersQuery, queryParams);
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Get user role counts
    const roleCountsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE role = 'learner') as learner_count,
        COUNT(*) FILTER (WHERE role = 'creator') as creator_count,
        COUNT(*) FILTER (WHERE role = 'admin') as admin_count
      FROM users
    `;
    const roleCountsResult = await pool.query(roleCountsQuery);
    const learnerCount = parseInt(roleCountsResult.rows[0].learner_count);
    const creatorCount = parseInt(roleCountsResult.rows[0].creator_count);
    const adminCount = parseInt(roleCountsResult.rows[0].admin_count);

    // Get total courses and published courses
    const coursesQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_published = true) as published
      FROM courses ${dateFilter}
    `;
    const coursesResult = await pool.query(coursesQuery, queryParams);
    const totalCourses = parseInt(coursesResult.rows[0].total);
    const publishedCourses = parseInt(coursesResult.rows[0].published);

    // Get total enrollments and completed enrollments
    const enrollmentsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM enrollments ${dateFilter.replace('created_at', 'enrolled_at')}
    `;
    const enrollmentsResult = await pool.query(enrollmentsQuery, queryParams);
    const totalEnrollments = parseInt(enrollmentsResult.rows[0].total);
    const completedEnrollments = parseInt(enrollmentsResult.rows[0].completed);

    // Get active users (users with enrollments in last 30 days)
    const activeUsersQuery = `
      SELECT COUNT(DISTINCT user_id) as count 
      FROM enrollments 
      WHERE enrolled_at >= NOW() - INTERVAL '30 days'
    `;
    const activeUsersResult = await pool.query(activeUsersQuery);
    const activeUsers = parseInt(activeUsersResult.rows[0].count);

    // Get completion rate
    const completionRate = totalEnrollments > 0 
      ? Math.round((completedEnrollments / totalEnrollments) * 100) 
      : 0;

    // Get total certificates
    const certificatesQuery = `SELECT COUNT(*) as count FROM certificates`;
    const certificatesResult = await pool.query(certificatesQuery);
    const totalCertificates = parseInt(certificatesResult.rows[0].count);

    // Get pending applications
    const pendingAppsQuery = `SELECT COUNT(*) as count FROM creator_applications WHERE status = 'pending'`;
    const pendingAppsResult = await pool.query(pendingAppsQuery);
    const pendingApplications = parseInt(pendingAppsResult.rows[0].count);

    // Get average course duration
    const avgDurationQuery = `SELECT AVG(duration_hours) as avg FROM courses WHERE is_published = true`;
    const avgDurationResult = await pool.query(avgDurationQuery);
    const avgCourseDuration = parseFloat(avgDurationResult.rows[0].avg) || 0;

    // Get average enrollments per course
    const avgEnrollmentsQuery = `
      SELECT AVG(enrollment_count) as avg FROM (
        SELECT course_id, COUNT(*) as enrollment_count
        FROM enrollments
        GROUP BY course_id
      ) as course_enrollments
    `;
    const avgEnrollmentsResult = await pool.query(avgEnrollmentsQuery);
    const avgEnrollmentsPerCourse = parseFloat(avgEnrollmentsResult.rows[0].avg) || 0;

    return res.status(200).json({
      totalUsers,
      activeUsers,
      learnerCount,
      creatorCount,
      adminCount,
      totalCourses,
      publishedCourses,
      totalEnrollments,
      completedEnrollments,
      completionRate,
      totalCertificates,
      pendingApplications,
      avgCourseDuration,
      avgEnrollmentsPerCourse,
      dateRange: startDate && endDate ? { startDate, endDate } : null
    });
  } catch (error) {
    console.error('Get platform analytics error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get platform analytics'
    });
  }
}

/**
 * Get skill demand analytics
 * GET /api/admin/skill-demand
 * @param {Object} req.query - { limit? }
 * @returns {Object} { skills: [{ name, demandCount, category }] }
 * Requirements: 8.2
 */
export async function getSkillDemandAnalytics(req, res) {
  try {
    const { limit = 20 } = req.query;

    // Aggregate skill demand from user profiles (missing skills)
    // This queries the skills that users are targeting but don't have yet
    const query = `
      SELECT 
        s.id,
        s.name,
        s.category,
        COUNT(DISTINCT up.user_id) as demand_count
      FROM skills s
      JOIN job_role_skills jrs ON s.id = jrs.skill_id
      JOIN user_profiles up ON jrs.job_role_id = up.target_role_id
      WHERE up.skills IS NOT NULL
      GROUP BY s.id, s.name, s.category
      ORDER BY demand_count DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [parseInt(limit)]);

    const skills = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      demandCount: parseInt(row.demand_count)
    }));

    return res.status(200).json({
      skills,
      total: skills.length
    });
  } catch (error) {
    console.error('Get skill demand analytics error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get skill demand analytics'
    });
  }
}

/**
 * List all users with filtering
 * GET /api/admin/users
 * @param {Object} req.query - { role?, search?, page?, limit? }
 * @returns {Object} { users, pagination }
 * Requirements: 7.6
 */
export async function listUsers(req, res) {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Build query with filters
    let query = `
      SELECT 
        u.id, u.email, u.name, u.role, u.avatar_url, u.created_at, u.updated_at
      FROM users u
      WHERE 1=1
    `;
    const queryParams = [];
    let paramIndex = 1;

    // Add role filter
    if (role && ['learner', 'creator', 'admin'].includes(role)) {
      query += ` AND u.role = $${paramIndex}`;
      queryParams.push(role);
      paramIndex++;
    }

    // Add search filter
    if (search) {
      query += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Add ordering and pagination
    query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), offset);

    // Execute query
    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (role && ['learner', 'creator', 'admin'].includes(role)) {
      countQuery += ` AND role = $${countParamIndex}`;
      countParams.push(role);
      countParamIndex++;
    }

    if (search) {
      countQuery += ` AND (name ILIKE $${countParamIndex} OR email ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    // Format users
    const users = result.rows.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }));

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return res.status(200).json({
      users,
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
    console.error('List users error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list users'
    });
  }
}

/**
 * Update user role
 * PUT /api/admin/users/:id
 * @param {Object} req.params - { id }
 * @param {Object} req.body - { role }
 * @returns {Object} { user }
 * Requirements: 7.6
 */
export async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    if (!role || !['learner', 'creator', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Role must be one of: learner, creator, admin',
        field: 'role'
      });
    }

    // Check if user exists
    const checkQuery = 'SELECT id FROM users WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Update user role
    const updateQuery = `
      UPDATE users
      SET role = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, name, role, avatar_url, created_at, updated_at
    `;
    const updateResult = await pool.query(updateQuery, [role, id]);
    const user = updateResult.rows[0];

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update user role'
    });
  }
}

/**
 * Delete user
 * DELETE /api/admin/users/:id
 * @param {Object} req.params - { id }
 * @returns {Object} { message }
 * Requirements: 7.6
 */
export async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    // Check if user exists
    const checkQuery = 'SELECT id FROM users WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    // Delete user (cascade will handle related records)
    const deleteQuery = 'DELETE FROM users WHERE id = $1';
    await pool.query(deleteQuery, [id]);

    return res.status(200).json({
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete user'
    });
  }
}
