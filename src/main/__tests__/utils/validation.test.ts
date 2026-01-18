import { authLoginSchema, authRegisterSchema } from '../../utils/validation'

describe('Validation Middleware', () => {
  describe('Schema Validation', () => {
    it('should validate login schema', () => {
      const validLogin = { username: 'testuser', password: 'password123' }
      const { error } = authLoginSchema.validate(validLogin)
      expect(error).toBeUndefined()
    })

    it('should reject invalid email in register schema', () => {
      const invalidRegister = {
        username: 'testuser',
        password: 'password123',
        email: 'invalid-email'
      }
      const { error } = authRegisterSchema.validate(invalidRegister)
      expect(error).toBeDefined()
    })

    it('should reject weak password', () => {
      const weakPassword = {
        username: 'testuser',
        password: 'weak'
      }
      const { error } = authRegisterSchema.validate(weakPassword)
      expect(error).toBeDefined()
    })

    it('should accept valid registration data', () => {
      const validRegister = {
        username: 'newuser',
        password: 'securepassword123',
        email: 'user@example.com'
      }
      const { error, value } = authRegisterSchema.validate(validRegister)
      expect(error).toBeUndefined()
      expect(value).toEqual(validRegister)
    })
  })

  describe('Input Sanitization', () => {
    it('should strip unknown fields', () => {
      const input = {
        username: 'testuser',
        password: 'password123',
        unknownField: 'should be removed',
        anotherBadField: 123
      }
      const { error, value } = authLoginSchema.validate(input, { stripUnknown: true })
      expect(error).toBeUndefined()
      expect(value).not.toHaveProperty('unknownField')
      expect(value).not.toHaveProperty('anotherBadField')
    })
  })
})
