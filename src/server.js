import express from 'express';
import compression from 'compression';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import careerRoutes from './routes/career.routes.js';
import coursesRoutes from './routes/courses.routes.js';
import lessonsRoutes from './routes/lessons.routes.js';
import enrollmentsRoutes from './routes/enrollments.routes.js';
import certificatesRoutes from './routes/certificates.routes.js';
import creatorsRoutes from './routes/creators.routes.js';
import adminRoutes from './routes/admin.routes.js';
import skillsRoutes from './routes/skills.routes.js';
import { securityHeaders } from './middleware/security.middleware.js';
import { corsMiddleware } from './middleware/cors.middleware.js';
import { authRateLimiter, adaptiveRateLimiter } from './middleware/rateLimit.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware - must be first
app.use(securityHeaders());
app.use(corsMiddleware());

// Body parsing middleware
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (no rate limit for monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'Career GPS Platform API', version: '1.0.0' });
});

// Auth routes - special rate limiter for brute force protection
app.use('/api/auth', authRateLimiter, authRoutes);

// All other routes - adaptive rate limiting based on auth status
// This applies different limits for authenticated vs unauthenticated users
app.use('/api/users', adaptiveRateLimiter, usersRoutes);
app.use('/api/career', adaptiveRateLimiter, careerRoutes);
app.use('/api/courses', adaptiveRateLimiter, coursesRoutes);
app.use('/api/skills', adaptiveRateLimiter, skillsRoutes);
app.use('/api/lessons', adaptiveRateLimiter, lessonsRoutes);
app.use('/api/enrollments', adaptiveRateLimiter, enrollmentsRoutes);
app.use('/api/certificates', adaptiveRateLimiter, certificatesRoutes);
app.use('/api/creators', adaptiveRateLimiter, creatorsRoutes);
app.use('/api/admin', adaptiveRateLimiter, adminRoutes);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// Only start server if not being imported (e.g., for tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
