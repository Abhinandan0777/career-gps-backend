/**
 * Error Handler Middleware
 * Centralized error handling for the Career GPS Platform
 * 
 * Requirements: 10.1, 10.2
 */

import { logError } from '../services/logger.service.js';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(message, statusCode, field = null) {
    super(message);
    this.statusCode = statusCode;
    this.field = field;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 * Handles all errors and returns consistent JSON responses
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandler(err, req, res, next) {
  // Default to 500 server error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let field = err.field || null;
  let code = 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'UnauthorizedError' || message.includes('Token') || message.includes('Authentication')) {
    statusCode = 401;
    code = 'AUTHENTICATION_ERROR';
    message = 'Authentication failed';
  } else if (err.name === 'ForbiddenError' || message.includes('permission') || message.includes('authorized')) {
    statusCode = 403;
    code = 'AUTHORIZATION_ERROR';
    message = 'Insufficient permissions';
  } else if (err.name === 'NotFoundError' || message.includes('not found')) {
    statusCode = 404;
    code = 'NOT_FOUND';
  } else if (err.name === 'ConflictError' || message.includes('already exists') || message.includes('duplicate')) {
    statusCode = 409;
    code = 'CONFLICT';
  } else if (err.name === 'TooManyRequestsError') {
    statusCode = 429;
    code = 'RATE_LIMIT_EXCEEDED';
    message = 'Too many requests, please try again later';
  } else if (err.name === 'ServiceUnavailableError') {
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'Service temporarily unavailable';
  }

  // Log the error (without sensitive data)
  logError(err, {
    path: req.path,
    method: req.method,
    userId: req.user?.id || null,
    statusCode
  });

  // Build error response
  const errorResponse = {
    code,
    message
  };

  // Add field if present (for validation errors)
  if (field) {
    errorResponse.field = field;
  }

  // Add stack trace in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 * Handles requests to non-existent routes
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors and pass to error handler
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
