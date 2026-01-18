import crypto from 'crypto'
import fs from 'fs'

/**
 * HashService: Calculate and verify file hashes
 */
export class HashService {
  /**
   * Calculate SHA-256 hash of file buffer
   */
  static calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex')
  }

  /**
   * Calculate SHA-256 hash of file by path (streaming)
   */
  static async calculateFileHashFromPath(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (chunk) => {
        hash.update(chunk)
      })

      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })

      stream.on('error', reject)
    })
  }

  /**
   * Verify file integrity by comparing current hash with expected hash
   */
  static async verifyFileIntegrity(filePath: string, expectedHash: string): Promise<boolean> {
    try {
      const currentHash = await this.calculateFileHashFromPath(filePath)
      return currentHash === expectedHash
    } catch (error) {
      console.error('Error verifying file integrity:', error)
      return false
    }
  }

  /**
   * Calculate hash for a string (for email, etc.)
   */
  static calculateStringHash(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex')
  }
}

export default HashService
