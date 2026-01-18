import { Request, Response, NextFunction } from 'express'
import { getLogger } from '../utils/logger'

const logger = getLogger('RateLimiter')

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

/**
 * In-memory rate limiter (for MVP)
 * In production, use Redis-based limiter
 */
class InMemoryRateLimiter {
  private store: RateLimitStore = {}
  private windowMs: number
  private maxRequests: number
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests

    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      5 * 60 * 1000
    )
    // Allow process to exit even with pending timer
    this.cleanupInterval.unref()
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  private cleanup(): void {
    const now = Date.now()
    Object.keys(this.store).forEach((key) => {
      if (this.store[key].resetTime < now) {
        delete this.store[key]
      }
    })
  }

  isLimited(identifier: string): boolean {
    const now = Date.now()
    const record = this.store[identifier]

    if (!record || record.resetTime < now) {
      // Reset window
      this.store[identifier] = {
        count: 1,
        resetTime: now + this.windowMs
      }
      return false
    }

    record.count++
    return record.count > this.maxRequests
  }

  getRemaining(identifier: string): number {
    const record = this.store[identifier]
    if (!record || record.resetTime < Date.now()) {
      return this.maxRequests
    }
    return Math.max(0, this.maxRequests - record.count)
  }

  getReset(identifier: string): number {
    const record = this.store[identifier]
    return record?.resetTime || Date.now() + this.windowMs
  }
}

// Global limiter instances
const globalLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 1000) // 1000 req per 15min
const authLimiter = new InMemoryRateLimiter(15 * 60 * 1000, 10) // 10 req per 15min (auth)
const apiLimiter = new InMemoryRateLimiter(1 * 60 * 1000, 100) // 100 req per minute (API)

export const getClientIdentifier = (req: Request): string => {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown'
}

/**
 * Global rate limiter middleware
 */
export const globalRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const identifier = getClientIdentifier(req)

  if (globalLimiter.isLimited(identifier)) {
    logger.warn({ identifier, path: req.path, method: req.method }, 'Rate limit exceeded (global)')
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later'
      },
      retryAfter: Math.ceil((globalLimiter.getReset(identifier) - Date.now()) / 1000)
    })
    return
  }

  res.set('X-RateLimit-Remaining', globalLimiter.getRemaining(identifier).toString())
  res.set('X-RateLimit-Reset', globalLimiter.getReset(identifier).toString())
  next()
}

/**
 * Authentication endpoints rate limiter
 */
export const authRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const identifier = getClientIdentifier(req)

  if (authLimiter.isLimited(identifier)) {
    logger.warn({ identifier, path: req.path, method: req.method }, 'Rate limit exceeded (auth)')
    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later'
      },
      retryAfter: Math.ceil((authLimiter.getReset(identifier) - Date.now()) / 1000)
    })
    return
  }

  res.set('X-RateLimit-Remaining', authLimiter.getRemaining(identifier).toString())
  res.set('X-RateLimit-Reset', authLimiter.getReset(identifier).toString())
  next()
}

/**
 * API endpoints rate limiter
 */
export const apiRateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const identifier = getClientIdentifier(req)

  if (apiLimiter.isLimited(identifier)) {
    logger.warn({ identifier, path: req.path, method: req.method }, 'Rate limit exceeded (api)')
    res.status(429).json({
      success: false,
      error: {
        code: 'API_RATE_LIMIT_EXCEEDED',
        message: 'API rate limit exceeded, please try again later'
      },
      retryAfter: Math.ceil((apiLimiter.getReset(identifier) - Date.now()) / 1000)
    })
    return
  }

  res.set('X-RateLimit-Remaining', apiLimiter.getRemaining(identifier).toString())
  res.set('X-RateLimit-Reset', apiLimiter.getReset(identifier).toString())
  next()
}

export default {
  globalRateLimiter,
  authRateLimiter,
  apiRateLimiter
}
