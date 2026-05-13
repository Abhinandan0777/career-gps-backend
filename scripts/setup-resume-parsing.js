#!/usr/bin/env node

/**
 * Setup script for Resume Parsing Feature
 * 
 * This script helps configure the resume parsing feature by:
 * 1. Checking if required dependencies are installed
 * 2. Verifying environment variables are set
 * 3. Testing Google Gemini API connection
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load environment variables
dotenv.config({ path: join(rootDir, '.env') });

console.log('🔍 Resume Parsing Feature Setup\n');

// Check package.json for required dependencies
console.log('1. Checking dependencies...');
const packageJsonPath = join(rootDir, 'package.json');
if (!existsSync(packageJsonPath)) {
  console.error('❌ package.json not found');
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const requiredDeps = ['multer', 'pdf-parse', 'mammoth', '@google/generative-ai'];
const missingDeps = [];

for (const dep of requiredDeps) {
  if (!packageJson.dependencies[dep]) {
    missingDeps.push(dep);
  }
}

if (missingDeps.length > 0) {
  console.error(`❌ Missing dependencies: ${missingDeps.join(', ')}`);
  console.log('\nRun: npm install');
  process.exit(1);
}

console.log('✅ All required dependencies are listed in package.json');

// Check if dependencies are actually installed
console.log('\n2. Verifying installed packages...');
const nodeModulesPath = join(rootDir, 'node_modules');
if (!existsSync(nodeModulesPath)) {
  console.error('❌ node_modules not found');
  console.log('\nRun: npm install');
  process.exit(1);
}

for (const dep of requiredDeps) {
  const depPath = join(nodeModulesPath, dep.replace('/', join.sep));
  if (!existsSync(depPath)) {
    console.error(`❌ ${dep} is not installed`);
    console.log('\nRun: npm install');
    process.exit(1);
  }
}

console.log('✅ All required packages are installed');

// Check environment variables
console.log('\n3. Checking environment variables...');
const requiredEnvVars = ['GEMINI_API_KEY'];
const missingEnvVars = [];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    missingEnvVars.push(envVar);
  }
}

if (missingEnvVars.length > 0) {
  console.error(`❌ Missing environment variables: ${missingEnvVars.join(', ')}`);
  console.log('\nAdd the following to your .env file:');
  console.log('GEMINI_API_KEY=your-gemini-api-key-here');
  console.log('\nGet your API key from: https://aistudio.google.com/app/apikey');
  process.exit(1);
}

console.log('✅ GEMINI_API_KEY is configured');

// Check optional environment variables
const maxFileSize = process.env.MAX_FILE_SIZE || '5242880';
console.log(`ℹ️  MAX_FILE_SIZE: ${maxFileSize} bytes (${(parseInt(maxFileSize) / 1024 / 1024).toFixed(2)} MB)`);

// Test Google Gemini API connection
console.log('\n4. Testing Google Gemini API connection...');
try {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent('Say "OK"');
  const response = await result.response;
  const text = response.text();

  console.log('✅ Google Gemini API connection successful');
  console.log('   Model: gemini-1.5-flash');
  console.log(`   Response: ${text.substring(0, 50)}...`);
} catch (error) {
  console.error('❌ Google Gemini API connection failed');
  console.error(`   Error: ${error.message}`);
  process.exit(1);
}

// Summary
console.log('\n✅ Setup complete! Resume parsing feature is ready to use.');
console.log('\nEndpoint: POST /api/career/resume/upload');
console.log('Authentication: Required (JWT Bearer token)');
console.log('Supported formats: PDF, DOCX');
console.log(`Max file size: ${(parseInt(maxFileSize) / 1024 / 1024).toFixed(2)} MB`);
console.log('\nFor more information, see: backend/RESUME_PARSING_FEATURE.md');
