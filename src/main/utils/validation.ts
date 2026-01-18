import Joi from 'joi'
import { Request, Response, NextFunction } from 'express'

/**
 * Validation schemas for all API endpoints
 */

// Auth schemas
export const authRegisterSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
  email: Joi.string().email()
})

export const authLoginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required()
})

export const authRefreshSchema = Joi.object({
  refreshToken: Joi.string().required()
})

export const authChangePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
})

// File schemas
export const fileSearchSchema = Joi.object({
  q: Joi.string().required(),
  category: Joi.string().valid('document', 'video', 'audio', 'image', 'software'),
  creator: Joi.string(),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  accessLevel: Joi.string().valid('public', 'internal', 'restricted', 'confidential'),
  limit: Joi.number().min(1).max(100).default(50),
  offset: Joi.number().min(0).default(0),
  orderBy: Joi.string().valid('relevance', 'date', 'title').default('relevance'),
  orderDir: Joi.string().valid('asc', 'desc').default('desc')
})

export const fileMetadataUpdateSchema = Joi.object({
  dublinCore: Joi.object({
    'dc:title': Joi.string(),
    'dc:creator': Joi.string(),
    'dc:description': Joi.string(),
    'dc:subject': Joi.string(),
    'dc:type': Joi.string().valid('document', 'video', 'audio', 'image', 'software'),
    'dc:format': Joi.string(),
    'dc:language': Joi.string(),
    'dc:publisher': Joi.string(),
    'dc:date': Joi.string(),
    'dc:rights': Joi.string(),
    'dc:source': Joi.string()
  }),
  description: Joi.string(),
  a11yDescription: Joi.string(),
  accessLevel: Joi.string().valid('public', 'internal', 'restricted', 'confidential')
})

// User schemas
export const userUpdateRoleSchema = Joi.object({
  role: Joi.string().valid('reader', 'curator', 'admin').required()
})

export const userResetPasswordSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  newPassword: Joi.string().min(8).required()
})

// Query parameter schemas
export const paginationSchema = Joi.object({
  limit: Joi.number().min(1).max(100).default(50),
  offset: Joi.number().min(0).default(0)
})

/**
 * Validation middleware factory
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    })

    if (error) {
      const messages = error.details.map((detail: Joi.ValidationErrorItem) => ({
        field: detail.path.join('.'),
        message: detail.message
      }))

      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: messages
        }
      })
      return
    }

    req.body = value
    next()
  }
}

/**
 * Query parameter validation middleware factory
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    })

    if (error) {
      const messages = error.details.map((detail: Joi.ValidationErrorItem) => ({
        field: detail.path.join('.'),
        message: detail.message
      }))

      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query validation failed',
          details: messages
        }
      })
      return
    }

    req.query = value
    next()
  }
}

export default {
  authRegisterSchema,
  authLoginSchema,
  authRefreshSchema,
  authChangePasswordSchema,
  fileSearchSchema,
  fileMetadataUpdateSchema,
  userUpdateRoleSchema,
  userResetPasswordSchema,
  paginationSchema,
  validate,
  validateQuery
}
