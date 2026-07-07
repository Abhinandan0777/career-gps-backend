import pool from './src/config/database.js';

async function checkUsers() {
  try {
    const result = await pool.query('SELECT id, email, name, role FROM users ORDER BY created_at DESC LIMIT 10');
    
    console.log('\n=== USERS IN DATABASE ===\n');
    
    if (result.rows.length === 0) {
      console.log('? No users found in database!');
      console.log('\nYou need to:');
      console.log('1. Register a new user through the frontend');
      console.log('2. Or run: npm run seed (to create test users)');
    } else {
      console.log(`? Found ${result.rows.length} users:\n`);
      result.rows.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email}`);
        console.log(`   Name: ${user.name}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   ID: ${user.id}`);
        console.log('');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking users:', error.message);
    process.exit(1);
  }
}

checkUsers();
