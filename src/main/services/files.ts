import { query, withTransaction } from '../database/db'
import { ArchiveFile, FileVersion, SearchQuery, SearchResult } from '../types'
// import crypto from 'crypto' // Not used
import fs from 'fs/promises'
import MetadataService from './metadata'
import AuditService from './audit'

export class FileService {
  /**
   * Register file in archive
   */
  static async registerFile(
    filePath: string,
    fileHash: string,
    mimeType: string,
    createdBy: string,
    metadata?: {
      title?: string
      description?: string
      creator?: string
      language?: string
      accessLevel?: string
    }
  ): Promise<ArchiveFile> {
    const filename = metadata?.title || filePath.split('/').pop() || 'unknown'
    const stats = await fs.stat(filePath)

    return withTransaction(async (client) => {
      // Create file record
      const fileResult = await client.query<ArchiveFile>(
        `INSERT INTO files (
          filename, file_path, file_hash, mime_type, file_size,
          created_by, access_level, description, a11y_description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          filename,
          filePath,
          fileHash,
          mimeType,
          stats.size,
          createdBy,
          metadata?.accessLevel || 'public',
          metadata?.description,
          metadata?.description
        ]
      )

      const file = fileResult.rows[0]

      // Create Dublin Core metadata
      await MetadataService.createDublinCoreMetadata(file.id, {
        'dc:title': filename,
        'dc:creator': metadata?.creator || 'Unknown',
        'dc:description': metadata?.description,
        'dc:language': metadata?.language || 'pl',
        'dc:format': mimeType
      })

      // Create PREMIS metadata
      await MetadataService.createPremisMetadata(file.id, fileHash, mimeType)

      // Log to audit
      await AuditService.logAction(createdBy, 'CREATE', 'file', file.id, {
        newValue: file,
        reason: 'File registered in archive'
      })

      return file
    })
  }

  /**
   * Create new version of file
   */
  static async createVersion(
    fileId: string,
    newFilePath: string,
    newFileHash: string,
    createdBy: string,
    changeSummary?: string
  ): Promise<FileVersion> {
    return withTransaction(async (client) => {
      // Get current file info
      const fileResult = await client.query<{ current_version: number; previous_hash: string }>(
        `SELECT current_version, file_hash as previous_hash FROM files WHERE id = $1`,
        [fileId]
      )

      if (fileResult.rows.length === 0) {
        throw new Error('File not found')
      }

      const previousVersion = fileResult.rows[0].current_version
      const newVersion = previousVersion + 1
      const previousHash = fileResult.rows[0].previous_hash

      const stats = await fs.stat(newFilePath)

      // Create version record
      const versionResult = await client.query<FileVersion>(
        `INSERT INTO file_versions (
          file_id, version_number, file_hash, file_size, created_by,
          change_summary, change_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          fileId,
          newVersion,
          newFileHash,
          stats.size,
          createdBy,
          changeSummary,
          JSON.stringify({
            previousHash,
            previousSize: 0,
            diffSize: stats.size,
            formatChanged: false
          })
        ]
      )

      // Update file to new version
      await client.query(
        `UPDATE files SET
          file_path = $1,
          file_hash = $2,
          file_size = $3,
          current_version = $4,
          updated_at = NOW()
        WHERE id = $5`,
        [newFilePath, newFileHash, stats.size, newVersion, fileId]
      )

      // Record PREMIS event
      await MetadataService.recordPremisEvent(
        fileId,
        'modification',
        `Version ${newVersion} created: ${changeSummary || 'No description'}`,
        createdBy
      )

      // Audit log
      await AuditService.logAction(createdBy, 'UPDATE', 'file', fileId, {
        previousValue: { version: previousVersion },
        newValue: { version: newVersion },
        reason: changeSummary
      })

      return versionResult.rows[0]
    })
  }

  /**
   * Get file versions
   */
  static async getVersions(fileId: string): Promise<FileVersion[]> {
    const result = await query<ArchiveFile & Record<string, unknown>>(
      `SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC`,
      [fileId]
    )

    return result.rows as unknown as FileVersion[]
  }

  /**
   * Search files
   */
  static async searchFiles(searchQuery: SearchQuery): Promise<SearchResult> {
    const {
      q,
      category,
      creator,
      dateFrom,
      dateTo,
      accessLevel = 'public',
      limit = 50,
      offset = 0,
      orderBy = 'relevance',
      orderDir = 'desc'
    } = searchQuery

    let whereClause = `WHERE f.is_deleted = FALSE`
    const selectFields = `f.*,
      COALESCE(AVG(r.rating), 0) as avg_rating,
      COUNT(DISTINCT c.id) as comment_count,
      ts_rank(to_tsvector('polish', COALESCE(f.filename || ' ' || f.description, f.filename)),
              plainto_tsquery('polish', $1)) as relevance`
    const params: Array<string | number | boolean> = [q]
    let paramIndex = 2

    // Full-text search
    whereClause += ` AND to_tsvector('polish', COALESCE(f.filename || ' ' || f.description, f.filename)) @@ plainto_tsquery('polish', $1)`

    // Access level
    if (accessLevel) {
      whereClause += ` AND f.access_level = $${paramIndex}`
      params.push(accessLevel)
      paramIndex++
    }

    // Category filter
    if (category) {
      whereClause += ` AND f.media_type = $${paramIndex}`
      params.push(category)
      paramIndex++
    }

    // Creator filter
    if (creator) {
      whereClause += ` AND dc.creator ILIKE $${paramIndex}`
      params.push(`%${creator}%`)
      paramIndex++
    }

    // Date range
    if (dateFrom) {
      whereClause += ` AND f.created_at >= $${paramIndex}::timestamp`
      params.push(dateFrom)
      paramIndex++
    }
    if (dateTo) {
      whereClause += ` AND f.created_at <= $${paramIndex}::timestamp`
      params.push(dateTo)
      paramIndex++
    }

    // Count total
    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM files f
       LEFT JOIN metadata_dublin_core dc ON f.id = dc.file_id
       LEFT JOIN ratings r ON f.id = r.file_id
       LEFT JOIN comments c ON f.id = c.file_id
       ${whereClause}`,
      params
    )

    // Build ORDER BY
    const allowedOrderBy = ['relevance', 'date', 'title']
    const allowedOrderDir = ['asc', 'desc']

    const finalOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'relevance'
    const finalOrderDir = allowedOrderDir.includes(orderDir.toLowerCase())
      ? orderDir.toLowerCase()
      : 'desc'

    let orderByClause = ''
    if (finalOrderBy === 'relevance') {
      orderByClause = ` ORDER BY relevance ${finalOrderDir}`
    } else if (finalOrderBy === 'date') {
      orderByClause = ` ORDER BY f.created_at ${finalOrderDir}`
    } else if (finalOrderBy === 'title') {
      orderByClause = ` ORDER BY f.filename ${finalOrderDir}`
    }

    // Get results
    const startTime = Date.now()

    const result = await query<
      (ArchiveFile & Record<string, unknown>) & {
        avg_rating: number
        comment_count: number
        relevance: number
      }
    >(
      `SELECT ${selectFields}
       FROM files f
       LEFT JOIN metadata_dublin_core dc ON f.id = dc.file_id
       LEFT JOIN ratings r ON f.id = r.file_id
       LEFT JOIN comments c ON f.id = c.file_id AND c.is_deleted = FALSE
       ${whereClause}
       GROUP BY f.id, dc.id
       ${orderByClause}
       LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`,
      [...params, limit, offset]
    )

    const executionTime = Date.now() - startTime

    return {
      files: result.rows,
      total: Number(countResult.rows[0].count),
      limit,
      offset,
      executionTime
    }
  }

  /**
   * Delete file (soft delete)
   */
  static async deleteFile(fileId: string, deletedBy: string, reason?: string): Promise<void> {
    return withTransaction(async (client) => {
      // Archive file using the new soft-delete columns
      await client.query(
        `UPDATE files SET is_deleted = TRUE, deleted_at = NOW(), is_accessible = FALSE WHERE id = $1`,
        [fileId]
      )

      await AuditService.logAction(deletedBy, 'DELETE', 'file', fileId, {
        reason: reason || 'File moved to archive'
      })
    })
  }

  /**
   * Restore soft-deleted file
   */
  static async restoreFile(fileId: string): Promise<void> {
    return withTransaction(async (client) => {
      await client.query(
        `UPDATE files SET is_deleted = FALSE, deleted_at = NULL, is_accessible = TRUE, updated_at = NOW() WHERE id = $1`,
        [fileId]
      )
    })
  }

  /**
   * Get file by ID with all metadata
   */
  static async getFile(fileId: string, userId?: string): Promise<ArchiveFile | null> {
    if (userId) {
      await AuditService.logAction(userId, 'READ', 'file', fileId)
    }

    return MetadataService.getFileWithMetadata(fileId)
  }

  /**
   * Update file metadata
   */
  static async updateFileMetadata(
    fileId: string,
    updates: Partial<ArchiveFile>,
    updatedBy: string
  ): Promise<void> {
    return withTransaction(async (client) => {
      // Update basic file info
      await client.query(
        `UPDATE files SET
          description = COALESCE($1, description),
          a11y_description = COALESCE($2, a11y_description),
          access_level = COALESCE($3, access_level),
          updated_at = NOW()
        WHERE id = $4`,
        [updates.description, updates.a11yDescription, updates.accessLevel, fileId]
      )

      // Update Dublin Core if provided
      if (updates.dublinCore) {
        await MetadataService.updateDublinCoreMetadata(fileId, updates.dublinCore)
      }

      await AuditService.logAction(updatedBy, 'UPDATE', 'file', fileId, {
        newValue: updates,
        reason: 'Metadata updated'
      })
    })
  }

  /**
   * Get recently added files
   */
  static async getRecentFiles(limit: number = 20): Promise<ArchiveFile[]> {
    const result = await query<ArchiveFile & Record<string, unknown>>(
      `SELECT * FROM v_files_full ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )

    return result.rows as ArchiveFile[]
  }

  /**
   * Get files by access level
   */
  static async getFilesByAccessLevel(
    accessLevel: string,
    limit: number = 50
  ): Promise<ArchiveFile[]> {
    const result = await query<ArchiveFile & Record<string, unknown>>(
      `SELECT * FROM v_files_full WHERE access_level = $1 ORDER BY created_at DESC LIMIT $2`,
      [accessLevel, limit]
    )

    return result.rows
  }

  /**
   * Count files by category
   */
  static async getFileStatistics(): Promise<{
    totalFiles: number
    categories: number
    totalSize: number
    avgRating: number
    contributors: number
  }> {
    const result = await query<{
      total_files: string
      categories: string
      total_size: string
      avg_rating: number
      contributors: string
    }>(
      `SELECT
        COUNT(*) as total_files,
        COUNT(DISTINCT media_type) as categories,
        SUM(file_size) as total_size,
        COALESCE(AVG(rating), 0) as avg_rating,
        COUNT(DISTINCT created_by) as contributors
      FROM files`
    )

    const stats = result.rows[0]

    return {
      totalFiles: Number(stats.total_files),
      categories: Number(stats.categories),
      totalSize: Number(stats.total_size),
      avgRating: stats.avg_rating,
      contributors: Number(stats.contributors)
    }
  }
}

export default FileService
