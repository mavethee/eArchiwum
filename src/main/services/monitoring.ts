import os from 'os'
import fs from 'fs/promises'
import { query } from '../database/db'
import AuditService from './audit'
import nodemailer from 'nodemailer'

// Konfiguracja e-maila administratora (możesz przenieść do ENV)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@localhost'
const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''

const mailTransport =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465, // true for 465, false for other ports
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      })
    : null

/**
 * MonitoringService: System health and performance monitoring
 */
export class MonitoringService {
  /**
   * Get system resource usage
   */
  static async getSystemMetrics(): Promise<{
    cpu: number
    memory: { total: number; free: number; used: number; percent: number }
    uptime: number
    timestamp: string
  }> {
    const cpuUsage = process.cpuUsage()
    const osMem = os.totalmem()
    const osFreeMem = os.freemem()
    const usedMem = osMem - osFreeMem

    return {
      cpu: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memory: {
        total: osMem,
        free: osFreeMem,
        used: usedMem,
        percent: (usedMem / osMem) * 100
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Get storage metrics
   */
  static async getStorageMetrics(): Promise<{
    files: { total: number; size: number }
    database: { tables: number; connections: number }
    timestamp: string
  }> {
    try {
      // Get file count and total size
      const storagePath = process.env.STORAGE_PATH || './storage'
      const fileStats = { total: 0, size: 0 }

      try {
        const files = await fs.readdir(storagePath, { recursive: true })
        fileStats.total = files.length

        for (const file of files) {
          const path = `${storagePath}/${file}`
          try {
            const stat = await fs.stat(path)
            if (stat.isFile()) {
              fileStats.size += stat.size
            }
          } catch {
            // Skip files we can't stat
          }
        }
      } catch {
        // Storage directory doesn't exist or is not accessible
      }

      // Get database metrics
      const tableResult = await query(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = 'public'
      `)
      const tableCount = parseInt(
        (tableResult.rows[0] as Record<string, unknown>).count as string,
        10
      )

      const connResult = await query(`
        SELECT COUNT(*) as count FROM pg_stat_activity
      `)
      const connectionCount = parseInt(
        (connResult.rows[0] as Record<string, unknown>).count as string,
        10
      )

      return {
        files: fileStats,
        database: {
          tables: tableCount,
          connections: connectionCount
        },
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('[Monitoring] Failed to get storage metrics:', error)
      return {
        files: { total: 0, size: 0 },
        database: { tables: 0, connections: 0 },
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Get health check status
   */
  static async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    checks: {
      database: boolean
      storage: boolean
      memory: boolean
      cpu: boolean
    }
    timestamp: string
  }> {
    try {
      const metrics = await this.getSystemMetrics()
      const storage = await this.getStorageMetrics()

      // Database check
      let dbOk = false
      try {
        await query('SELECT 1')
        dbOk = true
      } catch {
        dbOk = false
      }

      // Storage check
      const storageOk = storage.files.total >= 0

      // Memory check - alert if > 85%
      const memoryOk = metrics.memory.percent < 85

      // CPU check - simplified (always OK for now)
      const cpuOk = true

      const checks = {
        database: dbOk,
        storage: storageOk,
        memory: memoryOk,
        cpu: cpuOk
      }

      const allOk = Object.values(checks).every((v) => v)
      const status = allOk
        ? 'healthy'
        : Object.values(checks).some((v) => v)
          ? 'degraded'
          : 'unhealthy'

      return {
        status,
        checks,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('[Monitoring] Health check failed:', error)
      return {
        status: 'unhealthy',
        checks: {
          database: false,
          storage: false,
          memory: false,
          cpu: false
        },
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    users: number
    files: number
    auditEntries: number
    orphanedFiles: number
    diskUsage: number
    timestamp: string
  }> {
    try {
      // Count users
      const usersResult = await query('SELECT COUNT(*) as count FROM users')
      const userCount = parseInt(
        (usersResult.rows[0] as Record<string, unknown>).count as string,
        10
      )

      // Count files
      const filesResult = await query(
        'SELECT COUNT(*) as count FROM files WHERE is_accessible = true'
      )
      const fileCount = parseInt(
        (filesResult.rows[0] as Record<string, unknown>).count as string,
        10
      )

      // Count audit entries
      const auditResult = await query('SELECT COUNT(*) as count FROM audit_log')
      const auditCount = parseInt(
        (auditResult.rows[0] as Record<string, unknown>).count as string,
        10
      )

      // Find orphaned files
      const orphanResult = await query(`
        SELECT COUNT(*) as count FROM files f
        LEFT JOIN users u ON f.created_by = u.id
        WHERE u.id IS NULL
      `)
      const orphanCount = parseInt(
        (orphanResult.rows[0] as Record<string, unknown>).count as string,
        10
      )

      // Get disk usage
      const diskResult = await query(
        'SELECT CAST(pg_database_size(current_database()) AS bigint) as size'
      )
      const diskUsage = parseInt((diskResult.rows[0] as Record<string, unknown>).size as string, 10)

      return {
        users: userCount,
        files: fileCount,
        auditEntries: auditCount,
        orphanedFiles: orphanCount,
        diskUsage,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('[Monitoring] Failed to get database stats:', error)
      return {
        users: 0,
        files: 0,
        auditEntries: 0,
        orphanedFiles: 0,
        diskUsage: 0,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Alert handler
   */
  static async raiseAlert(
    severity: 'info' | 'warning' | 'critical',
    message: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    console.log(`[Alert] [${severity.toUpperCase()}] ${message}`, details)

    try {
      await AuditService.logAction(null, 'VALIDATE', 'file', `alert_${severity}`, {
        errorMessage: message
      })
    } catch (error) {
      console.error('[Monitoring] Failed to log alert:', error)
    }

    // Wysyłka e-maila do administratora przy krytycznych alertach
    if (severity === 'critical' && mailTransport) {
      try {
        await mailTransport.sendMail({
          from: `eArchiwum <${SMTP_USER}>`,
          to: ADMIN_EMAIL,
          subject: `[eArchiwum] CRITICAL ALERT: ${message}`,
          text: `Wykryto krytyczny alert bezpieczeństwa:\n\n${message}\n\nSzczegóły:\n${JSON.stringify(details, null, 2)}\n\nCzas: ${new Date().toISOString()}`
        })
        console.log('[Monitoring] Critical alert e-mail sent to admin')
      } catch (err) {
        console.error('[Monitoring] Failed to send alert e-mail:', err)
      }
    }
  }

  /**
   * Check for alerts
   */
  static async performHealthChecks(): Promise<void> {
    try {
      const health = await this.getHealthStatus()
      const metrics = await this.getSystemMetrics()
      const storage = await this.getStorageMetrics()

      // Database alert
      if (!health.checks.database) {
        await this.raiseAlert('critical', 'Database is not responding', { check: 'database' })
      }

      // Memory alert
      if (metrics.memory.percent > 90) {
        await this.raiseAlert('critical', 'Memory usage critical', {
          percent: metrics.memory.percent,
          used: metrics.memory.used,
          total: metrics.memory.total
        })
      } else if (metrics.memory.percent > 75) {
        await this.raiseAlert('warning', 'Memory usage high', {
          percent: metrics.memory.percent
        })
      }

      // Storage alert
      if (storage.files.size > 0) {
        const maxStorageBytes = parseInt(process.env.MAX_STORAGE_BYTES || '0', 10)
        if (maxStorageBytes > 0 && storage.files.size > maxStorageBytes * 0.9) {
          await this.raiseAlert('warning', 'Storage usage high', {
            used: storage.files.size,
            max: maxStorageBytes,
            percent: (storage.files.size / maxStorageBytes) * 100
          })
        }
      }
    } catch (error) {
      console.error('[Monitoring] Health check error:', error)
    }
  }
}

export default MonitoringService
