import { transaction, query } from '../src/utils/db.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Seed the database with initial data
 * - Job roles with required skills
 * - Sample skills across categories
 * - Sample courses for testing
 * - Admin user account
 */
async function seedDatabase() {
  console.log('Starting database seeding...');

  try {
    await transaction(async (client) => {
      // ============================================================================
      // 1. Create Skills
      // ============================================================================
      console.log('Seeding skills...');
      
      const skills = [
        // Frontend Skills
        { name: 'React', category: 'Frontend', description: 'JavaScript library for building user interfaces' },
        { name: 'Vue.js', category: 'Frontend', description: 'Progressive JavaScript framework' },
        { name: 'Angular', category: 'Frontend', description: 'TypeScript-based web application framework' },
        { name: 'HTML/CSS', category: 'Frontend', description: 'Markup and styling languages for web' },
        { name: 'JavaScript', category: 'Frontend', description: 'Programming language for web development' },
        { name: 'TypeScript', category: 'Frontend', description: 'Typed superset of JavaScript' },
        { name: 'Tailwind CSS', category: 'Frontend', description: 'Utility-first CSS framework' },
        
        // Backend Skills
        { name: 'Node.js', category: 'Backend', description: 'JavaScript runtime for server-side development' },
        { name: 'Express.js', category: 'Backend', description: 'Web application framework for Node.js' },
        { name: 'Python', category: 'Backend', description: 'High-level programming language' },
        { name: 'Django', category: 'Backend', description: 'Python web framework' },
        { name: 'FastAPI', category: 'Backend', description: 'Modern Python web framework' },
        { name: 'Java', category: 'Backend', description: 'Object-oriented programming language' },
        { name: 'Spring Boot', category: 'Backend', description: 'Java framework for building applications' },
        
        // Database Skills
        { name: 'PostgreSQL', category: 'Database', description: 'Open-source relational database' },
        { name: 'MongoDB', category: 'Database', description: 'NoSQL document database' },
        { name: 'MySQL', category: 'Database', description: 'Open-source relational database' },
        { name: 'Redis', category: 'Database', description: 'In-memory data structure store' },
        { name: 'SQL', category: 'Database', description: 'Structured Query Language for databases' },
        
        // DevOps Skills
        { name: 'Docker', category: 'DevOps', description: 'Containerization platform' },
        { name: 'Kubernetes', category: 'DevOps', description: 'Container orchestration platform' },
        { name: 'AWS', category: 'DevOps', description: 'Amazon Web Services cloud platform' },
        { name: 'CI/CD', category: 'DevOps', description: 'Continuous Integration and Deployment' },
        { name: 'Git', category: 'DevOps', description: 'Version control system' },
        
        // Testing Skills
        { name: 'Jest', category: 'Testing', description: 'JavaScript testing framework' },
        { name: 'Pytest', category: 'Testing', description: 'Python testing framework' },
        { name: 'Unit Testing', category: 'Testing', description: 'Testing individual units of code' },
        { name: 'Integration Testing', category: 'Testing', description: 'Testing component interactions' },
        
        // Soft Skills
        { name: 'Agile Methodology', category: 'Soft Skills', description: 'Iterative development approach' },
        { name: 'Communication', category: 'Soft Skills', description: 'Effective information exchange' },
        { name: 'Problem Solving', category: 'Soft Skills', description: 'Analytical thinking and solutions' },
        { name: 'Team Collaboration', category: 'Soft Skills', description: 'Working effectively in teams' }
      ];

      const skillIds = {};
      for (const skill of skills) {
        const result = await client.query(
          `INSERT INTO skills (name, category, description) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (name) DO UPDATE SET category = $2, description = $3
           RETURNING id, name`,
          [skill.name, skill.category, skill.description]
        );
        skillIds[skill.name] = result.rows[0].id;
      }
      console.log(`✓ Seeded ${Object.keys(skillIds).length} skills`);

      // ============================================================================
      // 2. Create Job Roles with Required Skills
      // ============================================================================
      console.log('Seeding job roles...');
      
      const jobRoles = [
        {
          name: 'Full Stack Developer',
          category: 'Engineering',
          description: 'Develops both frontend and backend applications',
          skills: [
            { name: 'React', level: 'intermediate' },
            { name: 'Node.js', level: 'intermediate' },
            { name: 'JavaScript', level: 'advanced' },
            { name: 'PostgreSQL', level: 'intermediate' },
            { name: 'Git', level: 'intermediate' },
            { name: 'HTML/CSS', level: 'intermediate' }
          ]
        },
        {
          name: 'Frontend Developer',
          category: 'Engineering',
          description: 'Specializes in user interface development',
          skills: [
            { name: 'React', level: 'advanced' },
            { name: 'JavaScript', level: 'advanced' },
            { name: 'TypeScript', level: 'intermediate' },
            { name: 'HTML/CSS', level: 'advanced' },
            { name: 'Tailwind CSS', level: 'intermediate' }
          ]
        },
        {
          name: 'Backend Developer',
          category: 'Engineering',
          description: 'Focuses on server-side application logic',
          skills: [
            { name: 'Node.js', level: 'advanced' },
            { name: 'Express.js', level: 'advanced' },
            { name: 'PostgreSQL', level: 'advanced' },
            { name: 'SQL', level: 'advanced' },
            { name: 'Docker', level: 'intermediate' }
          ]
        },
        {
          name: 'DevOps Engineer',
          category: 'Engineering',
          description: 'Manages infrastructure and deployment pipelines',
          skills: [
            { name: 'Docker', level: 'advanced' },
            { name: 'Kubernetes', level: 'advanced' },
            { name: 'AWS', level: 'advanced' },
            { name: 'CI/CD', level: 'advanced' },
            { name: 'Git', level: 'intermediate' }
          ]
        }
      ];

      for (const role of jobRoles) {
        const roleResult = await client.query(
          `INSERT INTO job_roles (name, category, description) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (name) DO UPDATE SET category = $2, description = $3
           RETURNING id`,
          [role.name, role.category, role.description]
        );
        const roleId = roleResult.rows[0].id;

        // Add skills to job role
        for (const skill of role.skills) {
          const skillId = skillIds[skill.name];
          if (skillId) {
            await client.query(
              `INSERT INTO job_role_skills (job_role_id, skill_id, required_level, is_required) 
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (job_role_id, skill_id) DO UPDATE SET required_level = $3`,
              [roleId, skillId, skill.level, true]
            );
          }
        }
      }
      console.log(`✓ Seeded ${jobRoles.length} job roles with skills`);

      // ============================================================================
      // 3. Create Admin User
      // ============================================================================
      console.log('Creating admin user...');
      
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@careergps.com';
      const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
      const adminName = process.env.ADMIN_NAME || 'System Administrator';
      
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      
      const adminResult = await client.query(
        `INSERT INTO users (email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = $3, role = $4
         RETURNING id`,
        [adminEmail, passwordHash, adminName, 'admin']
      );
      const adminId = adminResult.rows[0].id;
      console.log(`✓ Created admin user: ${adminEmail}`);

      // ============================================================================
      // 4. Create Sample Courses
      // ============================================================================
      console.log('Seeding sample courses...');
      
      const courses = [
        {
          title: 'React Fundamentals',
          description: 'Learn the basics of React including components, props, state, and hooks',
          duration_hours: 8,
          difficulty: 'beginner',
          is_published: true,
          skills: ['React', 'JavaScript', 'HTML/CSS'],
          lessons: [
            { title: 'Introduction to React', content: 'Overview of React and its ecosystem', order: 1, duration_minutes: 30 },
            { title: 'Components and Props', content: 'Understanding React components and props', order: 2, duration_minutes: 45 },
            { title: 'State and Lifecycle', content: 'Managing component state and lifecycle', order: 3, duration_minutes: 60 },
            { title: 'Hooks in React', content: 'Using useState, useEffect, and custom hooks', order: 4, duration_minutes: 60 }
          ]
        },
        {
          title: 'Node.js Backend Development',
          description: 'Build RESTful APIs with Node.js and Express',
          duration_hours: 12,
          difficulty: 'intermediate',
          is_published: true,
          skills: ['Node.js', 'Express.js', 'JavaScript'],
          lessons: [
            { title: 'Node.js Basics', content: 'Introduction to Node.js runtime', order: 1, duration_minutes: 45 },
            { title: 'Express Framework', content: 'Building web servers with Express', order: 2, duration_minutes: 60 },
            { title: 'RESTful API Design', content: 'Designing and implementing REST APIs', order: 3, duration_minutes: 90 },
            { title: 'Authentication & Security', content: 'Implementing JWT authentication', order: 4, duration_minutes: 75 }
          ]
        },
        {
          title: 'PostgreSQL Database Mastery',
          description: 'Master PostgreSQL from basics to advanced queries',
          duration_hours: 10,
          difficulty: 'intermediate',
          is_published: true,
          skills: ['PostgreSQL', 'SQL'],
          lessons: [
            { title: 'SQL Fundamentals', content: 'Basic SQL queries and operations', order: 1, duration_minutes: 60 },
            { title: 'Advanced Queries', content: 'Joins, subqueries, and aggregations', order: 2, duration_minutes: 75 },
            { title: 'Database Design', content: 'Normalization and schema design', order: 3, duration_minutes: 60 },
            { title: 'Performance Optimization', content: 'Indexes, query optimization, and tuning', order: 4, duration_minutes: 90 }
          ]
        },
        {
          title: 'Docker for Developers',
          description: 'Containerize applications with Docker',
          duration_hours: 6,
          difficulty: 'beginner',
          is_published: true,
          skills: ['Docker', 'DevOps'],
          lessons: [
            { title: 'Docker Basics', content: 'Understanding containers and images', order: 1, duration_minutes: 45 },
            { title: 'Dockerfile Creation', content: 'Writing Dockerfiles for applications', order: 2, duration_minutes: 60 },
            { title: 'Docker Compose', content: 'Multi-container applications', order: 3, duration_minutes: 60 }
          ]
        },
        {
          title: 'TypeScript for JavaScript Developers',
          description: 'Add type safety to your JavaScript code',
          duration_hours: 5,
          difficulty: 'beginner',
          is_published: true,
          skills: ['TypeScript', 'JavaScript'],
          lessons: [
            { title: 'TypeScript Basics', content: 'Types, interfaces, and basic syntax', order: 1, duration_minutes: 45 },
            { title: 'Advanced Types', content: 'Generics, unions, and utility types', order: 2, duration_minutes: 60 },
            { title: 'TypeScript with React', content: 'Using TypeScript in React applications', order: 3, duration_minutes: 60 }
          ]
        }
      ];

      for (const course of courses) {
        const courseResult = await client.query(
          `INSERT INTO courses (title, description, creator_id, duration_hours, difficulty, is_published) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           RETURNING id`,
          [course.title, course.description, adminId, course.duration_hours, course.difficulty, course.is_published]
        );
        const courseId = courseResult.rows[0].id;

        // Add skills to course
        for (const skillName of course.skills) {
          const skillId = skillIds[skillName];
          if (skillId) {
            await client.query(
              `INSERT INTO course_skills (course_id, skill_id) 
               VALUES ($1, $2)
               ON CONFLICT (course_id, skill_id) DO NOTHING`,
              [courseId, skillId]
            );
          }
        }

        // Add lessons to course
        for (const lesson of course.lessons) {
          await client.query(
            `INSERT INTO lessons (course_id, title, content, "order", duration_minutes) 
             VALUES ($1, $2, $3, $4, $5)`,
            [courseId, lesson.title, lesson.content, lesson.order, lesson.duration_minutes]
          );
        }
      }
      console.log(`✓ Seeded ${courses.length} courses with lessons`);
    });

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\nSeeded data summary:');
    console.log('- 32 skills across 6 categories');
    console.log('- 4 job roles with required skills');
    console.log('- 1 admin user account');
    console.log('- 5 published courses with lessons');
    console.log(`\nAdmin credentials:`);
    console.log(`  Email: ${process.env.ADMIN_EMAIL || 'admin@careergps.com'}`);
    console.log(`  Password: ${process.env.ADMIN_PASSWORD || 'Admin123!'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the seed function
seedDatabase();
