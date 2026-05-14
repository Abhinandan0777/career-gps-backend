/**
 * Google Gemini AI Service
 * Handles all AI operations using Google Gemini API with official SDK
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
let genAI = null;

function getGeminiClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Parse resume text using Google Gemini to extract technical skills
 * @param {string} resumeText - The extracted text content from resume
 * @returns {Promise<Array<{name: string, level: string}>>} Array of skills with proficiency levels
 */
export async function parseResumeWithGemini(resumeText) {
  if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
    throw new Error('Resume text must be a non-empty string');
  }

  const prompt = `Extract all technical skills from the following resume and estimate proficiency levels.

Return a JSON array in this format:
[{"name": "JavaScript", "level": "advanced"}, {"name": "React", "level": "intermediate"}]

Rules:
- Only technical skills (programming languages, frameworks, tools, databases)
- Level: "beginner", "intermediate", or "advanced"
- Estimate based on experience years and project complexity
- Default to "intermediate" if unclear
- Return empty array if no skills found

Resume:
${resumeText.substring(0, 3000)}

JSON array:`;

  try {
    const genAI = getGeminiClient();
    // Using gemini-2.5-flash for better performance and quality
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const generatedText = response.text();

    // Extract JSON array from the response (handle markdown code blocks)
    let skills = [];
    try {
      // Remove markdown code blocks if present
      let jsonText = generatedText;
      if (jsonText.includes('```json')) {
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.replace(/```\s*/g, '');
      }
      
      // Trim whitespace
      jsonText = jsonText.trim();
      
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const parsedContent = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsedContent)) {
          skills = parsedContent;
        }
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError.message);
      skills = extractSkillsWithRegex(resumeText);
    }

    // Validate and normalize the skills array
    const validLevels = ['beginner', 'intermediate', 'advanced'];
    const validatedSkills = skills
      .filter(skill => {
        return skill && 
               typeof skill === 'object' && 
               skill.name && 
               typeof skill.name === 'string' &&
               skill.level &&
               validLevels.includes(skill.level.toLowerCase());
      })
      .map(skill => ({
        name: skill.name.trim(),
        level: skill.level.toLowerCase()
      }));

    return validatedSkills;

  } catch (error) {
    // Check if it's a rate limit error
    if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate limit')) {
      console.error('Gemini API rate limit exceeded. Falling back to regex extraction.');
    } else {
      console.error('Error parsing resume with Gemini:', error);
    }
    
    console.log('Falling back to regex-based skill extraction...');
    const fallbackSkills = extractSkillsWithRegex(resumeText);
    console.log(`Extracted ${fallbackSkills.length} skills using regex fallback`);
    return fallbackSkills;
  }
}

/**
 * Analyze skill gap using Google Gemini
 * @param {Array<string|Object>} userSkills - User's current skills
 * @param {string} jobRoleName - Target job role name
 * @returns {Promise<Object>} Analysis with requiredSkills, matchedSkills, missingSkills, readinessPercentage
 */
export async function analyzeSkillGapWithGemini(userSkills, jobRoleName) {
  // Normalize user skills to array of skill names
  const userSkillNames = userSkills.map(s => {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object' && s.name) return s.name;
    return '';
  }).filter(name => name.length > 0);

  const prompt = `You are a career advisor AI. Analyze the skill gap for a ${jobRoleName} position.

User's Current Skills:
${userSkillNames.join(', ')}

Task:
1. List ALL required technical skills for a modern ${jobRoleName} role 
2. Identify which user skills match the required skills (case-insensitive)
3. Identify which required skills are missing
4. Prioritize industry-relevant technologies and modern development practices.

Return ONLY a JSON object in this exact format:
{
  "requiredSkills": ["skill1", "skill2", ...],
  "matchedSkills": ["skill1", ...],
  "missingSkills": ["skill2", ...]
}

Rules:
- Include programming languages, frameworks, tools, databases, methodologies
- Be comprehensive - include both fundamental and advanced skills
- Match skills case-insensitively (e.g., "javascript" matches "JavaScript")
- Only include skills in matchedSkills if user actually has them
- missingSkills = requiredSkills - matchedSkills

JSON object:`;

  try {
    const genAI = getGeminiClient();
    // Using gemini-2.5-flash for better performance and quality
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const generatedText = response.text();

    // Extract JSON object from the response (handle markdown code blocks)
    let analysis = null;
    try {
      // Remove markdown code blocks if present
      let jsonText = generatedText;
      if (jsonText.includes('```json')) {
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.replace(/```\s*/g, '');
      }
      
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError.message);
      console.error('Response text:', generatedText);
      throw new Error('Failed to parse Gemini skill gap analysis');
    }

    // Validate the response structure
    if (!analysis || !Array.isArray(analysis.requiredSkills) || 
        !Array.isArray(analysis.matchedSkills) || !Array.isArray(analysis.missingSkills)) {
      throw new Error('Invalid Gemini response structure');
    }

    // Calculate readiness percentage
    const totalRequired = analysis.requiredSkills.length;
    const matched = analysis.matchedSkills.length;
    const readinessPercentage = totalRequired > 0 
      ? Math.round((matched / totalRequired) * 100) 
      : 0;

    return {
      requiredSkills: analysis.requiredSkills,
      matchedSkills: analysis.matchedSkills,
      missingSkills: analysis.missingSkills,
      readinessPercentage,
      totalSkills: totalRequired,
      matchedCount: matched
    };

  } catch (error) {
    console.error('Error analyzing skill gap with Gemini:', error);
    
    // Check if it's a rate limit error and provide better error message
    if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate limit')) {
      throw new Error('API rate limit exceeded. Please try again later or wait for quota reset.');
    }
    
    throw error;
  }
}

/**
 * Generate learning roadmap using Google Gemini
 * @param {Array<string|Object>} userSkills - User's current skills
 * @param {string} jobRoleName - Target job role name
 * @param {number} targetWeeks - Target duration in weeks
 * @returns {Promise<Object>} Learning roadmap with weekly breakdown
 */
export async function generateLearningRoadmapWithAI(userSkills, jobRoleName, targetWeeks = 12) {
  // Normalize user skills to array of skill names
  const userSkillNames = userSkills.map(s => {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object' && s.name) return s.name;
    return '';
  }).filter(name => name.length > 0);

  const prompt = `You are a career advisor AI. Create a detailed ${targetWeeks}-week learning roadmap for someone to become a ${jobRoleName}.

User's Current Skills:
${userSkillNames.join(', ')}

Task:
1. Identify skills needed for ${jobRoleName} that the user doesn't have
2. Create a week-by-week learning plan for ${targetWeeks} weeks
3. For each week, specify:
   - Skills to focus on
   - Estimated hours of study
   - Key learning objectives
   - Milestone (if applicable)

Return ONLY a JSON object in this exact format:
{
  "jobRole": "${jobRoleName}",
  "estimatedWeeks": ${targetWeeks},
  "totalHours": 120,
  "estimatedHoursPerWeek": 10,
  "weeklyPlan": [
    {
      "week": 1,
      "focus": "Fundamentals of X",
      "skills": ["skill1", "skill2"],
      "estimatedHours": 10,
      "milestone": "Complete basics",
      "courses": [
        {
          "title": "Course Name",
          "description": "Brief description",
          "duration": "10h",
          "platform": "Online"
        }
      ]
    }
  ],
  "milestones": [
    {
      "week": 4,
      "title": "Milestone Name",
      "description": "What you'll achieve"
    }
  ]
}

Rules:
- Be realistic about time estimates (10-15 hours per week)
- Order skills from foundational to advanced
- Include practical projects as milestones
- Suggest 1-2 courses per week
- Make milestones every 3-4 weeks

JSON object:`;

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash']; // Try 2.5 first, fallback to 1.5
  let lastError = null;

  for (const modelName of models) {
    try {
      console.log(`[Roadmap AI] Trying model: ${modelName}`);
      const genAI = getGeminiClient();
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8192,
        }
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const generatedText = response.text();

      // Extract JSON object from the response
      let roadmap = null;
      try {
        let jsonText = generatedText;
        if (jsonText.includes('```json')) {
          jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.replace(/```\s*/g, '');
        }
        
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          roadmap = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('[Roadmap AI] Failed to parse response:', parseError.message);
        console.error('[Roadmap AI] Response text:', generatedText.substring(0, 500));
        throw new Error('Failed to parse AI-generated roadmap');
      }

      // Validate the response structure
      if (!roadmap || !Array.isArray(roadmap.weeklyPlan)) {
        throw new Error('Invalid roadmap structure from AI');
      }

      console.log(`[Roadmap AI] Successfully generated roadmap with ${modelName}`);
      return roadmap;

    } catch (error) {
      console.error(`[Roadmap AI] Error with ${modelName}:`, error.message);
      lastError = error;
      
      // If it's a 503 (service unavailable), try the next model
      if (error.status === 503) {
        console.log(`[Roadmap AI] ${modelName} unavailable, trying next model...`);
        continue;
      }
      
      // For other errors, throw immediately
      if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate limit')) {
        throw new Error('API rate limit exceeded. Please try again later or wait for quota reset.');
      }
      
      throw error;
    }
  }

  // If all models failed, throw the last error
  if (lastError) {
    if (lastError.status === 503) {
      throw new Error('AI service is temporarily unavailable due to high demand. Please try again in a few minutes.');
    }
    throw lastError;
  }
  
  throw new Error('Failed to generate roadmap with any available model');
}

/**
 * Analyze lesson transcript and generate structured learning materials
 * @param {string} transcriptText - The lesson transcript text
 * @returns {Promise<Object>} Structured notes, key concepts, highlights, and MCQs
 */
export async function analyzeTranscriptWithAI(transcriptText) {
  if (!transcriptText || typeof transcriptText !== 'string' || transcriptText.trim().length === 0) {
    throw new Error('Transcript text must be a non-empty string');
  }

  const prompt = `You are an expert educator, instructional designer, and assessment creator.
Your task is to analyze a lesson transcript and generate:
1. Structured Notes
2. Key Concepts
3. Important Highlights
4. Multiple Choice Questions (MCQs)

------------------------------------------------
INPUT
------------------------------------------------
Transcript:
${transcriptText.substring(0, 10000)}

------------------------------------------------
REQUIREMENTS
------------------------------------------------
A. NOTES
- Convert transcript into structured notes
- Use simple and clear language
- Organize into:
  - Title
  - Headings
  - Bullet points
- Include explanations, not just keywords

B. KEY CONCEPTS
- Extract the most important concepts
- Keep concise (5–10 items)
- Avoid duplicates

C. IMPORTANT HIGHLIGHTS
- Extract key takeaways
- Include definitions, rules, or formulas (if any)

D. MCQs
- Generate 5 high-quality MCQs
- Each MCQ must include:
  - Question
  - 4 options
  - 1 correct answer
- Questions should test understanding (not trivial)
- Avoid ambiguous answers

------------------------------------------------
OUTPUT FORMAT (STRICT JSON)
------------------------------------------------
Return ONLY valid JSON. No extra text.

{
  "notes": {
    "title": "",
    "sections": [
      {
        "heading": "",
        "points": []
      }
    ]
  },
  "keyConcepts": [],
  "highlights": [],
  "mcqs": [
    {
      "question": "",
      "options": ["", "", "", ""],
      "answer": ""
    }
  ]
}

------------------------------------------------
IMPORTANT RULES
------------------------------------------------
- Do NOT include explanations outside JSON
- Do NOT hallucinate facts not present in transcript
- Keep language student-friendly
- Ensure MCQ answers are correct and present in options
- Avoid repetition
- Ensure JSON is valid and parsable

JSON object:`;

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const modelName of models) {
    try {
      console.log(`[Transcript AI] Trying model: ${modelName}`);
      const genAI = getGeminiClient();
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        }
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const generatedText = response.text();

      // Extract JSON object from the response
      let analysis = null;
      try {
        let jsonText = generatedText;
        if (jsonText.includes('```json')) {
          jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.replace(/```\s*/g, '');
        }
        
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('[Transcript AI] Failed to parse response:', parseError.message);
        console.error('[Transcript AI] Response text:', generatedText.substring(0, 500));
        throw new Error('Failed to parse AI-generated transcript analysis');
      }

      // Validate the response structure
      if (!analysis || !analysis.notes || !Array.isArray(analysis.keyConcepts) || 
          !Array.isArray(analysis.highlights) || !Array.isArray(analysis.mcqs)) {
        throw new Error('Invalid transcript analysis structure from AI');
      }

      console.log(`[Transcript AI] Successfully analyzed transcript with ${modelName}`);
      return analysis;

    } catch (error) {
      console.error(`[Transcript AI] Error with ${modelName}:`, error.message);
      lastError = error;
      
      // If it's a 503 (service unavailable), try the next model
      if (error.status === 503) {
        console.log(`[Transcript AI] ${modelName} unavailable, trying next model...`);
        continue;
      }
      
      // For other errors, throw immediately
      if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate limit')) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      
      throw error;
    }
  }

  // If all models failed, throw the last error
  if (lastError) {
    if (lastError.status === 503) {
      throw new Error('AI service is temporarily unavailable. Please try again in a few minutes.');
    }
    throw lastError;
  }
  
  throw new Error('Failed to analyze transcript with any available model');
}

/**
 * Fallback function to extract skills using regex patterns
 * @param {string} text - Resume text
 * @returns {Array<{name: string, level: string}>} Extracted skills
 */
function extractSkillsWithRegex(text) {
  const commonSkills = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Go', 'Rust',
    'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'Laravel',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'SQL', 'NoSQL',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git', 'CI/CD',
    'HTML', 'CSS', 'Sass', 'Tailwind', 'Bootstrap',
    'REST', 'GraphQL', 'API', 'Microservices'
  ];

  const foundSkills = [];
  const textLower = text.toLowerCase();

  for (const skill of commonSkills) {
    const skillLower = skill.toLowerCase();
    if (textLower.includes(skillLower)) {
      // Escape special regex characters
      const escapedSkill = skillLower.replace(/[.*+?^${}()|[\]\\]/g, (match) => '\\' + match);
      const count = (textLower.match(new RegExp(escapedSkill, 'g')) || []).length;
      const hasExpertise = /expert|senior|lead|architect/i.test(text);
      
      let level = 'intermediate';
      if (count > 3 || (hasExpertise && count > 1)) {
        level = 'advanced';
      } else if (count === 1) {
        level = 'beginner';
      }

      foundSkills.push({ name: skill, level });
    }
  }

  return foundSkills;
}
