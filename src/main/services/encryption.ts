import crypto from 'crypto'
import { getLogger } from '../utils/logger'

const logger = getLogger('EncryptionService')

/**
 * Encryption Service
 * Provides AES-256-GCM encryption for sensitive data at rest
 * Supports both symmetric encryption for passwords/tokens and field-level encryption for PII
 */
class EncryptionService {
  private static encryptionKey: Buffer | null = null
  private static algorithm = 'aes-256-gcm'

  /**
   * Initialize encryption key from environment or generate one
   */
  static initialize(): void {
    const keyHex = process.env.ENCRYPTION_KEY

    if (!keyHex || keyHex === 'your-32-byte-hex-key-change-in-production') {
      const errorMessage = `
        FATAL: ENCRYPTION_KEY is not set or is using the default placeholder.
        Please generate a new 32-byte (64-character hex) key and set it in your .env file.
        You can generate a new key by running this command in your terminal:
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
      `
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    try {
      this.encryptionKey = Buffer.from(keyHex, 'hex')
      if (this.encryptionKey.length !== 32) {
        const errorMessage = `FATAL: Invalid ENCRYPTION_KEY length. Key must be 32 bytes (64 hex characters), but got ${this.encryptionKey.length} bytes.`
        logger.error(errorMessage)
        throw new Error(errorMessage)
      }
      logger.info('Encryption key initialized from environment')
    } catch (error) {
      const err = error as Error
      logger.error(
        { error: err.message },
        'Failed to initialize encryption key. Is it a valid hex string?'
      )
      throw err
    }
  }

  /**
   * Get encryption key (ensures it's initialized)
   */
  private static getKey(): Buffer {
    if (!this.encryptionKey) {
      this.initialize()
    }
    return this.encryptionKey!
  }

  /**
   * Encrypt data using AES-256-GCM
   * Returns: IV (16 bytes) + AUTH_TAG (16 bytes) + CIPHERTEXT (variable)
   */
  static encrypt(plaintext: string): string {
    try {
      const key = this.getKey()
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(this.algorithm, key, iv)
      cipher.setEncoding('hex')
      let encrypted = cipher.update(plaintext, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      const authTag = (cipher as unknown as { getAuthTag: () => Buffer }).getAuthTag()
      const combined = iv.toString('hex') + authTag.toString('hex') + encrypted

      return combined
    } catch (error) {
      logger.error({ error }, 'Encryption failed')
      throw new Error('Encryption failed')
    }
  }

  /**
   * Decrypt data encrypted with encrypt()
   */
  static decrypt(ciphertext: string): string {
    try {
      const key = this.getKey()

      // Extract components
      const iv = Buffer.from(ciphertext.substring(0, 32), 'hex') // 16 bytes = 32 hex chars
      const authTag = Buffer.from(ciphertext.substring(32, 64), 'hex') // 16 bytes = 32 hex chars
      const encrypted = ciphertext.substring(64)

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv)
      ;(decipher as unknown as { setAuthTag: (tag: Buffer) => void }).setAuthTag(authTag)

      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch (error) {
      logger.error({ error }, 'Decryption failed')
      throw new Error('Decryption failed - data may be corrupted or wrong key')
    }
  }

  /**
   * Encrypt object fields selectively
   */
  static encryptObject<T extends Record<string, unknown>>(obj: T, fieldsToEncrypt: (keyof T)[]): T {
    const encrypted = { ...obj } as Record<string, unknown>

    for (const field of fieldsToEncrypt) {
      const fieldKey = field as string
      if (
        fieldKey in encrypted &&
        encrypted[fieldKey] !== null &&
        encrypted[fieldKey] !== undefined
      ) {
        const value = encrypted[fieldKey]
        encrypted[fieldKey] =
          typeof value === 'string'
            ? this.encrypt(value)
            : (this.encrypt(JSON.stringify(value)) as string)
      }
    }

    return encrypted as T
  }

  /**
   * Decrypt object fields selectively
   */
  static decryptObject<T extends Record<string, unknown>>(obj: T, fieldsToDecrypt: (keyof T)[]): T {
    const decrypted = { ...obj } as Record<string, unknown>

    for (const field of fieldsToDecrypt) {
      const fieldKey = field as string
      if (
        fieldKey in decrypted &&
        decrypted[fieldKey] !== null &&
        decrypted[fieldKey] !== undefined
      ) {
        const value = decrypted[fieldKey]
        if (typeof value === 'string') {
          try {
            const decryptedValue = this.decrypt(value)
            // Try to parse as JSON, otherwise keep as string
            try {
              decrypted[fieldKey] = JSON.parse(decryptedValue)
            } catch {
              decrypted[fieldKey] = decryptedValue as string
            }
          } catch (error) {
            logger.warn({ field, error }, 'Failed to decrypt field')
            decrypted[fieldKey] = value // Keep original on error
          }
        }
      }
    }

    return decrypted as T
  }

  /**
   * Hash sensitive data (one-way, for storage verification)
   */
  static hash(data: string, algorithm = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex')
  }

  /**
   * Verify hash
   */
  static verifyHash(data: string, hash: string, algorithm = 'sha256'): boolean {
    return this.hash(data, algorithm) === hash
  }

  /**
   * Generate random key suitable for encryption (for key management)
   */
  static generateRandomKey(length = 32): string {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Get current encryption key (for backup/rotation purposes)
   */
  static getKeyHex(): string {
    const key = this.getKey()
    return key.toString('hex')
  }
}

export default EncryptionService
