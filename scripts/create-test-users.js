import { query } from '../src/utils/db.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create test users for different roles
 */
async function createTestUsers() {
  console.log('Creating test users...\n');

  try {
    const testUsers = [
      {
        email: 'admin@careergps.com',
        password: 'Admin123!',
        name: 'System Administrator',
        role: 'admin'
      },
      {
        email: 'learner@test.com',
        password: 'Learner123!',
        name: 'Test Learner',
        role: 'learner'
      },
      {
        email: 'creator@test.com',
        password: 'Creator123!',
        name: 'Test Creator',
        role: 'creator'
      }
    ];

    for (const user of testUsers) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      
      const result = await query(
        `INSERT INTO users (email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (email) DO UPDATE 
         SET password_hash = $2, name = $3, role = $4
         RETURNING id, email, name, role`,
        [user.email, passwordHash, user.name, user.role]
      );

      console.log(`✓ Created/Updated ${result.rows[0].role}: ${result.rows[0].email}`);
    }

    console.log('\n=== Test User Credentials ===');
    console.log('\nAdmin:');
    console.log('  Email: admin@careergps.com');
    console.log('  Password: Admin123!');
    console.log('\nLearner:');
    console.log('  Email: learner@test.com');
    console.log('  Password: Learner123!');
    console.log('\nCreator:');
    console.log('  Email: creator@test.com');
    console.log('  Password: Creator123!');
    console.log('\n=============================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error creating test users:', error);
    process.exit(1);
  }
}

createTestUsers();
