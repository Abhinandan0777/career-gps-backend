#!/usr/bin/env node

/**
 * Supabase Migration Runner
 * 
 * This script runs Supabase migrations against your database.
 * It reads migration files from backend/supabase/migrations/ and executes them.
 * 
 * Usage:
 *   node scripts/run-supabase-migration.js [migration-file]
 * 
 * Examples:
 *   node scripts/run-supabase-migration.js 20240101000000_initial_schema.sql
 *   npm run migrate:supabase
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../supabase/migrations');

async function runMigration(filename) {
  const migrationPath = join(MIGRATIONS_DIR, filename);
  
  console.log('🚀 Starting Supabase migration...');
  console.log(`📁 Migration file: ${filename}`);
  console.log(`📍 Path: ${migrationPath}\n`);

  try {
    // Read migration file
    const sql = readFileSync(migrationPath, 'utf8');
    
    console.log('📖 Reading migration file...');
    console.log(`   Size: ${(sql.length / 1024).toFixed(2)} KB\n`);

    // Execute migration
    console.log('⚙️  Executing migration...');
    const startTime = Date.now();
    
    await pool.query(sql);
    
    const duration = Date.now() - startTime;
    
    console.log(`\n✅ Migration completed successfully!`);
    console.log(`⏱️  Duration: ${duration}ms\n`);

    // Verify tables were created
    console.log('🔍 Verifying database schema...');
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log(`\n📋 Tables created (${result.rows.length}):`);
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    console.log('\n🎉 Database setup complete!\n');

  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error(`Error: ${error.message}\n`);
    
    if (error.position) {
      console.error(`Position: ${error.position}`);
    }
    
    if (error.detail) {
      console.error(`Detail: ${error.detail}`);
    }
    
    if (error.hint) {
      console.error(`Hint: ${error.hint}`);
    }
    
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check your DATABASE_URL in .env');
    console.error('   2. Verify Supabase project is active');
    console.error('   3. Ensure you have the correct permissions');
    console.error('   4. Check for syntax errors in the migration file\n');
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Main execution
const migrationFile = process.argv[2] || '20240101000000_initial_schema.sql';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       Career GPS Platform - Supabase Migration        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

runMigration(migrationFile).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
