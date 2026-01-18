import { query } from '../database/db'
import HashService from './hash'
import AuditService from './audit'
import fs from 'fs/promises'

/**
 * FixityService: Monitor file integrity over time
 */
export class FixityService {
  /**
   * Verify integrity of a single file
   */
  static async verifyFile(
    fileId: string
  ): Promise<{ fileId: string; isValid: boolean; error?: string }> {
    try {
      // Get file record
      const result = await query('SELECT id, file_path, file_hash FROM files WHERE id = $1', [
        fileId
      ])

      if (result.rows.length === 0) {
        return { fileId, isValid: false, error: 'File not found' }
      }

      const file = result.rows[0] as { id: string; file_path: string; file_hash: string }
      const { file_path, file_hash } = file

      // Check if file exists
      try {
        await fs.stat(file_path)
      } catch {
        return { fileId, isValid: false, error: 'File does not exist on disk' }
      }

      // Calculate current hash
      const currentHash = await HashService.calculateFileHashFromPath(file_path)
      const isValid = currentHash === file_hash

      // Log to audit if mismatch
      if (!isValid) {
        await AuditService.logAction(null, 'VALIDATE', 'file', fileId, {
          errorMessage: `Fixity check failed - stored: ${file_hash}, current: ${currentHash}`
        })
      }

      return { fileId, isValid }
    } catch (error) {
      const err = error as Error
      return { fileId, isValid: false, error: err.message }
    }
  }

  /**
   * Batch verify all files (or files matching criteria)
   */
  static async verifyAllFiles(limit?: number): Promise<{
    total: number
    verified: number
    failed: number
    errors: Array<{ fileId: string; error?: string }>
  }> {
    try {
      // Get all accessible files
      const result = await query(
        `SELECT id FROM files 
         WHERE is_accessible = true 
         ORDER BY updated_at DESC 
         LIMIT $1`,
        [limit || 100]
      )

      const files = result.rows as Array<{ id: string }>
      const errors: Array<{ fileId: string; error?: string }> = []
      let verified = 0
      let failed = 0

      // Verify each file
      for (const file of files) {
        const verification = await this.verifyFile(file.id)
        if (verification.isValid) {
          verified++
        } else {
          failed++
          errors.push({ fileId: file.id, error: verification.error })
        }
      }

      return {
        total: files.length,
        verified,
        failed,
        errors
      }
    } catch (error) {
      const err = error as Error
      console.error('Error during batch fixity check:', err)
      throw err
    }
  }

  /**
   * Get fixity report for a file
   */
  static async getFixityReport(fileId: string): Promise<{
    fileId: string
    lastChecked?: string
    status: 'valid' | 'invalid' | 'unknown'
    checks: Array<{
      timestamp: string
      isValid: boolean
      storedHash: string
      currentHash?: string
    }>
  }> {
    try {
      // Get file
      const fileResult = await query('SELECT id, file_hash, updated_at FROM files WHERE id = $1', [
        fileId
      ])

      if (fileResult.rows.length === 0) {
        return {
          fileId,
          status: 'unknown',
          checks: []
        }
      }

      // Get fixity check audit logs
      const auditResult = await query(
        `SELECT created_at, details FROM audit_log 
         WHERE resource_id = $1 
         AND action = 'VALIDATE'
         ORDER BY created_at DESC 
         LIMIT 20`,
        [fileId]
      )

      const checks = auditResult.rows.map((row) => {
        const details = row.details as Record<string, string>
        return {
          timestamp: row.created_at as string,
          isValid: !(details?.severity === 'critical'),
          storedHash: details?.storedHash || '',
          currentHash: details?.currentHash
        }
      })

      const lastCheck = checks[0]
      const status = lastCheck?.isValid === false ? 'invalid' : lastCheck ? 'valid' : 'unknown'

      return {
        fileId,
        lastChecked: lastCheck?.timestamp,
        status,
        checks
      }
    } catch (error) {
      const err = error as Error
      console.error('Error getting fixity report:', err)
      throw err
    }
  }
}

export default FixityService
