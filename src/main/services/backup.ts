import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import AuditService from './audit'

const execAsync = promisify(exec)

/**
 * BackupService: Database and file backups
 */
export class BackupService {
  private static backupDir = process.env.BACKUP_DIR || './backups'

  /**
   * Initialize backup directory
   */
  static async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true })
      console.log(`[Backup] Directory ready: ${this.backupDir}`)
    } catch (error) {
      console.error('[Backup] Failed to initialize backup directory:', error)
    }
  }

  /**
   * Create database backup
   */
  static async backupDatabase(): Promise<{
    filename: string
    size: number
    timestamp: string
  } | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `db_backup_${timestamp}.sql`
      const filepath = path.join(this.backupDir, filename)

      const dbHost = process.env.DB_HOST || 'localhost'
      const dbPort = process.env.DB_PORT || '5432'
      const dbName = process.env.DB_NAME || 'archive'
      const dbUser = process.env.DB_USER || 'archiveuser'

      // Use pg_dump to create backup
      const command = `PGPASSWORD="${process.env.DB_PASSWORD}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} > "${filepath}"`

      await execAsync(command)

      const stats = await fs.stat(filepath)

      console.log(`[Backup] Database backup created: ${filename} (${stats.size} bytes)`)

      await AuditService.logAction(null, 'CREATE', 'version', 'db_backup', {
        newValue: {
          filename,
          size: stats.size,
          timestamp
        }
      })

      return {
        filename,
        size: stats.size,
        timestamp
      }
    } catch (error) {
      const err = error as Error
      console.error('[Backup] Database backup failed:', err.message)
      await AuditService.logAction(null, 'CREATE', 'version', 'db_backup', {
        errorMessage: `Backup failed: ${err.message}`
      }).catch((e) => {
        console.error('[Audit] Failed to log backup error:', e)
      })
      return null
    }
  }

  /**
   * Create file archive backup
   */
  static async backupFiles(): Promise<{
    filename: string
    size: number
    timestamp: string
  } | null> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `files_backup_${timestamp}.tar.gz`
      const filepath = path.join(this.backupDir, filename)
      const storagePath = process.env.STORAGE_PATH || './storage'

      // Create tar.gz archive
      const command = `tar -czf "${filepath}" -C "${path.dirname(storagePath)}" "${path.basename(storagePath)}"`

      await execAsync(command)

      const stats = await fs.stat(filepath)

      console.log(`[Backup] Files backup created: ${filename} (${stats.size} bytes)`)

      await AuditService.logAction(null, 'CREATE', 'version', 'files_backup', {
        newValue: {
          filename,
          size: stats.size,
          timestamp
        }
      })

      return {
        filename,
        size: stats.size,
        timestamp
      }
    } catch (error) {
      const err = error as Error
      console.error('[Backup] Files backup failed:', err.message)
      await AuditService.logAction(null, 'CREATE', 'version', 'files_backup', {
        errorMessage: `Backup failed: ${err.message}`
      }).catch((e) => {
        console.error('[Audit] Failed to log backup error:', e)
      })
      return null
    }
  }

  /**
   * Clean old backups (keep last N)
   */
  static async cleanOldBackups(
    keepCount: number = 7
  ): Promise<{ deleted: number; freedSpace: number }> {
    try {
      const files = await fs.readdir(this.backupDir)
      const backups = files.filter(
        (f) => f.startsWith('db_backup_') || f.startsWith('files_backup_')
      )

      if (backups.length <= keepCount) {
        return { deleted: 0, freedSpace: 0 }
      }

      // Sort by modification time, oldest first
      const backupStats = await Promise.all(
        backups.map(async (f) => {
          const filepath = path.join(this.backupDir, f)
          const stat = await fs.stat(filepath)
          return { filename: f, size: stat.size, mtime: stat.mtimeMs }
        })
      )

      backupStats.sort((a, b) => a.mtime - b.mtime)

      let deletedCount = 0
      let freedSpace = 0
      const toDelete = backupStats.slice(0, backupStats.length - keepCount)

      for (const backup of toDelete) {
        try {
          const filepath = path.join(this.backupDir, backup.filename)
          await fs.rm(filepath)
          deletedCount++
          freedSpace += backup.size
          console.log(`[Backup] Deleted old backup: ${backup.filename}`)
        } catch (error) {
          console.error(`[Backup] Failed to delete ${backup.filename}:`, error)
        }
      }

      return { deleted: deletedCount, freedSpace }
    } catch (error) {
      console.error('[Backup] Failed to clean old backups:', error)
      return { deleted: 0, freedSpace: 0 }
    }
  }

  /**
   * Get backup list
   */
  static async listBackups(): Promise<
    Array<{
      filename: string
      size: number
      created: Date
      type: 'database' | 'files'
    }>
  > {
    try {
      const files = await fs.readdir(this.backupDir)
      const backups = await Promise.all(
        files.map(async (filename) => {
          const filepath = path.join(this.backupDir, filename)
          const stat = await fs.stat(filepath)
          const type = (filename.startsWith('db_backup_') ? 'database' : 'files') as
            | 'database'
            | 'files'
          return {
            filename,
            size: stat.size,
            created: stat.birthtime,
            type
          }
        })
      )

      return backups.sort((a, b) => b.created.getTime() - a.created.getTime())
    } catch (error) {
      console.error('[Backup] Failed to list backups:', error)
      return []
    }
  }
}

export default BackupService
