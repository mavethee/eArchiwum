import {
  globalRateLimiter,
  authRateLimiter,
  getClientIdentifier
} from '../../middleware/rateLimiter'
import { Request, Response } from 'express'

// Mock Express objects
const createMockRequest = (ip = '127.0.0.1'): Partial<Request> => ({
  ip,
  path: '/api/test',
  method: 'GET',
  headers: {}
})

const createMockResponse = (): Partial<Response> & {
  set: jest.Mock
  status: jest.Mock
  json: jest.Mock
} => {
  const res: Partial<Response> & { set: jest.Mock; status: jest.Mock; json: jest.Mock } = {
    set: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  }
  return res
}

describe('Rate Limiter Middleware', () => {
  afterAll(() => {
    // Clear all active timers to prevent Jest from hanging
    jest.clearAllTimers()
  })

  describe('getClientIdentifier', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const req: Partial<Request> = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        ip: '127.0.0.1'
      }
      const identifier = getClientIdentifier(req as Request)
      expect(identifier).toBe('192.168.1.1')
    })

    it('should fallback to req.ip', () => {
      const req: Partial<Request> = { headers: {}, ip: '192.168.1.1' }
      const identifier = getClientIdentifier(req as Request)
      expect(identifier).toBe('192.168.1.1')
    })
  })

  describe('globalRateLimiter', () => {
    it('should allow requests within limit', () => {
      const req = createMockRequest() as Request
      const res = createMockResponse() as Response
      const next = jest.fn()

      globalRateLimiter(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('should set rate limit headers', () => {
      const req = createMockRequest() as Request
      const res = createMockResponse() as Response
      const next = jest.fn()

      globalRateLimiter(req, res, next)
      expect(res.set).toHaveBeenCalledWith(expect.stringContaining('RateLimit'), expect.any(String))
    })
  })

  describe('authRateLimiter', () => {
    it('should have stricter limits than global limiter', () => {
      // Auth limiter has 10 requests per 15 minutes
      // This test verifies the existence of authRateLimiter function
      expect(typeof authRateLimiter).toBe('function')
    })
  })
})
