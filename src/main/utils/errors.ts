/**
 * Custom error types for the application
 */

export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number = 500,
    public details?: unknown
  ) {
    super(message)
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details)
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super('AUTHENTICATION_ERROR', message, 401)
    Object.setPrototypeOf(this, AuthenticationError.prototype)
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super('AUTHORIZATION_ERROR', message, 403)
    Object.setPrototypeOf(this, AuthorizationError.prototype)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404)
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409)
    Object.setPrototypeOf(this, ConflictError.prototype)
  }
}

export class AccountLockedError extends AppError {
  constructor(public unlocksAt: Date) {
    super('ACCOUNT_LOCKED', 'Account is locked due to multiple failed login attempts', 429, {
      unlocksAt
    })
    Object.setPrototypeOf(this, AccountLockedError.prototype)
  }
}

export class RateLimitError extends AppError {
  constructor(public retryAfter: number) {
    super('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later', 429, {
      retryAfter
    })
    Object.setPrototypeOf(this, RateLimitError.prototype)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', details?: unknown) {
    super('DATABASE_ERROR', message, 500, details)
    Object.setPrototypeOf(this, DatabaseError.prototype)
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super('INTERNAL_SERVER_ERROR', message, 500, details)
    Object.setPrototypeOf(this, InternalServerError.prototype)
  }
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  AccountLockedError,
  RateLimitError,
  DatabaseError,
  InternalServerError
}
