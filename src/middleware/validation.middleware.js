import Joi from 'joi';

/**
 * Validation schemas for different data types
 */
export const schemas = {
  // User registration validation
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).required().messages({
      'string.min': 'Password must be at least 8 characters long',
      'any.required': 'Password is required'
    }),
    name: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 255 characters',
      'any.required': 'Name is required'
    }),
    role: Joi.string().valid('learner', 'creator', 'admin').default('learner')
  }),

  // User login validation
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  }),

  // User profile update validation
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    bio: Joi.string().max(1000).optional(),
    avatar_url: Joi.string().uri().optional(),
    skills: Joi.array().items(
      Joi.object({
        name: Joi.string().required().messages({
          'any.required': 'Skill name is required'
        }),
        level: Joi.string().valid('beginner', 'intermediate', 'advanced').required().messages({
          'any.only': 'Skill level must be beginner, intermediate, or advanced',
          'any.required': 'Skill level is required'
        })
      })
    ).optional()
  }),

  // Course creation/update validation
  course: Joi.object({
    title: Joi.string().min(5).max(255).required().messages({
      'string.min': 'Course title must be at least 5 characters long',
      'string.max': 'Course title must not exceed 255 characters',
      'any.required': 'Course title is required'
    }),
    description: Joi.string().min(10).max(5000).required().messages({
      'string.min': 'Course description must be at least 10 characters long',
      'string.max': 'Course description must not exceed 5000 characters',
      'any.required': 'Course description is required'
    }),
    thumbnail_url: Joi.string().uri().optional(),
    duration_hours: Joi.number().integer().positive().required().messages({
      'number.base': 'Duration must be a number',
      'number.positive': 'Duration must be a positive number',
      'any.required': 'Duration is required'
    }),
    difficulty: Joi.string().valid('beginner', 'intermediate', 'advanced').required().messages({
      'any.only': 'Difficulty must be beginner, intermediate, or advanced',
      'any.required': 'Difficulty is required'
    }),
    is_published: Joi.boolean().optional(),
    skill_ids: Joi.array().items(Joi.string().uuid()).min(1).optional().messages({
      'array.min': 'At least one skill must be specified'
    })
  }),

  // Lesson creation/update validation
  lesson: Joi.object({
    course_id: Joi.string().uuid().required().messages({
      'string.guid': 'Invalid course ID format',
      'any.required': 'Course ID is required'
    }),
    title: Joi.string().min(3).max(255).required().messages({
      'string.min': 'Lesson title must be at least 3 characters long',
      'string.max': 'Lesson title must not exceed 255 characters',
      'any.required': 'Lesson title is required'
    }),
    content: Joi.string().min(10).optional().messages({
      'string.min': 'Lesson content must be at least 10 characters long'
    }),
    video_url: Joi.string().uri().optional(),
    order: Joi.number().integer().positive().required().messages({
      'number.base': 'Order must be a number',
      'number.positive': 'Order must be a positive number',
      'any.required': 'Order is required'
    }),
    duration_minutes: Joi.number().integer().positive().optional().messages({
      'number.base': 'Duration must be a number',
      'number.positive': 'Duration must be a positive number'
    })
  }),

  // Enrollment validation
  enrollment: Joi.object({
    course_id: Joi.string().uuid().required().messages({
      'string.guid': 'Invalid course ID format',
      'any.required': 'Course ID is required'
    })
  }),

  // Creator application validation
  creatorApplication: Joi.object({
    bio: Joi.string().min(50).max(2000).required().messages({
      'string.min': 'Bio must be at least 50 characters long',
      'string.max': 'Bio must not exceed 2000 characters',
      'any.required': 'Bio is required'
    }),
    expertise: Joi.string().min(10).max(500).required().messages({
      'string.min': 'Expertise must be at least 10 characters long',
      'string.max': 'Expertise must not exceed 500 characters',
      'any.required': 'Expertise is required'
    }),
    portfolio_url: Joi.string().uri().optional()
  })
};

/**
 * Middleware factory for validating request body against a schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace req.body with validated and sanitized value
    req.body = value;
    next();
  };
}

/**
 * Middleware factory for validating request query parameters
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req.query = value;
    next();
  };
}

/**
 * Middleware factory for validating request params
 * @param {Joi.Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req.params = value;
    next();
  };
}
