/**
 * Logging Service
 * Centralized logging for the Career GPS Platform
 * 
 * Requirements: 10.3
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log directory
const LOG_DIR = path.join(__dirname, '../../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file paths
const ERROR_LOG_FILE = path.join(LOG_DIR, 'error.log');
const COMBINED_LOG_FILE = path.join(LOG_DIR, 'combined.log');

// Maximum log file size (10MB)
const MAX_LOG_SIZE = 10 * 1024 * 1024;

// Sensitive data patterns to filter
const SENSITIVE_PATTERNS = [
  /password[^:]*:\s*["']?[^"',}\s]+["']?/gi,
  /token[^:]*:\s*["']?[^"',}\s]+["']?/gi,
  /authorization:\s*bearer\s+[^\s]+/gi,
  /api[_-]?\s*key[^:]*:\s*["']?[^"',}\s]+["']?/gi,
  /secret[^:]*:\s*["']?[^"',}\s]+["']?/gi
];

/**
 * Sanitize log message to remove sensitive data
 * Never logs passwords, tokens, or sensitive data
 * 
 * @param {string} message - Log message
 * @returns {string} Sanitized message
 */
function sanitizeMessage(message) {
  let sanitized = message;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      const key = match.split(':')[0];
      return `${key}: [REDACTED]`;
    });
  }
  
  return sanitized;
}

/**
 * Format log entry
 * 
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {string} Formatted log entry
 */
function formatLogEntry(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const sanitizedMessage = sanitizeMessage(message);
  
  const logEntry = {
    timestamp,
    level,
    message: sanitizedMessage,
    ...metadata
  };
  
  return JSON.stringify(logEntry) + '\n';
}

/**
 * Rotate log file if it exceeds maximum size
 * 
 * @param {string} logFile - Path to log file
 */
function rotateLogFile(logFile) {
  try {
    if (!fs.existsSync(logFile)) {
      return;
    }
    
    const stats = fs.statSync(logFile);
    
    if (stats.size >= MAX_LOG_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
      
      fs.renameSync(logFile, rotatedFile);
      
      // Keep only last 5 rotated files
      const logDir = path.dirname(logFile);
      const logFileName = path.basename(logFile, '.log');
      const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith(logFileName) && f !== path.basename(logFile))
        .sort()
        .reverse();
      
      // Delete old rotated files
      if (files.length > 5) {
        files.slice(5).forEach(f => {
          fs.unlinkSync(path.join(logDir, f));
        });
      }
    }
  } catch (error) {
    console.error('Log rotation error:', error);
  }
}

/**
 * Write log entry to file
 * 
 * @param {string} logFile - Path to log file
 * @param {string} entry - Log entry
 */
function writeLog(logFile, entry) {
  try {
    // Rotate log file if needed
    rotateLogFile(logFile);
    
    // Append log entry
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

/**
 * Log error with timestamp, path, method, and user ID
 * Never logs passwords, tokens, or sensitive data
 * 
 * @param {Error} error - Error object
 * @param {Object} metadata - Additional metadata (path, method, userId, statusCode)
 */
export function logError(error, metadata = {}) {
  const message = error.message || 'Unknown error';
  const stack = error.stack || '';
  
  const logMetadata = {
    path: metadata.path || null,
    method: metadata.method || null,
    userId: metadata.userId || null,
    statusCode: metadata.statusCode || 500,
    stack: sanitizeMessage(stack)
  };
  
  const entry = formatLogEntry('ERROR', message, logMetadata);
  
  // Write to error log
  writeLog(ERROR_LOG_FILE, entry);
  
  // Write to combined log
  writeLog(COMBINED_LOG_FILE, entry);
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${message}`, logMetadata);
  }
}

/**
 * Log info message
 * 
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function logInfo(message, metadata = {}) {
  const entry = formatLogEntry('INFO', message, metadata);
  
  // Write to combined log
  writeLog(COMBINED_LOG_FILE, entry);
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[INFO] ${message}`, metadata);
  }
}

/**
 * Log warning message
 * 
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 */
export function logWarn(message, metadata = {}) {
  const entry = formatLogEntry('WARN', message, metadata);
  
  // Write to combined log
  writeLog(COMBINED_LOG_FILE, entry);
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[WARN] ${message}`, metadata);
  }
}

/**
 * Get log file path for testing
 * 
 * @param {string} type - Log type ('error' or 'combined')
 * @returns {string} Log file path
 */
export function getLogFilePath(type = 'combined') {
  return type === 'error' ? ERROR_LOG_FILE : COMBINED_LOG_FILE;
}

/**
 * Clear log files (for testing)
 */
export function clearLogs() {
  try {
    if (fs.existsSync(ERROR_LOG_FILE)) {
      fs.unlinkSync(ERROR_LOG_FILE);
    }
    if (fs.existsSync(COMBINED_LOG_FILE)) {
      fs.unlinkSync(COMBINED_LOG_FILE);
    }
  } catch (error) {
    console.error('Failed to clear logs:', error);
  }
}
