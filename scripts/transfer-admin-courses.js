import pool from '../src/config/database.js';

/**
 * Transfer all courses from admin to creator account
 * This ensures admin is purely an admin role, not a creator
 */
async function transferAdminCourses() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting course transfer from admin to creator...\n');

    // Get admin user ID
    const adminQuery = `SELECT id, email FROM users WHERE email = 'admin@careergps.com'`;
    const adminResult = await client.query(adminQuery);
    
    if (adminResult.rows.length === 0) {
      console.log('❌ Admin user not found');
      return;
    }
    
    const adminId = adminResult.rows[0].id;
    console.log(`✓ Found admin user: ${adminResult.rows[0].email} (ID: ${adminId})`);

    // Get creator user ID
    const creatorQuery = `SELECT id, email FROM users WHERE email = 'creator@test.com'`;
    const creatorResult = await client.query(creatorQuery);
    
    if (creatorResult.rows.length === 0) {
      console.log('❌ Creator user not found');
      return;
    }
    
    const creatorId = creatorResult.rows[0].id;
    console.log(`✓ Found creator user: ${creatorResult.rows[0].email} (ID: ${creatorId})\n`);

    // Get courses owned by admin
    const coursesQuery = `
      SELECT id, title, is_published 
      FROM courses 
      WHERE creator_id = $1
    `;
    const coursesResult = await client.query(coursesQuery, [adminId]);
    
    if (coursesResult.rows.length === 0) {
      console.log('✓ No courses found for admin user. Nothing to transfer.\n');
      return;
    }

    console.log(`📚 Found ${coursesResult.rows.length} course(s) owned by admin:\n`);
    coursesResult.rows.forEach((course, index) => {
      console.log(`   ${index + 1}. ${course.title} (${course.is_published ? 'Published' : 'Draft'})`);
    });
    console.log('');

    // Start transaction
    await client.query('BEGIN');

    // Transfer courses from admin to creator
    const updateQuery = `
      UPDATE courses 
      SET creator_id = $1, updated_at = NOW()
      WHERE creator_id = $2
      RETURNING id, title
    `;
    const updateResult = await client.query(updateQuery, [creatorId, adminId]);

    // Commit transaction
    await client.query('COMMIT');

    console.log(`✅ Successfully transferred ${updateResult.rows.length} course(s) to creator account:\n`);
    updateResult.rows.forEach((course, index) => {
      console.log(`   ${index + 1}. ${course.title}`);
    });
    console.log('');

    // Verify the transfer
    const verifyQuery = `
      SELECT COUNT(*) as count 
      FROM courses 
      WHERE creator_id = $1
    `;
    const verifyResult = await client.query(verifyQuery, [adminId]);
    const remainingCourses = parseInt(verifyResult.rows[0].count);

    if (remainingCourses === 0) {
      console.log('✅ Verification: Admin has 0 courses (correct)\n');
    } else {
      console.log(`⚠️  Warning: Admin still has ${remainingCourses} course(s)\n`);
    }

    // Show creator's total courses
    const creatorCoursesQuery = `
      SELECT COUNT(*) as count 
      FROM courses 
      WHERE creator_id = $1
    `;
    const creatorCoursesResult = await client.query(creatorCoursesQuery, [creatorId]);
    const creatorTotalCourses = parseInt(creatorCoursesResult.rows[0].count);
    
    console.log(`📊 Creator now has ${creatorTotalCourses} total course(s)\n`);
    console.log('✅ Course transfer completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error transferring courses:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the transfer
transferAdminCourses()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
