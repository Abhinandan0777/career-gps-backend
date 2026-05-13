import cors from 'cors';

/**
 * Configure CORS middleware with environment-based allowed origins
 * @returns {Function} Express middleware function
 */
export function corsMiddleware() {
  // Parse allowed origins from environment variable
  // Supports comma-separated list of origins
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : ['http://localhost:5173']; // Default to Vite dev server

  const corsOptions = {
    // Origin validation function
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, curl)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },

    // Allow credentials (cookies, authorization headers)
    credentials: true,

    // Allowed HTTP methods
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

    // Allowed headers
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Idempotency-Key'
    ],

    // Exposed headers (headers that the client can access)
    exposedHeaders: [
      'Content-Length',
      'Content-Type',
      'X-Request-Id',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'Retry-After'
    ],

    // Preflight cache duration (in seconds)
    maxAge: 86400, // 24 hours

    // Pass the CORS preflight response to the next handler
    preflightContinue: false,

    // Provide a status code to use for successful OPTIONS requests
    optionsSuccessStatus: 204
  };

  return cors(corsOptions);
}
