import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for authenticated users - General API requests
 * More generous limits for normal operations
 */
export const authenticatedRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200, // 200 requests per minute
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 60
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use user ID as key if authenticated
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  // Add retry-after header
  handler: (req, res) => {
    res.status(429).set('Retry-After', '60').json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60
    });
  },
  // Skip rate limiting only in test environment
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  }
});

/**
 * Rate limiter for unauthenticated users - More restrictive
 * Protects public endpoints from abuse
 */
export const unauthenticatedRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_UNAUTH) || 30, // 30 requests per minute
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip;
  },
  handler: (req, res) => {
    res.status(429).set('Retry-After', '60').json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: 60
    });
  },
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  }
});

/**
 * Rate limiter for AI operations (resume parsing, skill gap, roadmap, transcript analysis)
 * Very generous limits because these operations:
 * - Take 5-120 seconds to complete
 * - Are expensive API calls
 * - Users don't repeatedly trigger them
 */
export const aiOperationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 AI operations per 15 minutes (more than enough)
  message: {
    error: 'AI operation rate limit exceeded',
    message: 'You have made too many AI requests. Please wait 15 minutes before trying again.',
    retryAfter: 900 // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.userId || req.ip;
  },
  handler: (req, res) => {
    res.status(429).set('Retry-After', '900').json({
      error: 'AI operation rate limit exceeded',
      message: 'You have made too many AI requests. Please wait 15 minutes before trying again.',
      retryAfter: 900
    });
  },
  skip: (req) => {
    // Don't skip in production - AI calls are expensive!
    return process.env.NODE_ENV === 'test';
  }
});

/**
 * Rate limiter for authentication endpoints (login, register)
 * Protects against brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many login/register attempts. Please try again in 15 minutes.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body?.email || req.ip; // Track by email or IP
  },
  handler: (req, res) => {
    res.status(429).set('Retry-After', '900').json({
      error: 'Too many authentication attempts',
      message: 'Too many login/register attempts. Please try again in 15 minutes.',
      retryAfter: 900
    });
  },
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  }
});

/**
 * Adaptive rate limiter that applies different limits based on authentication status
 * Uses authenticated limit if user is logged in, otherwise uses unauthenticated limit
 */
export function adaptiveRateLimiter(req, res, next) {
  // Check if user is authenticated (has valid JWT token)
  if (req.user && req.user.userId) {
    return authenticatedRateLimiter(req, res, next);
  } else {
    return unauthenticatedRateLimiter(req, res, next);
  }
}
