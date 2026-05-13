import pool from '../config/database.js';

/**
 * List all skills
 * GET /api/skills
 * @returns {Object} { skills }
 */
export async function listSkills(req, res) {
  try {
    const query = `
      SELECT id, name, category, description
      FROM skills
      ORDER BY name ASC
    `;
    
    const result = await pool.query(query);
    
    const skills = result.rows.map(skill => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      description: skill.description
    }));
    
    return res.status(200).json({ skills });
  } catch (error) {
    console.error('List skills error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list skills'
    });
  }
}
