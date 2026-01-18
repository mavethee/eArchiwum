import { Request, Response, NextFunction } from 'express'
import { IncomingHttpHeaders } from 'http'
import AuthService from '../services/auth'
import { JWTPayload } from '../types'
import { getLogger } from '../utils/logger'
import { AppError } from '../utils/errors'

const logger = getLogger('Auth')

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload
  token?: string
  headers: IncomingHttpHeaders
  body: unknown
  query: Request['query']
  params: Request['params']
}

/**
 * JWT Authentication middleware
 */
export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authorizationHeader = (req.headers as Record<string, string | string[] | undefined>)
      .authorization
    const authHeader = Array.isArray(authorizationHeader)
      ? authorizationHeader[0] || ''
      : authorizationHeader || ''
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        }
      })
      return
    }

    const token = authHeader.substring(7)
    const payload = AuthService.verifyToken(token)

    req.user = payload as JWTPayload
    req.token = token
    next()
  } catch {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      }
    })
  }
}

/**
 * Role-based access control
 */
export const authorize = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      })
      return
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      })
    }

    next()
  }
}

/**
 * Error handling middleware
 */
export const errorHandler = (
  err: Error & Record<string, unknown>,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  const requestId = (req.headers['x-request-id'] as string) || 'unknown'

  if (err instanceof AppError) {
    logger.warn({ code: err.code, status: err.status, requestId, path: req.path }, err.message)
    res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      },
      timestamp: new Date().toISOString(),
      requestId
    })
    return
  }

  logger.error({ error: err, requestId, path: req.path, method: req.method }, 'Unhandled error')

  const status = ((err as Record<string, unknown>).status as number) || 500
  const message = err.message || 'Internal server error'
  const code = ((err as Record<string, unknown>).code as string) || 'INTERNAL_ERROR'

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    timestamp: new Date().toISOString(),
    requestId
  })
}

/**
 * Request ID middleware
 */
export const requestIdMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  ;(req.headers as Record<string, unknown>)['x-request-id'] =
    (req.headers as Record<string, unknown>)['x-request-id'] ||
    Math.random().toString(36).substr(2, 9)
  next()
}

/**
 * Logging middleware
 */
export const loggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now()
  const requestId = (req.headers['x-request-id'] as string) || 'unknown'

  res.on('finish', () => {
    const duration = Date.now() - start
    const level: 'error' | 'warn' | 'info' =
      res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'

    logger[level]({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      requestId
    })
  })

  next()
}

export default {
  authenticate,
  authorize,
  errorHandler,
  requestIdMiddleware,
  loggingMiddleware
}
