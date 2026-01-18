import { query } from '../database/db'
import { AuditLogEntry } from '../types'

export class AuditService {
  /**
   * Log an action to audit trail
   */
  static async logAction(
    userId: string | null,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'DOWNLOAD' | 'SHARE' | 'VALIDATE',
    resourceType: 'file' | 'metadata' | 'user' | 'version',
    resourceId: string,
    options?: {
      previousValue?: unknown
      newValue?: unknown
      reason?: string
      ipAddress?: string
      userAgent?: string
      success?: boolean
      errorMessage?: string
    }
  ): Promise<AuditLogEntry> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO audit_log (
        user_id, action, resource_type, resource_id,
        previous_value, new_value, reason, ip_address, user_agent, success, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        userId,
        action,
        resourceType,
        resourceId,
        options?.previousValue ? JSON.stringify(options.previousValue) : null,
        options?.newValue ? JSON.stringify(options.newValue) : null,
        options?.reason,
        options?.ipAddress,
        options?.userAgent,
        options?.success !== false,
        options?.errorMessage
      ]
    )

    return result.rows[0] as unknown as AuditLogEntry
  }

  /**
   * Get audit log for a resource
   */
  static async getResourceAuditLog(
    resourceId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM audit_log WHERE resource_id = $1`,
      [resourceId]
    )

    const result = await query<Record<string, unknown>>(
      `SELECT * FROM audit_log WHERE resource_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [resourceId, limit, offset]
    )

    return {
      entries: result.rows as unknown as AuditLogEntry[],
      total: countResult.rows[0].count
    }
  }

  /**
   * Get user's audit log
   */
  static async getUserAuditLog(
    userId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM audit_log WHERE user_id = $1`,
      [userId]
    )

    const result = await query<Record<string, unknown>>(
      `SELECT * FROM audit_log WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    return {
      entries: result.rows as unknown as AuditLogEntry[],
      total: countResult.rows[0].count
    }
  }

  /**
   * Get recent audit log
   */
  static async getRecentAuditLog(limit: number = 100): Promise<AuditLogEntry[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )

    return result.rows as unknown as AuditLogEntry[]
  }

  /**
   * Search audit log
   */
  static async searchAuditLog(
    filters: {
      action?: string
      resourceType?: string
      userId?: string
      dateFrom?: string
      dateTo?: string
    },
    limit: number = 100,
    offset: number = 0
  ): Promise<{ entries: AuditLogEntry[]; total: number }> {
    let whereClause = 'WHERE 1=1'
    const params: Array<string | number | boolean> = []

    if (filters.action) {
      whereClause += ` AND action = $${params.length + 1}`
      params.push(filters.action)
    }
    if (filters.resourceType) {
      whereClause += ` AND resource_type = $${params.length + 1}`
      params.push(filters.resourceType)
    }
    if (filters.userId) {
      whereClause += ` AND user_id = $${params.length + 1}`
      params.push(filters.userId)
    }
    if (filters.dateFrom) {
      whereClause += ` AND created_at >= $${params.length + 1}`
      params.push(filters.dateFrom)
    }
    if (filters.dateTo) {
      whereClause += ` AND created_at <= $${params.length + 1}`
      params.push(filters.dateTo)
    }

    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM audit_log ${whereClause}`,
      params
    )

    const result = await query<Record<string, unknown>>(
      `SELECT * FROM audit_log ${whereClause}
       ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    return {
      entries: result.rows as unknown as AuditLogEntry[],
      total: countResult.rows[0].count
    }
  }
}

export default AuditService
