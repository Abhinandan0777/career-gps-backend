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
import { unauthenticatedRateLimiter } from './middleware/rateLimit.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware - must be first
app.use(securityHeaders());
app.use(corsMiddleware());

// Rate limiting - apply to all routes
app.use(unauthenticatedRateLimiter);

// Body parsing middleware
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'Career GPS Platform API', version: '1.0.0' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Users routes
app.use('/api/users', usersRoutes);

// Career routes
app.use('/api/career', careerRoutes);

// Courses routes
app.use('/api/courses', coursesRoutes);

// Skills routes
app.use('/api/skills', skillsRoutes);

// Lessons routes
app.use('/api/lessons', lessonsRoutes);

// Enrollments routes
app.use('/api/enrollments', enrollmentsRoutes);

// Certificates routes
app.use('/api/certificates', certificatesRoutes);

// Creators routes
app.use('/api/creators', creatorsRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

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
