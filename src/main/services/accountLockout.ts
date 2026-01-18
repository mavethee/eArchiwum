import { query } from '../database/db'
import { getLogger } from '../utils/logger'

const logger = getLogger('AccountLockout')

interface LockoutInfo {
  isLocked: boolean
  failedAttempts: number
  lockedUntil: Date | null
  lockoutReason: string | null
  unlocksAt: Date | null
}

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export class AccountLockoutService {
  /**
   * Record failed login attempt
   */
  static async recordFailedAttempt(username: string): Promise<void> {
    try {
      // Get user
      const userResult = await query<{ id: string }>('SELECT id FROM users WHERE username = $1', [
        username
      ])

      if (userResult.rows.length === 0) {
        return // User doesn't exist
      }

      const userId = userResult.rows[0].id

      // Get current lockout state
      const current = await query<{
        failed_login_attempts: number
        locked_until: string | null
      }>('SELECT failed_login_attempts, locked_until FROM users WHERE id = $1', [userId])

      if (current.rows.length === 0) return

      const record = current.rows[0]
      const now = Date.now()
      const currentAttempts = record.failed_login_attempts

      // Check if we should reset counter (24 hours passed)
      if (record.locked_until) {
        const lockedUntilTime = new Date(record.locked_until).getTime()
        if (now > lockedUntilTime) {
          // Lockout period expired, reset
          await query(
            `UPDATE users 
             SET failed_login_attempts = 1, 
                 locked_until = NULL,
                 lockout_reason = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [userId]
          )
          return
        }
      }

      const newAttempts = currentAttempts + 1
      let lockedUntil: string | null = null
      let lockoutReason: string | null = null

      // Lock account if threshold exceeded
      if (newAttempts >= LOCKOUT_THRESHOLD) {
        lockedUntil = new Date(now + LOCKOUT_DURATION_MS).toISOString()
        lockoutReason = 'Brute-force protection: too many failed login attempts'
        logger.warn(
          { userId, username, attempts: newAttempts },
          'Account locked due to failed login attempts'
        )
      }

      await query(
        `UPDATE users 
         SET failed_login_attempts = $1, 
             locked_until = $2,
             lockout_reason = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newAttempts, lockedUntil, lockoutReason, userId]
      )
    } catch (error) {
      logger.error({ error, username }, 'Failed to record login attempt')
      // Don't throw - continue with login attempt
    }
  }

  /**
   * Check if account is locked
   */
  static async isAccountLocked(username: string): Promise<boolean> {
    try {
      const userResult = await query<{
        id: string
        locked_until: string | null
      }>('SELECT id, locked_until FROM users WHERE username = $1', [username])

      if (userResult.rows.length === 0) {
        return false
      }

      const record = userResult.rows[0]

      if (!record.locked_until) {
        return false
      }

      const now = new Date()
      const lockedUntil = new Date(record.locked_until)

      if (now < lockedUntil) {
        logger.warn({ username }, 'Login attempt on locked account')
        return true
      }

      // Unlock account - lockout period expired
      await query(
        `UPDATE users 
         SET locked_until = NULL, 
             failed_login_attempts = 0,
             lockout_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE username = $1`,
        [username]
      )

      return false
    } catch (error) {
      logger.error({ error, username }, 'Failed to check account lockout')
      return false
    }
  }

  /**
   * Get lockout information
   */
  static async getLockoutInfo(username: string): Promise<LockoutInfo | null> {
    try {
      const result = await query<{
        failed_login_attempts: number
        locked_until: string | null
        lockout_reason: string | null
      }>(
        'SELECT failed_login_attempts, locked_until, lockout_reason FROM users WHERE username = $1',
        [username]
      )

      if (result.rows.length === 0) {
        return null
      }

      const record = result.rows[0]
      const now = new Date()
      const lockedUntil = record.locked_until ? new Date(record.locked_until) : null
      const isLocked = lockedUntil ? now < lockedUntil : false

      // Auto-unlock if lockout period expired
      if (!isLocked && record.locked_until) {
        await query(
          `UPDATE users 
           SET locked_until = NULL, 
               failed_login_attempts = 0,
               lockout_reason = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE username = $1`,
          [username]
        )
      }

      return {
        isLocked: isLocked && !!record.locked_until,
        failedAttempts: record.failed_login_attempts,
        lockedUntil,
        lockoutReason: record.lockout_reason,
        unlocksAt: lockedUntil && isLocked ? lockedUntil : null
      }
    } catch (error) {
      logger.error({ error, username }, 'Failed to get lockout info')
      return null
    }
  }

  /**
   * Clear failed attempts after successful login
   */
  static async clearFailedAttempts(username: string): Promise<void> {
    try {
      const userResult = await query<{ id: string }>('SELECT id FROM users WHERE username = $1', [
        username
      ])

      if (userResult.rows.length === 0) {
        return
      }

      const userId = userResult.rows[0].id

      await query(
        `UPDATE users 
         SET failed_login_attempts = 0, 
             locked_until = NULL,
             lockout_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId]
      )

      logger.info({ userId, username }, 'Failed login attempts cleared')
    } catch (error) {
      logger.error({ error, username }, 'Failed to clear failed attempts')
    }
  }

  /**
   * Manually unlock account (admin action)
   */
  static async unlockAccount(userId: string, reason: string = 'Admin unlock'): Promise<void> {
    try {
      await query(
        `UPDATE users 
         SET locked_until = NULL, 
             failed_login_attempts = 0,
             lockout_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId]
      )

      logger.info({ userId, reason }, 'Account unlocked')
    } catch (error) {
      logger.error({ error, userId }, 'Failed to unlock account')
      throw error
    }
  }
}

export default AccountLockoutService
