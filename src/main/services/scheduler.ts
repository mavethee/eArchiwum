import FixityService from './fixity'
import AuditService from './audit'
import BackupService from './backup'
import MonitoringService from './monitoring'

/**
 * SchedulerService: Background jobs for maintenance tasks
 */
export class SchedulerService {
  private static intervals: Map<string, NodeJS.Timeout> = new Map()

  /**
   * Start all scheduled jobs
   */
  static startAllJobs(): void {
    console.log('[Scheduler] Starting background jobs...')
    BackupService.initialize().catch((e) => console.error('[Backup] Init error:', e))
    this.startFixityCheckJob()
    this.startBackupJobs()
    this.startMonitoringJob()
  }

  /**
   * Stop all scheduled jobs
   */
  static stopAllJobs(): void {
    console.log('[Scheduler] Stopping background jobs...')
    for (const [name, interval] of this.intervals) {
      clearInterval(interval)
      console.log(`[Scheduler] Stopped: ${name}`)
    }
    this.intervals.clear()
  }

  /**
   * Fixity check job - runs daily at midnight
   */
  private static startFixityCheckJob(): void {
    // Calculate milliseconds until next midnight
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const msUntilMidnight = tomorrow.getTime() - now.getTime()

    // Run first check at midnight, then daily
    const timeout = setTimeout(() => {
      this.runFixityCheck()
      const interval = setInterval(() => this.runFixityCheck(), 24 * 60 * 60 * 1000) // Daily
      interval.unref() // Allow process to exit
      this.intervals.set('fixity-check', interval)
    }, msUntilMidnight)

    timeout.unref() // Allow process to exit
    this.intervals.set('fixity-check-initial', timeout as unknown as NodeJS.Timeout)

    const nextRun = new Date(tomorrow).toISOString()
    console.log(`[Scheduler] Fixity check scheduled for: ${nextRun}`)
  }

  /**
   * Execute fixity check
   */
  private static async runFixityCheck(): Promise<void> {
    try {
      console.log('[Fixity Check] Starting batch verification...')
      const startTime = Date.now()

      const report = await FixityService.verifyAllFiles(500)

      const duration = Date.now() - startTime

      console.log(
        `[Fixity Check] Complete - Total: ${report.total}, Valid: ${report.verified}, Failed: ${report.failed} (${duration}ms)`
      )

      // Log summary to audit
      await AuditService.logAction(null, 'VALIDATE', 'file', 'batch-check', {
        errorMessage: `Fixity check: ${report.verified}/${report.total} valid, ${report.failed} failed in ${duration}ms`
      })

      // Alert if there are failures
      if (report.failed > 0) {
        console.warn(`[Fixity Check] WARNING: ${report.failed} file(s) failed integrity check!`)
      }
    } catch (error) {
      const err = error as Error
      console.error('[Fixity Check] Error:', err.message)
      await AuditService.logAction(null, 'VALIDATE', 'file', 'batch-check', {
        errorMessage: `Fixity check failed: ${err.message}`
      }).catch((e) => {
        console.error('[Audit Log] Failed to log fixity error:', e)
      })
    }
  }

  /**
   * Backup jobs - daily at 2 AM
   */
  private static startBackupJobs(): void {
    const now = new Date()
    const backupTime = new Date(now)
    backupTime.setHours(2, 0, 0, 0)

    // If it's past 2 AM, schedule for tomorrow
    if (now > backupTime) {
      backupTime.setDate(backupTime.getDate() + 1)
    }

    const msUntilBackupTime = backupTime.getTime() - now.getTime()

    // Schedule first backup
    const timeout = setTimeout(() => {
      this.runBackup()
      const interval = setInterval(() => this.runBackup(), 24 * 60 * 60 * 1000) // Daily
      interval.unref() // Allow process to exit
      this.intervals.set('backup', interval)
    }, msUntilBackupTime)

    timeout.unref() // Allow process to exit
    this.intervals.set('backup-initial', timeout as unknown as NodeJS.Timeout)
    console.log(`[Scheduler] Database backup scheduled for: ${backupTime.toISOString()}`)
  }

  /**
   * Execute backup
   */
  private static async runBackup(): Promise<void> {
    try {
      console.log('[Backup Job] Starting database and file backups...')
      const startTime = Date.now()

      const dbBackup = await BackupService.backupDatabase()
      const filesBackup = await BackupService.backupFiles()
      const cleanup = await BackupService.cleanOldBackups(7) // Keep last 7

      const duration = Date.now() - startTime

      console.log(
        `[Backup Job] Complete - DB: ${dbBackup?.filename}, Files: ${filesBackup?.filename}, Cleaned: ${cleanup.deleted} backups (${duration}ms)`
      )

      await AuditService.logAction(null, 'CREATE', 'version', 'backup_job', {
        errorMessage: `Backup complete: DB ${dbBackup?.size || 0} bytes, Files ${filesBackup?.size || 0} bytes, Cleaned ${cleanup.deleted} old backups`
      })
    } catch (error) {
      const err = error as Error
      console.error('[Backup Job] Error:', err.message)
      await AuditService.logAction(null, 'CREATE', 'version', 'backup_job', {
        errorMessage: `Backup failed: ${err.message}`
      }).catch((e) => {
        console.error('[Audit Log] Failed to log backup error:', e)
      })
    }
  }

  /**
   * Monitoring job - every 5 minutes
   */
  private static startMonitoringJob(): void {
    // Start immediately
    this.runMonitoring()

    // Then every 5 minutes
    const interval = setInterval(() => this.runMonitoring(), 5 * 60 * 1000)
    interval.unref() // Allow process to exit
    this.intervals.set('monitoring', interval)

    console.log('[Scheduler] Monitoring check scheduled: every 5 minutes')
  }

  /**
   * Execute monitoring check
   */
  private static async runMonitoring(): Promise<void> {
    try {
      await MonitoringService.performHealthChecks()
    } catch (error) {
      console.error('[Monitoring] Error during health check:', error)
    }
  }
}
export default SchedulerService
