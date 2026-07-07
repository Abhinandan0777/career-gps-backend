import pool from './src/config/database.js';

async function checkAdmin() {
  try {
    const result = await pool.query("SELECT id, email, name, role FROM users WHERE role = 'admin'");
    
    console.log('\n=== ADMIN USERS ===\n');
    
    if (result.rows.length === 0) {
      console.log('? No admin users found!');
      console.log('\nCreating admin user...\n');
      
      // Create admin user
      const { hashPassword } = await import('./src/utils/password.js');
      const passwordHash = await hashPassword('admin123');
      
      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role`,
        ['admin@careergps.com', passwordHash, 'Admin User', 'admin']
      );
      
      const admin = insertResult.rows[0];
      console.log('? Admin user created successfully!');
      console.log('\nAdmin Credentials:');
      console.log('Email: admin@careergps.com');
      console.log('Password: admin123');
      console.log('Role:', admin.role);
      console.log('ID:', admin.id);
    } else {
      console.log(`? Found ${result.rows.length} admin user(s):\n`);
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
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAdmin();
