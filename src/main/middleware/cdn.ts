import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { getLogger } from '../utils/logger'

const logger = getLogger('CDNMiddleware')

/**
 * CDN Support Middleware
 * Adds caching headers and ETag support for efficient CDN delivery
 */

/**
 * Set cache control headers for media files
 */
export const cacheControlMiddleware = (maxAge: number = 86400 * 30) => {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Cache media files for 30 days
    res.set('Cache-Control', `public, max-age=${maxAge}, immutable`)
    res.set('X-Content-Type-Options', 'nosniff')
    next()
  }
}

/**
 * Generate ETag for response body
 */
export const etagMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res)

  res.json = function (data: Record<string, unknown>) {
    // Generate ETag from response data
    const etag = generateETag(JSON.stringify(data))
    res.set('ETag', etag)

    // Check If-None-Match header
    if (_req.headers['if-none-match'] === etag) {
      res.status(304).end() // Not Modified
      return res
    }

    return originalJson.call(this, data)
  }

  next()
}

/**
 * Generate ETag from content
 */
export const generateETag = (content: string): string => {
  const hash = crypto.createHash('sha256').update(content).digest('hex')
  return `"${hash.substring(0, 16)}"` // Use first 16 chars of hash
}

/**
 * CORS headers for CDN preflight requests
 */
export const cdnCorsMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  // Allow CDN providers to preflight requests
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Range, If-None-Match')
  res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, ETag')
  res.set('Access-Control-Max-Age', '86400')

  // Handle preflight
  if (_req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  next()
}

/**
 * Add compression headers for optimal CDN delivery
 */
export const compressionHeadersMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Indicate that content can be compressed
  res.set('Content-Encoding', 'gzip')
  res.set('Vary', 'Accept-Encoding')
  next()
}

/**
 * Add security headers for CDN
 */
export const securityHeadersMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Prevent MIME type sniffing
  res.set('X-Content-Type-Options', 'nosniff')

  // Enable browser XSS protection
  res.set('X-XSS-Protection', '1; mode=block')

  // Prevent clickjacking
  res.set('X-Frame-Options', 'DENY')

  next()
}

/**
 * Generate media URL suitable for CDN
 * If CDN_URL is set in env, replaces base URL
 */
export const generateCDNUrl = (
  fileId: string,
  baseUrl: string = 'http://localhost:3000'
): string => {
  const cdnUrl = process.env.CDN_URL || baseUrl
  return `${cdnUrl}/api/files/${fileId}/download`
}

/**
 * Get CDN configuration
 */
export const getCDNConfig = (): {
  enabled: boolean
  url: string
  cacheTTL: number
  cacheHeaders: Record<string, string>
} => {
  return {
    enabled: !!process.env.CDN_URL,
    url: process.env.CDN_URL || '',
    cacheTTL: parseInt(process.env.CDN_CACHE_TTL || '2592000'), // 30 days default
    cacheHeaders: {
      'Cache-Control': `public, max-age=${parseInt(process.env.CDN_CACHE_TTL || '2592000')}, immutable`,
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept-Encoding'
    }
  }
}

logger.info({ cdnConfig: getCDNConfig() }, 'CDN configuration loaded')
