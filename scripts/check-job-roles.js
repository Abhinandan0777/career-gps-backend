import pool from '../src/config/database.js';

async function checkJobRoles() {
  const client = await pool.connect();
  
  try {
    console.log('Checking job roles in database...\n');
    
    // Check if job_roles table exists and has data
    const result = await client.query(`
      SELECT id, name, category, description 
      FROM job_roles 
      ORDER BY name
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No job roles found in database!');
      console.log('\nPlease run the seed script:');
      console.log('  npm run seed\n');
      return;
    }
    
    console.log(`✓ Found ${result.rows.length} job roles:\n`);
    
    for (const role of result.rows) {
      console.log(`  - ${role.name} (${role.category})`);
      console.log(`    ID: ${role.id}`);
      
      // Check skills for this role
      const skillsResult = await client.query(`
        SELECT s.name, jrs.required_level
        FROM skills s
        JOIN job_role_skills jrs ON s.id = jrs.skill_id
        WHERE jrs.job_role_id = $1
        ORDER BY s.name
      `, [role.id]);
      
      console.log(`    Skills: ${skillsResult.rows.length}`);
      if (skillsResult.rows.length > 0) {
        skillsResult.rows.forEach(skill => {
          console.log(`      • ${skill.name} (${skill.required_level})`);
        });
      }
      console.log('');
    }
    
  } catch (error) {
    console.error('Error checking job roles:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkJobRoles();
