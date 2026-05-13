import pool from '../config/database.js';

/**
 * Get current user profile
 * GET /api/users/me
 * Requires authentication
 * @param {Object} req - Express request object with req.user from JWT
 * @param {Object} res - Express response object
 * @returns {Object} User profile data
 */
export async function getMe(req, res) {
  try {
    const { userId } = req.user;

    // Query user and profile data
    const userQuery = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.role, 
        u.avatar_url, 
        u.created_at,
        up.bio,
        up.skills,
        up.target_role_id,
        up.resume_url
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = $1
    `;

    const result = await pool.query(userQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User profile does not exist'
      });
    }

    const user = result.rows[0];

    // Format response
    const response = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      },
      profile: {
        bio: user.bio,
        skills: user.skills || [],
        targetRoleId: user.target_role_id,
        resumeUrl: user.resume_url
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch user profile'
    });
  }
}

/**
 * Update current user profile
 * PUT /api/users/me
 * Requires authentication
 * @param {Object} req - Express request object with req.user and req.body
 * @param {Object} res - Express response object
 * @returns {Object} Updated user data
 */
export async function updateMe(req, res) {
  try {
    const { userId } = req.user;
    const { name, bio, avatar } = req.body;

    // Validate input
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 255)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Name must be between 2 and 255 characters',
        field: 'name'
      });
    }

    if (bio !== undefined && typeof bio !== 'string') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Bio must be a string',
        field: 'bio'
      });
    }

    if (avatar !== undefined && (typeof avatar !== 'string' || avatar.length > 500)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Avatar URL must be a string with max 500 characters',
        field: 'avatar'
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update user table if name or avatar provided
      if (name !== undefined || avatar !== undefined) {
        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        if (name !== undefined) {
          updateFields.push(`name = $${paramCount++}`);
          updateValues.push(name.trim());
        }

        if (avatar !== undefined) {
          updateFields.push(`avatar_url = $${paramCount++}`);
          updateValues.push(avatar);
        }

        updateFields.push(`updated_at = NOW()`);
        updateValues.push(userId);

        const updateUserQuery = `
          UPDATE users 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramCount}
          RETURNING id, email, name, role, avatar_url, created_at
        `;

        await client.query(updateUserQuery, updateValues);
      }

      // Update or create user_profile if bio provided
      if (bio !== undefined) {
        const upsertProfileQuery = `
          INSERT INTO user_profiles (user_id, bio, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (user_id) 
          DO UPDATE SET bio = $2, updated_at = NOW()
        `;

        await client.query(upsertProfileQuery, [userId, bio]);
      }

      // Fetch updated user data
      const fetchQuery = `
        SELECT 
          u.id, 
          u.email, 
          u.name, 
          u.role, 
          u.avatar_url, 
          u.created_at,
          up.bio
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id = $1
      `;

      const result = await client.query(fetchQuery, [userId]);

      await client.query('COMMIT');

      const user = result.rows[0];

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at,
          bio: user.bio
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update user profile'
    });
  }
}

/**
 * Delete current user account
 * DELETE /api/users/me
 * Requires authentication
 * Cascades to delete all associated data
 * @param {Object} req - Express request object with req.user
 * @param {Object} res - Express response object
 * @returns {Object} Success message
 */
export async function deleteMe(req, res) {
  try {
    const { userId } = req.user;

    // Delete user (cascade will handle related records)
    const deleteQuery = 'DELETE FROM users WHERE id = $1 RETURNING id';
    const result = await pool.query(deleteQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account does not exist'
      });
    }

    res.json({
      message: 'Account deleted successfully',
      userId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error deleting user account:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete user account'
    });
  }
}

/**
 * List all creators (users with creator or admin role)
 * GET /api/users/creators
 * Public endpoint - no authentication required
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} List of creators
 */
export async function listCreators(req, res) {
  try {
    const query = `
      SELECT id, name, email
      FROM users
      WHERE role IN ('creator', 'admin')
      ORDER BY name ASC
    `;
    
    const result = await pool.query(query);
    
    const creators = result.rows.map(creator => ({
      id: creator.id,
      name: creator.name,
      email: creator.email
    }));
    
    return res.status(200).json({ creators });
  } catch (error) {
    console.error('List creators error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list creators'
    });
  }
}
