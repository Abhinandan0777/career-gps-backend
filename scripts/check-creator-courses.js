import { query } from '../src/utils/db.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkCreatorCourses() {
  console.log('Checking creator courses...\n');

  try {
    // Get creator user
    const creatorResult = await query(
      'SELECT id, email, name, role FROM users WHERE email = $1',
      ['creator@test.com']
    );

    if (creatorResult.rows.length === 0) {
      console.log('❌ Creator user not found!');
      process.exit(1);
    }

    const creator = creatorResult.rows[0];
    console.log('Creator User:');
    console.log(`  ID: ${creator.id}`);
    console.log(`  Email: ${creator.email}`);
    console.log(`  Name: ${creator.name}`);
    console.log(`  Role: ${creator.role}\n`);

    // Get courses created by this user
    const coursesResult = await query(
      'SELECT id, title, creator_id FROM courses WHERE creator_id = $1',
      [creator.id]
    );

    console.log(`Courses created by ${creator.email}:`);
    if (coursesResult.rows.length === 0) {
      console.log('  No courses found\n');
    } else {
      coursesResult.rows.forEach(course => {
        console.log(`  - ${course.title} (ID: ${course.id})`);
        console.log(`    Creator ID: ${course.creator_id}`);
      });
      console.log('');
    }

    // Get all courses
    const allCoursesResult = await query(
      'SELECT id, title, creator_id FROM courses LIMIT 10'
    );

    console.log('All courses in database:');
    if (allCoursesResult.rows.length === 0) {
      console.log('  No courses found\n');
    } else {
      allCoursesResult.rows.forEach(course => {
        console.log(`  - ${course.title} (ID: ${course.id})`);
        console.log(`    Creator ID: ${course.creator_id}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCreatorCourses();
