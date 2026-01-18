import { AppError, ValidationError, AuthenticationError, NotFoundError } from '../../utils/errors'

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an app error with correct properties', () => {
      const error = new AppError('TEST_ERROR', 'Test message', 400)
      expect(error.code).toBe('TEST_ERROR')
      expect(error.message).toBe('Test message')
      expect(error.status).toBe(400)
    })

    it('should include details in error', () => {
      const details = { field: 'username', reason: 'already exists' }
      const error = new AppError('CONFLICT', 'User exists', 409, details)
      expect(error.details).toEqual(details)
    })
  })

  describe('ValidationError', () => {
    it('should create validation error with 400 status', () => {
      const error = new ValidationError('Invalid input')
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.status).toBe(400)
    })
  })

  describe('AuthenticationError', () => {
    it('should create authentication error with 401 status', () => {
      const error = new AuthenticationError('Invalid token')
      expect(error.code).toBe('AUTHENTICATION_ERROR')
      expect(error.status).toBe(401)
    })
  })

  describe('NotFoundError', () => {
    it('should create not found error with resource name', () => {
      const error = new NotFoundError('User')
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('User not found')
      expect(error.status).toBe(404)
    })
  })
})
