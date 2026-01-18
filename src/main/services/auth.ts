import jwt from 'jsonwebtoken'
import bcryptjs from 'bcryptjs'
import { query, withTransaction } from '../database/db'
import { User, UserRole, JWTPayload } from '../types'
import AccountLockoutService from './accountLockout'
import EncryptionService from './encryption'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is not set in production!')
}
const ACTUAL_JWT_SECRET = JWT_SECRET || 'dev-secret-change-in-production'
// const JWT_EXPIRES_IN = '24h' // Not used - check expiration in token
const REFRESH_TOKEN_EXPIRES_IN = '7d'

let emailColumnsChecked = false
let supportsEmailEncryption = false
let supportsEmailHash = false

type UserWithEncrypted = User & { email_encrypted?: string | null }

const checkEmailColumns = async (): Promise<void> => {
  if (emailColumnsChecked) return
  const result = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
  )
  const columns = result.rows.map((r) => r.column_name)
  supportsEmailEncryption = columns.includes('email_encrypted')
  supportsEmailHash = columns.includes('email_hash')
  emailColumnsChecked = true
}

const encryptEmail = (
  email?: string
): { encryptedEmail: string | null; emailHash: string | null } => {
  if (!email) return { encryptedEmail: null, emailHash: null }
  return {
    encryptedEmail: EncryptionService.encrypt(email),
    emailHash: EncryptionService.hash(email)
  }
}

const decryptEmail = (encryptedEmail?: string | null): string | undefined => {
  if (!encryptedEmail) return undefined
  try {
    return EncryptionService.decrypt(encryptedEmail)
  } catch {
    return undefined
  }
}

export class AuthService {
  /**
   * Register new user
   */
  static async register(
    username: string,
    password: string,
    email?: string,
    role: UserRole = UserRole.READER
  ): Promise<{ user: User; token: string; refreshToken: string }> {
    await checkEmailColumns()
    const passwordHash = await bcryptjs.hash(password, 10)
    const { encryptedEmail, emailHash } = encryptEmail(email)

    const result = await withTransaction(async (client) => {
      // Check if user exists
      const existing = supportsEmailHash
        ? await client.query('SELECT id FROM users WHERE username = $1 OR email_hash = $2', [
            username,
            emailHash
          ])
        : await client.query('SELECT id FROM users WHERE username = $1 OR email = $2', [
            username,
            email
          ])

      if (existing.rows.length > 0) {
        throw new Error('User already exists')
      }

      // Create user
      const userResult = supportsEmailEncryption
        ? await client.query<User>(
            `INSERT INTO users (username, email_encrypted, email_hash, password_hash, role, is_active)
             VALUES ($1, $2, $3, $4, $5, TRUE)
             RETURNING id, username, email_encrypted, role, created_at, is_active`,
            [username, encryptedEmail, emailHash, passwordHash, role]
          )
        : await client.query<User>(
            `INSERT INTO users (username, email, password_hash, role, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING id, username, email, role, created_at, is_active`,
            [username, email || null, passwordHash, role]
          )

      const user = userResult.rows[0]

      // Log audit
      await client.query(
        `INSERT INTO audit_log (action, resource_type, resource_id, new_value, success)
         VALUES ($1, $2, $3, $4, TRUE)`,
        ['CREATE', 'user', user.id, JSON.stringify(user)]
      )

      return user
    })

    const normalizedUser: User = {
      ...result,
      email: supportsEmailEncryption
        ? decryptEmail((result as UserWithEncrypted).email_encrypted)
        : result.email
    }

    const token = this.generateToken(normalizedUser)
    const refreshToken = this.generateRefreshToken(normalizedUser)
    return { user: normalizedUser, token, refreshToken }
  }

  /**
   * Login user
   */
  static async login(
    username: string,
    password: string
  ): Promise<{ user: User; token: string; refreshToken: string }> {
    await checkEmailColumns()
    // Check if account is locked
    const lockoutInfo = await AccountLockoutService.getLockoutInfo(username)
    if (lockoutInfo?.isLocked) {
      const unlocksAt = lockoutInfo.unlocksAt?.toISOString() || 'unknown'
      throw new Error(
        `Account is locked due to too many failed login attempts. Retry after ${unlocksAt}`
      )
    }

    const result = await query<Record<string, unknown>>(
      supportsEmailEncryption
        ? `SELECT id, username, email_encrypted, email_hash, password_hash, role, is_active, created_at FROM users WHERE username = $1`
        : `SELECT id, username, email, password_hash, role, is_active, created_at FROM users WHERE username = $1`,
      [username]
    )

    if (result.rows.length === 0) {
      // Record failed attempt
      await AccountLockoutService.recordFailedAttempt(username)
      throw new Error('User not found')
    }

    const userData = result.rows[0]
    const user = userData as User & Record<string, unknown>

    const email = supportsEmailEncryption
      ? decryptEmail((userData as Record<string, unknown>).email_encrypted as string)
      : (userData as Record<string, unknown>).email
    const normalizedUser: User = { ...user, email: email as string | undefined }

    if (!(userData as Record<string, unknown>).is_active) {
      // Record failed attempt
      await AccountLockoutService.recordFailedAttempt(username)
      throw new Error('User account is disabled')
    }

    const passwordMatch = await bcryptjs.compare(
      password,
      (userData as Record<string, unknown>).password_hash as string
    )
    if (!passwordMatch) {
      // Record failed attempt
      await AccountLockoutService.recordFailedAttempt(username)
      throw new Error('Invalid password')
    }

    // Clear failed attempts on successful login
    await AccountLockoutService.clearFailedAttempts(username)

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])

    // Log login
    await query(
      `INSERT INTO audit_log (user_id, action, resource_type, success)
       VALUES ($1, $2, $3, TRUE)`,
      [user.id, 'LOGIN', 'user']
    )

    const token = this.generateToken(normalizedUser)
    const refreshToken = this.generateRefreshToken(normalizedUser)

    return { user: normalizedUser, token, refreshToken }
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, ACTUAL_JWT_SECRET) as unknown as JWTPayload
      return decoded
    } catch {
      throw new Error('Invalid or expired token')
    }
  }

  /**
   * Generate new access token from refresh token
   */
  static refreshAccessToken(refreshToken: string): string {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET + '_refresh') as JWTPayload
      return this.generateTokenRaw(decoded.userId, decoded.username, decoded.role)
    } catch {
      throw new Error('Invalid refresh token')
    }
  }

  /**
   * Change password
   */
  static async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const result = await query<Record<string, unknown>>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    )

    if (result.rows.length === 0) {
      throw new Error('User not found')
    }

    const passwordMatch = await bcryptjs.compare(
      oldPassword,
      result.rows[0].password_hash as string
    )
    if (!passwordMatch) {
      throw new Error('Current password is incorrect')
    }

    const newPasswordHash = await bcryptjs.hash(newPassword, 10)

    await withTransaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        newPasswordHash,
        userId
      ])

      await client.query(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, success)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [userId, 'UPDATE', 'user', userId]
      )
    })
  }

  /**
   * Reset password (admin function)
   */
  static async resetPassword(
    userId: string,
    requestedBy: string,
    newPassword: string
  ): Promise<void> {
    const newPasswordHash = await bcryptjs.hash(newPassword, 10)

    await withTransaction(async (client) => {
      // Verify admin permission
      const admin = await client.query<User>('SELECT role FROM users WHERE id = $1', [requestedBy])

      if (admin.rows.length === 0 || admin.rows[0].role !== UserRole.ADMIN) {
        throw new Error('Only admins can reset passwords')
      }

      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        newPasswordHash,
        userId
      ])

      await client.query(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, success, reason)
         VALUES ($1, $2, $3, $4, TRUE, $5)`,
        [requestedBy, 'UPDATE', 'user', userId, 'Password reset by admin']
      )
    })
  }

  /**
   * Update user role
   */
  static async updateUserRole(userId: string, newRole: UserRole, updatedBy: string): Promise<User> {
    await checkEmailColumns()

    const result = await withTransaction(async (client) => {
      // Verify admin permission
      const admin = await client.query<User>('SELECT role FROM users WHERE id = $1', [updatedBy])

      if (admin.rows.length === 0 || admin.rows[0].role !== UserRole.ADMIN) {
        throw new Error('Only admins can update roles')
      }

      const queryText = supportsEmailEncryption
        ? 'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email_encrypted, role, created_at, is_active'
        : 'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role, created_at, is_active'

      const userResult = await client.query<User>(queryText, [newRole, userId])

      if (userResult.rows.length === 0) {
        throw new Error('User not found')
      }

      const user = userResult.rows[0]

      await client.query(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, previous_value, new_value)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          updatedBy,
          'UPDATE',
          'user',
          userId,
          JSON.stringify({ role: admin.rows[0].role }),
          JSON.stringify({ role: newRole })
        ]
      )

      return user
    })

    const normalizedUser: User = {
      ...result,
      email: supportsEmailEncryption
        ? decryptEmail((result as UserWithEncrypted).email_encrypted)
        : result.email
    }

    return normalizedUser
  }

  /**
   * List all users (admin only)
   */
  static async listUsers(adminId: string): Promise<User[]> {
    const admin = await query<Record<string, unknown>>('SELECT role FROM users WHERE id = $1', [
      adminId
    ])

    if (admin.rows.length === 0 || (admin.rows[0].role as string) !== UserRole.ADMIN) {
      throw new Error('Only admins can list users')
    }

    const result = await query<Record<string, unknown>>(
      'SELECT id, username, email, role, created_at, last_login, is_active FROM users ORDER BY created_at DESC'
    )

    return result.rows as unknown as User[]
  }

  // ========== PRIVATE METHODS ==========

  private static generateToken(user: User): string {
    return this.generateTokenRaw(user.id, user.username, user.role)
  }

  private static generateTokenRaw(userId: string, username: string, role: UserRole): string {
    return jwt.sign(
      {
        userId,
        username,
        role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
      },
      ACTUAL_JWT_SECRET
    )
  }

  private static generateRefreshToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        type: 'refresh'
      },
      ACTUAL_JWT_SECRET + '_refresh',
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    )
  }
}

export default AuthService
