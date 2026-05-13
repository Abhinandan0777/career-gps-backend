import pg from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// Set DNS resolution order to prefer IPv4
dns.setDefaultResultOrder('ipv4first');

const { Pool } = pg;

// Supabase connection configuration
// Supports both DATABASE_URL (connection string) and individual parameters
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Always use SSL for Supabase
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 10000, // Increased timeout
  // Force IPv6 or allow both
  options: '-c client_encoding=UTF8'
});

// Connection event handlers
pool.on('connect', () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Database client connected to Supabase');
  }
});

pool.on('acquire', () => {
  // Silent in production
});

pool.on('remove', () => {
  // Silent in production
});

pool.on('error', (err, client) => {
  console.error('Unexpected database pool error:', {
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  
  // Don't exit immediately - let the application handle the error
  // Only exit if it's a critical connection error
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('Critical database connection error - exiting');
    process.exit(-1);
  }
});

// Test initial connection with retry logic
const testConnection = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await pool.query('SELECT NOW()');
      console.log('Database connection pool initialized successfully');
      console.log('Connected to Supabase at:', result.rows[0].now);
      return;
    } catch (err) {
      console.error(`Connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i === retries - 1) {
        console.error('Failed to establish initial database connection after', retries, 'attempts');
        console.error('Please check:');
        console.error('1. Your internet connection');
        console.error('2. DATABASE_URL in .env file');
        console.error('3. Supabase project is active');
        console.error('4. Firewall/VPN settings');
        // Don't exit - allow server to start but log the error
        console.warn('Server will start but database operations may fail');
      } else {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
};

testConnection();

export default pool;
