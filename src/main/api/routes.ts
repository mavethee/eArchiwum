import { Router, Response, Request, Express } from 'express'
import axios, { AxiosError } from 'axios'
import AuthService from '../services/auth'
import FileService from '../services/files'
import AuditService from '../services/audit'
import AccountLockoutService from '../services/accountLockout'
import HashService from '../services/hash'
import FixityService from '../services/fixity'
import MonitoringService from '../services/monitoring'
import BackupService from '../services/backup'
import { authenticate, authorize, AuthenticatedRequest } from '../middleware/auth'
import { apiRateLimiter } from '../middleware/rateLimiter'
import { DublinCoreMetadata, SearchQuery, UserRole } from '../types'
import {
  validate,
  authRegisterSchema,
  authLoginSchema,
  authRefreshSchema,
  fileMetadataUpdateSchema,
  userUpdateRoleSchema
} from '../utils/validation'
import FileStorageUtil from '../utils/fileStorage'
import { createReadStream } from 'fs'
import { app } from 'electron'
import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import crypto from 'crypto'
import path from 'path'
import type { Multer } from 'multer'

type UploadRequest = AuthenticatedRequest & {
  file?: Express.Multer.File
  body: {
    description?: string
    accessLevel?: string
  }
}

type AppWithUpload = Express & { upload?: Multer }

const router = Router()

// ============================================================================
// MEDIA CACHE UTILS
// ============================================================================

const getMediaCacheDir = (): string => {
  const cacheDir = path.join(app.getPath('userData'), 'media-cache')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

const getMediaCachePath = (url: string): { dataPath: string; metaPath: string } => {
  const hash = crypto.createHash('md5').update(url).digest('hex')
  const dir = getMediaCacheDir()
  return {
    dataPath: path.join(dir, `${hash}.bin`),
    metaPath: path.join(dir, `${hash}.json`)
  }
}

const isMediaCacheValid = async (dataPath: string, maxAgeHours = 24): Promise<boolean> => {
  try {
    const stats = await fs.stat(dataPath)
    const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60)
    return ageInHours < maxAgeHours
  } catch {
    return false
  }
}

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

/**
 * POST /api/auth/register
 */
router.post(
  '/api/auth/register',
  validate(authRegisterSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { user, token, refreshToken } = await AuthService.register(
        req.body.username,
        req.body.password,
        req.body.email
      )

      res.status(201).json({
        success: true,
        data: { user, token, refreshToken }
      })
    } catch (error) {
      const err = error as Error
      res.status(400).json({
        success: false,
        error: { code: 'REGISTRATION_FAILED', message: err.message }
      })
    }
  }
)

/**
 * POST /api/auth/login
 */
router.post(
  '/api/auth/login',
  validate(authLoginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { user, token, refreshToken } = await AuthService.login(
        req.body.username,
        req.body.password
      )

      res.json({
        success: true,
        data: { user, token, refreshToken }
      })
    } catch (error) {
      const err = error as Error
      res.status(401).json({
        success: false,
        error: { code: 'LOGIN_FAILED', message: err.message }
      })
    }
  }
)

/**
 * POST /api/auth/refresh
 */
router.post(
  '/api/auth/refresh',
  validate(authRefreshSchema),
  (req: Request, res: Response): void => {
    try {
      const newToken = AuthService.refreshAccessToken(req.body.refreshToken)
      res.json({
        success: true,
        data: { token: newToken }
      })
    } catch (error) {
      const err = error as Error
      res.status(401).json({
        success: false,
        error: { code: 'REFRESH_FAILED', message: err.message }
      })
    }
  }
)

// ============================================================================
// FILES ROUTES
// ============================================================================

/**
 * GET /api/files/search
 */
router.get(
  '/api/files/search',
  authenticate,
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const {
        q,
        category,
        creator,
        dateFrom,
        dateTo,
        limit = '50',
        offset = '0'
      } = req.query as Partial<Record<keyof SearchQuery, string>>

      const results = await FileService.searchFiles({
        q: (q as string) || '',
        category: category as string as
          | 'document'
          | 'video'
          | 'audio'
          | 'image'
          | 'software'
          | undefined,
        creator: creator as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit: parseInt(limit, 10) || 50,
        offset: parseInt(offset, 10) || 0,
        accessLevel: 'public'
      })

      res.json({
        success: true,
        data: results
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'SEARCH_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/files/recent
 */
router.get(
  '/api/files/recent',
  authenticate,
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limitParam = req.query.limit
      const limit = parseInt(typeof limitParam === 'string' ? limitParam : '20', 10)
      const files = await FileService.getRecentFiles(limit)

      res.json({
        success: true,
        data: files
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/files/:id
 */
router.get(
  '/api/files/:id',
  authenticate,
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const file = await FileService.getFile(
        Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
        req.user?.userId ?? ''
      )

      if (!file) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' }
        })
        return
      }

      res.json({
        success: true,
        data: file
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/files/:id/versions
 */
router.get(
  '/api/files/:id/versions',
  authenticate,
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const versions = await FileService.getVersions(
        Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      )

      res.json({
        success: true,
        data: versions
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/files/stats
 */
router.get(
  '/api/files/stats',
  authenticate,
  apiRateLimiter,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await FileService.getFileStatistics()

      res.json({
        success: true,
        data: stats
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'STATS_ERROR', message: err.message }
      })
    }
  }
)

/**
 * POST /api/files/upload
 * Upload new file to archive
 */
router.post(
  '/api/files/upload',
  authenticate,
  authorize(['curator', 'admin']),
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      // Get upload middleware from app
      const upload = (req.app as AppWithUpload).upload
      if (!upload) {
        res.status(500).json({
          success: false,
          error: { code: 'UPLOAD_ERROR', message: 'Upload middleware not initialized' }
        })
        return
      }

      // Handle single file upload
      const uploadHandler = upload.single('file')
      uploadHandler(req, res, async (err?: unknown) => {
        try {
          if (err) {
            res.status(400).json({
              success: false,
              error: {
                code: 'UPLOAD_FAILED',
                message: err instanceof Error ? err.message : 'Upload failed'
              }
            })
            return
          }

          const uploadReq = req as UploadRequest

          if (!uploadReq.file) {
            res.status(400).json({
              success: false,
              error: { code: 'NO_FILE', message: 'No file provided' }
            })
            return
          }

          const { description = '', accessLevel = 'private' } = uploadReq.body || {}

          // Calculate real SHA-256 hash of the uploaded file
          const hash = await HashService.calculateFileHashFromPath(uploadReq.file.path)

          // Register file in database
          const registeredFile = await FileService.registerFile(
            uploadReq.file.path,
            hash,
            uploadReq.file.mimetype,
            req.user?.userId ?? '',
            {
              title: FileStorageUtil.getSafeFilename(uploadReq.file.originalname),
              description,
              creator: req.user?.username || '',
              language: 'pl',
              accessLevel
            }
          )

          // Log upload
          await AuditService.logAction(
            req.user?.userId ?? '',
            'CREATE',
            'file',
            registeredFile.id,
            {
              newValue: {
                filename: uploadReq.file.originalname,
                size: uploadReq.file.size
              }
            }
          )

          res.status(201).json({
            success: true,
            data: registeredFile
          })
        } catch (error) {
          const err = error as Error
          res.status(500).json({
            success: false,
            error: { code: 'REGISTRATION_ERROR', message: err.message }
          })
        }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/files/:id/download
 * Download file from archive
 */
router.get(
  '/api/files/:id/download',
  authenticate,
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const file = await FileService.getFile(fileId, req.user?.userId ?? '')

      if (!file) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' }
        })
        return
      }

      // Log download
      await AuditService.logAction(req.user?.userId ?? '', 'READ', 'file', fileId, {
        reason: 'File download'
      })

      // Stream file
      const stream = createReadStream(file.filePath)
      res.setHeader('Content-Type', file.mimeType)
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
      res.setHeader('X-File-ID', fileId)

      stream.pipe(res)
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: { code: 'STREAM_ERROR', message: err.message }
          })
        }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'DOWNLOAD_ERROR', message: err.message }
      })
    }
  }
)

/**
 * DELETE /api/files/:id
 * Soft delete file from archive
 */
router.delete(
  '/api/files/:id',
  authenticate,
  authorize(['curator', 'admin']),
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const { reason = 'User requested deletion' } = (req.body as { reason?: string }) || {}

      await FileService.deleteFile(fileId, req.user?.userId ?? '', reason)

      // Log deletion
      await AuditService.logAction(req.user?.userId ?? '', 'DELETE', 'file', fileId, {
        reason
      })

      res.json({
        success: true,
        data: { message: 'File deleted successfully' }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'DELETE_ERROR', message: err.message }
      })
    }
  }
)

/**
 * POST /api/files/:id/restore
 * Restore soft-deleted file
 */
router.post(
  '/api/files/:id/restore',
  authenticate,
  authorize(['curator', 'admin']),
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id

      // Update is_accessible flag
      await FileService.restoreFile(fileId)

      // Log restore
      await AuditService.logAction(req.user?.userId ?? '', 'UPDATE', 'file', fileId, {
        newValue: { is_accessible: true }
      })

      res.json({
        success: true,
        data: { message: 'File restored successfully' }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'RESTORE_ERROR', message: err.message }
      })
    }
  }
)

// ============================================================================
// METADATA ROUTES
// ============================================================================

/**
 * PUT /api/files/:id/metadata
 */
router.put(
  '/api/files/:id/metadata',
  authenticate,
  authorize(['curator', 'admin']),
  validate(fileMetadataUpdateSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = req.body as { dublinCore?: DublinCoreMetadata }
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      await FileService.updateFileMetadata(
        fileId,
        { dublinCore: body.dublinCore },
        req.user?.userId ?? ''
      )

      res.json({
        success: true,
        data: { message: 'Metadata updated' }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'UPDATE_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/files/:id/audit
 */
router.get(
  '/api/files/:id/audit',
  authenticate,
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const queryParams = req.query as Record<string, string | string[] | undefined>
      const limit = parseInt(typeof queryParams.limit === 'string' ? queryParams.limit : '100', 10)
      const offset = parseInt(typeof queryParams.offset === 'string' ? queryParams.offset : '0', 10)
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const result = await AuditService.getResourceAuditLog(fileId, limit, offset)

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'AUDIT_ERROR', message: err.message }
      })
    }
  }
)

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * GET /api/admin/users
 */
router.get(
  '/api/admin/users',
  authenticate,
  authorize(['admin']),
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const users = await AuthService.listUsers(req.user?.userId ?? '')

      res.json({
        success: true,
        data: users
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: err.message }
      })
    }
  }
)

/**
 * PUT /api/admin/users/:id/role
 */
router.put(
  '/api/admin/users/:id/role',
  authenticate,
  authorize(['admin']),
  validate(userUpdateRoleSchema),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = req.body as { role?: UserRole }
      const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const user = await AuthService.updateUserRole(
        userId,
        body.role || UserRole.READER,
        req.user?.userId ?? ''
      )

      res.json({
        success: true,
        data: user
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'UPDATE_ERROR', message: err.message }
      })
    }
  }
)

/**
 * POST /api/admin/users/:id/unlock
 */
router.post(
  '/api/admin/users/:id/unlock',
  authenticate,
  authorize(['admin']),
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      await AccountLockoutService.unlockAccount(userId, 'Admin unlock')

      res.json({
        success: true,
        data: { message: 'User account unlocked' }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'UNLOCK_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/admin/audit
 */
router.get(
  '/api/admin/audit',
  authenticate,
  authorize(['admin']),
  apiRateLimiter,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limitParam = req.query.limit
      const limit = parseInt(typeof limitParam === 'string' ? limitParam : '100', 10)

      const entries = await AuditService.getRecentAuditLog(limit)

      res.json({
        success: true,
        data: entries
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'AUDIT_ERROR', message: err.message }
      })
    }
  }
)

// ============================================================================
// FIXITY & INTEGRITY
// ============================================================================

/**
 * GET /api/files/:id/fixity
 * Get fixity report for a file
 */
router.get(
  '/api/files/:id/fixity',
  authenticate,
  authorize(['curator', 'admin']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const report = await FixityService.getFixityReport(fileId)
      res.json({
        success: true,
        data: report
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'FIXITY_ERROR', message: err.message }
      })
    }
  }
)

/**
 * POST /api/files/:id/fixity/verify
 * Verify integrity of a single file
 */
router.post(
  '/api/files/:id/fixity/verify',
  authenticate,
  authorize(['curator', 'admin']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const verification = await FixityService.verifyFile(fileId)
      res.json({
        success: verification.isValid,
        data: verification
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'FIXITY_ERROR', message: err.message }
      })
    }
  }
)

/**
 * POST /api/admin/fixity/verify-all
 * Batch verify all files (admin only)
 */
router.post(
  '/api/admin/fixity/verify-all',
  authenticate,
  authorize(['admin']),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const limit =
        typeof (req.body as Record<string, unknown>)?.limit === 'number'
          ? ((req.body as Record<string, unknown>).limit as number)
          : 100
      const report = await FixityService.verifyAllFiles(limit)
      res.json({
        success: true,
        data: report
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'FIXITY_ERROR', message: err.message }
      })
    }
  }
)

// ============================================================================
// MONITORING & HEALTH
// ============================================================================

/**
 * GET /api/admin/health
 * Get system health status
 */
router.get(
  '/api/admin/health',
  authenticate,
  authorize(['admin']),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const health = await MonitoringService.getHealthStatus()
      res.json({
        success: health.status === 'healthy',
        data: health
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'HEALTH_CHECK_ERROR', message: err.message }
      })
    }
  }
)

/**
 * GET /api/admin/metrics
 * Get system metrics
 */
router.get(
  '/api/admin/metrics',
  authenticate,
  authorize(['admin']),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const [system, storage, database] = await Promise.all([
        MonitoringService.getSystemMetrics(),
        MonitoringService.getStorageMetrics(),
        MonitoringService.getDatabaseStats()
      ])

      res.json({
        success: true,
        data: {
          system,
          storage,
          database
        }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'METRICS_ERROR', message: err.message }
      })
    }
  }
)

// ============================================================================
// BACKUP & MAINTENANCE
// ============================================================================

/**
 * GET /api/admin/backups
 * List available backups
 */
router.get(
  '/api/admin/backups',
  authenticate,
  authorize(['admin']),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const backups = await BackupService.listBackups()
      res.json({
        success: true,
        data: backups
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'BACKUP_ERROR', message: err.message }
      })
    }
  }
)

/**
 * POST /api/admin/backups/create
 * Create manual backup
 */
router.post(
  '/api/admin/backups/create',
  authenticate,
  authorize(['admin']),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const dbBackup = await BackupService.backupDatabase()
      const filesBackup = await BackupService.backupFiles()

      res.json({
        success: true,
        data: {
          database: dbBackup,
          files: filesBackup
        }
      })
    } catch (error) {
      const err = error as Error
      res.status(500).json({
        success: false,
        error: { code: 'BACKUP_ERROR', message: err.message }
      })
    }
  }
)

// ============================================================================
// MEDIA PROXY ROUTES (for CORS support with remote servers)
// ============================================================================

/**
 * GET /api/media/proxy
 * Proxy endpoint to fetch media from remote servers with CORS headers
 * Query param: ?url=<encoded-url>
 */
router.get('/api/media/proxy', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.query
    console.log('[PROXY] Incoming request for:', url)

    if (!url || typeof url !== 'string') {
      console.error('[PROXY] Missing URL parameter')
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_URL', message: 'URL parameter is required' }
      })
      return
    }

    if (!url.includes('archive.org')) {
      console.error('[PROXY] Forbidden host:', url)
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN_HOST', message: 'Only archive.org is allowed' }
      })
      return
    }

    const { dataPath, metaPath } = getMediaCachePath(url)
    console.log('[PROXY] Cache paths:', { dataPath, metaPath })
    const cacheValid = await isMediaCacheValid(dataPath, 24)
    console.log('[PROXY] Cache valid:', cacheValid, 'exists:', existsSync(dataPath))

    if (cacheValid && existsSync(dataPath)) {
      try {
        console.log('[PROXY] Serving from cache:', dataPath)
        const metaRaw = existsSync(metaPath) ? await fs.readFile(metaPath, 'utf8') : null
        const meta = metaRaw ? JSON.parse(metaRaw) : {}
        const contentType = meta.contentType || 'application/octet-stream'
        res.header('Access-Control-Allow-Origin', '*')
        res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        res.header('Access-Control-Allow-Headers', 'Content-Type, Range')
        res.header('Content-Type', contentType)
        res.header('Cache-Control', 'public, max-age=86400')
        const stream = createReadStream(dataPath)
        stream.pipe(res)
        return
      } catch (cacheErr) {
        console.error('[PROXY] Failed to read cache, will refetch', cacheErr)
      }
    }

    console.log('[PROXY] Fetching from archive.org:', url)
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'e-Archiwum/1.0',
        Accept: '*/*'
      },
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      timeout: 30000 // 30 second timeout
    })

    console.log('[PROXY] Response received:', {
      status: response.status,
      contentType: response.headers['content-type'],
      size: response.data?.length
    })

    const contentType = response.headers['content-type'] || 'application/octet-stream'
    const contentLength = response.headers['content-length']

    try {
      console.log('[PROXY] Saving to cache:', dataPath)
      await fs.writeFile(dataPath, Buffer.from(response.data))
      await fs.writeFile(metaPath, JSON.stringify({ contentType, contentLength }))
      console.log('[PROXY] Cached successfully')
    } catch (cacheErr) {
      console.error('[PROXY] Failed to cache media', cacheErr)
    }

    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Range')
    res.header('Content-Type', contentType)
    if (contentLength) {
      res.header('Content-Length', contentLength)
    }
    res.header('Cache-Control', 'public, max-age=86400')

    res.send(response.data)
  } catch (error: unknown) {
    let message = 'Unknown error'
    let status: number | undefined
    let headers: Record<string, unknown> | undefined
    let dataSample: string | undefined
    if (error instanceof AxiosError) {
      message = error.message
      status = error.response?.status
      headers = error.response?.headers as Record<string, unknown> | undefined
      const data = error.response?.data
      if (typeof data === 'string') {
        dataSample = data.slice(0, 200)
      } else if (data && typeof data === 'object') {
        dataSample = JSON.stringify(data).slice(0, 200)
      }
    } else if (error instanceof Error) {
      message = error.message
    }
    console.error('[PROXY] Error', {
      message,
      status,
      headers,
      dataSample
    })
    res.status(500).json({
      success: false,
      error: {
        code: 'PROXY_ERROR',
        message: `Failed to fetch media: ${message}`
      }
    })
  }
})

export default router
