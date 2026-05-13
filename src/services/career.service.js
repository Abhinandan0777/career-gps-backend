import pool from '../config/database.js';

/**
 * Analyze skill gap between user's current skills and job role requirements
 * 
 * @param {string} userId - User UUID
 * @param {string} jobRoleId - Job role UUID
 * @returns {Promise<Object>} Analysis result with matched, missing skills and readiness %
 * 
 * Requirements: 2.1, 2.2, 2.3
 * 
 * Preconditions:
 * - userId must exist in users table
 * - jobRoleId must exist in job_roles table
 * - User must have a profile with skills array
 * 
 * Postconditions:
 * - readiness is a number between 0 and 100
 * - matched and missing arrays are disjoint (no overlap)
 * - Union of matched and missing equals all required skills
 * - matchedCount + missing.length = totalSkills
 */
export async function analyzeSkillGap(userId, jobRoleId) {
  const client = await pool.connect();
  
  try {
    // Step 1: Fetch user's current skills from profile
    const userProfileQuery = 'SELECT skills FROM user_profiles WHERE user_id = $1';
    const userProfileResult = await client.query(userProfileQuery, [userId]);
    
    if (userProfileResult.rows.length === 0) {
      throw new Error('User profile not found');
    }
    
    const userSkills = userProfileResult.rows[0].skills || [];
    // Normalize user skill names to lowercase for case-insensitive comparison
    // Handle both string and object formats: "JavaScript" or {name: "JavaScript", level: "advanced"}
    const userSkillNames = userSkills.map(s => {
      if (typeof s === 'string') {
        return s.toLowerCase();
      } else if (s && typeof s === 'object' && s.name) {
        return s.name.toLowerCase();
      }
      return '';
    }).filter(name => name.length > 0);
    
    // Step 2: Fetch required skills for target job role
    const requiredSkillsQuery = `
      SELECT s.id, s.name, s.category, s.description, 
             jrs.required_level, jrs.is_required
      FROM skills s
      JOIN job_role_skills jrs ON s.id = jrs.skill_id
      WHERE jrs.job_role_id = $1
    `;
    const requiredSkillsResult = await client.query(requiredSkillsQuery, [jobRoleId]);
    
    const requiredSkills = requiredSkillsResult.rows;
    
    // Step 3: Calculate matched and missing skills
    const matched = [];
    const missing = [];
    
    // Partition skills into matched (user has) and missing (user lacks)
    for (const skill of requiredSkills) {
      const skillName = skill.name.toLowerCase();
      
      if (userSkillNames.includes(skillName)) {
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    }
    
    // Step 4: Calculate job readiness percentage
    const totalSkills = requiredSkills.length;
    const matchedCount = matched.length;
    
    // Calculate readiness as (matched / total) * 100
    // Handle edge case where job role has no skills
    const readiness = totalSkills > 0 
      ? Math.round((matchedCount / totalSkills) * 100) 
      : 0;
    
    return {
      matched,
      missing,
      readiness,
      totalSkills,
      matchedCount
    };
    
  } finally {
    client.release();
  }
}

/**
 * Recommend courses for missing skills
 * 
 * @param {Array<Object>} missingSkills - Array of skill objects with id, name, category
 * @returns {Promise<Array<Object>>} Courses grouped by skill
 * 
 * Requirements: 3.1, 3.2
 * 
 * Preconditions:
 * - missingSkills is an array of skill objects with id property
 * 
 * Postconditions:
 * - Returns array of objects with skill and courses properties
 * - Only includes published courses
 * - Courses are ordered by relevance (multi-skill coverage first)
 */
export async function recommendCoursesForSkills(missingSkills) {
  const client = await pool.connect();
  
  try {
    if (!missingSkills || missingSkills.length === 0) {
      return [];
    }

    const skillIds = missingSkills.map(s => s.id);
    
    // Query courses that teach the missing skills
    // Prioritize courses that cover multiple missing skills
    const coursesQuery = `
      SELECT 
        c.id,
        c.title,
        c.description,
        c.duration_hours,
        c.difficulty,
        c.thumbnail_url,
        u.name as creator_name,
        array_agg(DISTINCT s.id) as skill_ids,
        array_agg(DISTINCT s.name) as skill_names,
        COUNT(DISTINCT s.id) as skill_count
      FROM courses c
      JOIN course_skills cs ON c.id = cs.course_id
      JOIN skills s ON cs.skill_id = s.id
      LEFT JOIN users u ON c.creator_id = u.id
      WHERE c.is_published = true
        AND s.id = ANY($1)
      GROUP BY c.id, c.title, c.description, c.duration_hours, c.difficulty, c.thumbnail_url, u.name
      ORDER BY skill_count DESC, c.duration_hours ASC
    `;
    
    const coursesResult = await client.query(coursesQuery, [skillIds]);
    
    // Group courses by skill
    const recommendations = [];
    
    for (const skill of missingSkills) {
      const coursesForSkill = coursesResult.rows
        .filter(course => course.skill_ids.includes(skill.id))
        .map(course => ({
          id: course.id,
          title: course.title,
          description: course.description,
          duration: course.duration_hours,
          difficulty: course.difficulty,
          thumbnailUrl: course.thumbnail_url,
          creatorName: course.creator_name,
          skillsCovered: course.skill_names.filter((_, idx) => 
            missingSkills.some(ms => ms.id === course.skill_ids[idx])
          )
        }));
      
      if (coursesForSkill.length > 0) {
        recommendations.push({
          skill: {
            id: skill.id,
            name: skill.name,
            category: skill.category,
            requiredLevel: skill.required_level
          },
          courses: coursesForSkill
        });
      }
    }
    
    return recommendations;
    
  } finally {
    client.release();
  }
}

/**
 * Generate learning roadmap for user to reach target job role
 * 
 * @param {string} userId - User UUID
 * @param {string} jobRoleId - Target job role UUID
 * @param {number} targetWeeks - Optional target duration in weeks (default: auto-calculate)
 * @returns {Promise<Object>} Learning roadmap with weekly breakdown
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 * 
 * Preconditions:
 * - userId must exist with a profile
 * - jobRoleId must exist
 * 
 * Postconditions:
 * - Roadmap is stored in learning_paths table
 * - Skills are ordered by dependency (foundational → advanced)
 * - Weekly breakdown with realistic time estimates
 */
export async function generateLearningRoadmap(userId, jobRoleId, targetWeeks = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Step 1: Analyze skill gap
    const skillGap = await analyzeSkillGap(userId, jobRoleId);
    
    if (skillGap.missing.length === 0) {
      // User already has all required skills
      return {
        message: 'You already have all required skills for this role!',
        readiness: skillGap.readiness,
        roadmapId: null,
        weeks: []
      };
    }
    
    // Step 2: Get course recommendations
    const courseRecommendations = await recommendCoursesForSkills(skillGap.missing);
    
    // Step 3: Order skills by difficulty (beginner → intermediate → advanced)
    const difficultyOrder = { 'beginner': 1, 'intermediate': 2, 'advanced': 3 };
    const orderedSkills = [...skillGap.missing].sort((a, b) => {
      const levelA = difficultyOrder[a.required_level] || 2;
      const levelB = difficultyOrder[b.required_level] || 2;
      return levelA - levelB;
    });
    
    // Step 4: Calculate total learning hours
    const allCourses = courseRecommendations.flatMap(rec => rec.courses);
    const uniqueCourses = Array.from(
      new Map(allCourses.map(c => [c.id, c])).values()
    );
    const totalHours = uniqueCourses.reduce((sum, course) => sum + (course.duration || 0), 0);
    
    // Step 5: Calculate weeks needed (assume 10 hours/week study time)
    const hoursPerWeek = 10;
    const calculatedWeeks = Math.ceil(totalHours / hoursPerWeek);
    const estimatedWeeks = targetWeeks || calculatedWeeks;
    
    // Step 6: Distribute courses across weeks
    const weeks = [];
    let currentWeek = 1;
    let weekHours = 0;
    let weekSkills = [];
    let weekCourses = [];
    
    for (const skillRec of courseRecommendations) {
      const skill = skillRec.skill;
      const courses = skillRec.courses.slice(0, 2); // Max 2 courses per skill
      
      for (const course of courses) {
        // Check if adding this course exceeds weekly hour limit
        if (weekHours + course.duration > hoursPerWeek && weekCourses.length > 0) {
          // Save current week and start new one
          weeks.push({
            week: currentWeek,
            skills: [...new Set(weekSkills)],
            courses: weekCourses,
            estimatedHours: weekHours,
            milestones: [`Complete ${weekSkills.join(', ')} fundamentals`]
          });
          
          currentWeek++;
          weekHours = 0;
          weekSkills = [];
          weekCourses = [];
        }
        
        weekSkills.push(skill.name);
        weekCourses.push({
          id: course.id,
          title: course.title,
          duration: course.duration,
          difficulty: course.difficulty
        });
        weekHours += course.duration;
      }
    }
    
    // Add final week if there are remaining courses
    if (weekCourses.length > 0) {
      weeks.push({
        week: currentWeek,
        skills: [...new Set(weekSkills)],
        courses: weekCourses,
        estimatedHours: weekHours,
        milestones: [`Complete ${weekSkills.join(', ')} fundamentals`]
      });
    }
    
    // Step 7: Fetch job role details
    const jobRoleQuery = 'SELECT id, name, description, category FROM job_roles WHERE id = $1';
    const jobRoleResult = await client.query(jobRoleQuery, [jobRoleId]);
    const jobRole = jobRoleResult.rows[0];
    
    // Step 8: Create roadmap object
    const roadmap = {
      jobRole: {
        id: jobRole.id,
        name: jobRole.name,
        description: jobRole.description,
        category: jobRole.category
      },
      estimatedWeeks: weeks.length,
      totalCourses: uniqueCourses.length,
      totalHours,
      weeks
    };
    
    // Step 9: Store roadmap in learning_paths table
    const insertQuery = `
      INSERT INTO learning_paths (user_id, job_role_id, roadmap, estimated_weeks, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING id, created_at
    `;
    const insertResult = await client.query(insertQuery, [
      userId,
      jobRoleId,
      JSON.stringify(roadmap),
      weeks.length
    ]);
    
    await client.query('COMMIT');
    
    return {
      roadmapId: insertResult.rows[0].id,
      createdAt: insertResult.rows[0].createdAt,
      ...roadmap
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
