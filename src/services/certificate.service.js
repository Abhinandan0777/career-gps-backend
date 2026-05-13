import crypto from 'crypto';
import pool from '../config/database.js';
import { getCourseProgress } from './completion.service.js';

/**
 * Generate a certificate for a user who has completed a course
 * 
 * @param {string} userId - User UUID
 * @param {string} courseId - Course UUID
 * @returns {Promise<Object>} Certificate with serial number
 * 
 * Requirements: 6.1, 6.2, 6.3
 * 
 * Preconditions:
 * - userId must exist in users table
 * - courseId must exist in courses table
 * - User must have completed 100% of course lessons
 * 
 * Postconditions:
 * - Returns existing certificate if already generated (idempotent)
 * - Creates new certificate with SHA-256 serial number if not exists
 * - Serial number is 64-character hex string (globally unique)
 * - Unique constraint (user_id, course_id) prevents duplicates
 */
export async function generateCertificate(userId, courseId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Step 1: Verify course completion (must be 100%)
    const progress = await getCourseProgress(userId, courseId);
    
    if (progress.percentage !== 100) {
      throw new Error(`Course not completed. Current progress: ${progress.percentage}%`);
    }
    
    // Step 2: Check for existing certificate (idempotent operation)
    const existingCertQuery = `
      SELECT id, user_id, course_id, serial_number, issued_at, certificate_url
      FROM certificates
      WHERE user_id = $1 AND course_id = $2
    `;
    const existingCertResult = await client.query(existingCertQuery, [userId, courseId]);
    
    // If certificate already exists, return it (idempotent)
    if (existingCertResult.rows.length > 0) {
      await client.query('COMMIT');
      return {
        certificate: existingCertResult.rows[0],
        isNew: false
      };
    }
    
    // Step 3: Generate SHA-256 serial number
    const issuedAt = new Date().toISOString();
    const randomSalt = crypto.randomBytes(16).toString('hex');
    
    // Combine courseId, userId, timestamp, and random salt for uniqueness
    const dataToHash = `${courseId}|${userId}|${issuedAt}|${randomSalt}`;
    const serialNumber = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex');
    
    // ASSERT: serialNumber is 64 hex characters
    if (serialNumber.length !== 64 || !/^[a-f0-9]{64}$/.test(serialNumber)) {
      throw new Error('Invalid serial number generated');
    }
    
    // Step 4: Create certificate record
    const insertCertQuery = `
      INSERT INTO certificates (user_id, course_id, serial_number, issued_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, course_id, serial_number, issued_at, certificate_url
    `;
    const insertCertResult = await client.query(insertCertQuery, [
      userId,
      courseId,
      serialNumber,
      issuedAt
    ]);
    
    await client.query('COMMIT');
    
    return {
      certificate: insertCertResult.rows[0],
      isNew: true
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all certificates for a user
 * 
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} Array of certificates with course details
 */
export async function getUserCertificates(userId) {
  const query = `
    SELECT 
      c.id,
      c.user_id,
      c.course_id,
      c.serial_number,
      c.issued_at,
      c.certificate_url,
      co.title as course_title,
      co.description as course_description,
      co.difficulty as course_difficulty
    FROM certificates c
    JOIN courses co ON c.course_id = co.id
    WHERE c.user_id = $1
    ORDER BY c.issued_at DESC
  `;
  
  const result = await pool.query(query, [userId]);
  return result.rows;
}

/**
 * Get a certificate by ID
 * 
 * @param {string} certificateId - Certificate UUID
 * @returns {Promise<Object>} Certificate with user and course details
 */
export async function getCertificateById(certificateId) {
  const query = `
    SELECT 
      c.id,
      c.user_id,
      c.course_id,
      c.serial_number,
      c.issued_at,
      c.certificate_url,
      u.name as user_name,
      u.email as user_email,
      co.title as course_title,
      co.description as course_description,
      co.difficulty as course_difficulty,
      co.duration_hours as course_duration
    FROM certificates c
    JOIN users u ON c.user_id = u.id
    JOIN courses co ON c.course_id = co.id
    WHERE c.id = $1
  `;
  
  const result = await pool.query(query, [certificateId]);
  
  if (result.rows.length === 0) {
    throw new Error('Certificate not found');
  }
  
  return result.rows[0];
}

/**
 * Verify a certificate by serial number
 * 
 * @param {string} serialNumber - Certificate serial number (64 hex chars)
 * @returns {Promise<Object>} Verification result with certificate details
 * 
 * Requirements: 6.4, 6.5
 * 
 * Preconditions:
 * - serialNumber must be 64-character hex string
 * 
 * Postconditions:
 * - Returns valid=true if certificate exists in database
 * - Returns valid=false if certificate not found or invalid format
 * - Public endpoint (no authentication required)
 */
export async function verifyCertificate(serialNumber) {
  // Validate serial number format
  if (!serialNumber || typeof serialNumber !== 'string') {
    return {
      valid: false,
      error: 'Serial number is required'
    };
  }
  
  if (!/^[a-f0-9]{64}$/.test(serialNumber)) {
    return {
      valid: false,
      error: 'Invalid serial number format. Must be 64 hexadecimal characters.'
    };
  }
  
  // Query database for certificate
  const query = `
    SELECT 
      c.id,
      c.serial_number,
      c.issued_at,
      u.name as user_name,
      co.title as course_title,
      co.difficulty as course_difficulty,
      co.duration_hours as course_duration
    FROM certificates c
    JOIN users u ON c.user_id = u.id
    JOIN courses co ON c.course_id = co.id
    WHERE c.serial_number = $1
  `;
  
  const result = await pool.query(query, [serialNumber]);
  
  if (result.rows.length === 0) {
    return {
      valid: false,
      error: 'Certificate not found'
    };
  }
  
  return {
    valid: true,
    certificate: result.rows[0]
  };
}
