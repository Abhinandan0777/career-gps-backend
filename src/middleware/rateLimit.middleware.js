import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for authenticated users
 * 60 requests per minute (or more in development)
 */
export const authenticatedRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // 1000 requests per window in dev
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
  // Skip rate limiting for certain conditions if needed
  skip: (req) => {
    // Skip rate limiting in test and development environment
    return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
  }
});

/**
 * Rate limiter for unauthenticated users
 * 10 requests per minute (or more in development)
 */
export const unauthenticatedRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_UNAUTH) || 1000, // 1000 requests per window in dev
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
    // Skip rate limiting in test and development environment
    return process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
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
