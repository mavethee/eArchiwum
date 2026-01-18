import 'dotenv/config'
import { app, shell, BrowserWindow, ipcMain, dialog, protocol, session } from 'electron'
import { Server } from 'http'
import { join } from 'path'

import { electronApp, optimizer } from '@electron-toolkit/utils'
import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import multer from 'multer'
import icon from '../../resources/icon.png?asset'
import db from './database/db'
import routes from './api/routes'
import { requestIdMiddleware, loggingMiddleware, errorHandler } from './middleware/auth'
import { globalRateLimiter, authRateLimiter } from './middleware/rateLimiter'
import {
  cdnCorsMiddleware,
  securityHeadersMiddleware,
  cacheControlMiddleware
} from './middleware/cdn'
import { initializeLogger } from './utils/logger'
import EncryptionService from './services/encryption'
import FileStorageUtil from './utils/fileStorage'
import SchedulerService from './services/scheduler'
// import FileService from './services/files' // Not used - using REST API instead
import fs from 'fs/promises'
import crypto from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { extname, basename } from 'path'
import path from 'path'

// ============================================================================
// PDF CACHE MANAGEMENT
// ============================================================================

const getCacheDir = (): string => {
  const cacheDir = path.join(app.getPath('userData'), 'pdf-cache')
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

const getCachedFilePath = (url: string): string => {
  const hash = crypto.createHash('md5').update(url).digest('hex')
  return path.join(getCacheDir(), `${hash}.pdf`)
}

const isCacheValid = async (filePath: string, maxAgeHours = 24): Promise<boolean> => {
  try {
    const stats = await fs.stat(filePath)
    const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60)
    return ageInHours < maxAgeHours
  } catch {
    return false
  }
}

// ============================================================================
// EXPRESS API SERVER
// ============================================================================

type ExpressWithUpload = Express & { upload?: multer.Multer }

let expressApp: ExpressWithUpload | null = null
let server: Server | null = null

const initializeExpressServer = async (): Promise<void> => {
  try {
    expressApp = express()

    // Initialize storage
    FileStorageUtil.initialize()

    // Initialize logger
    initializeLogger()

    // Initialize encryption service
    EncryptionService.initialize()

    // Configure multer for file uploads
    const upload = multer({
      storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
          const tempDir = FileStorageUtil.getTempDir()
          cb(null, tempDir)
        },
        filename: (_req, file, cb) => {
          const safeName = FileStorageUtil.getSafeFilename(file.originalname)
          const timestamp = Date.now()
          const ext = extname(file.originalname)
          const name = `${timestamp}-${safeName}${ext}`
          cb(null, name)
        }
      }),
      limits: {
        fileSize: FileStorageUtil.MAX_FILE_SIZE
      },
      fileFilter: (_req, file, cb) => {
        if (FileStorageUtil.isAllowedMimeType(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed`))
        }
      }
    })

    // Make upload available globally
    expressApp.upload = upload

    // Middleware - Order matters!
    // Strong Content Security Policy for API responses
    expressApp.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'http://localhost:3000'],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
          }
        },
        crossOriginResourcePolicy: false // Allow CORS
      })
    )
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[SECURITY] CSP is enabled for API responses. If you see CSP errors in Electron, adjust Electron CSP, not API!'
      )
    }
    expressApp.use(
      cors({
        origin: '*', // Allow all origins (safe for Electron + localhost)
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      })
    )

    // Custom middleware to log all incoming requests
    expressApp.use((req, _res, next) => {
      console.log(`[SERVER] Incoming request: ${req.method} ${req.originalUrl}`)
      next()
    })

    expressApp.use(cdnCorsMiddleware) // CDN support
    expressApp.use(securityHeadersMiddleware) // CDN security headers
    expressApp.use(globalRateLimiter) // Global rate limiting
    expressApp.use(express.json({ limit: '100mb' }))
    expressApp.use(express.urlencoded({ limit: '100mb', extended: true }))
    expressApp.use(requestIdMiddleware)
    expressApp.use(loggingMiddleware)

    // Cache control for static/media endpoints
    expressApp.get('/api/files/:id/download', cacheControlMiddleware(30 * 24 * 60 * 60)) // 30 days

    // Auth-specific rate limiting
    expressApp.post(/^\/api\/auth\//, authRateLimiter)

    // Health check (before routes)
    expressApp.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    // API Routes - already have /api prefix
    expressApp.use('/', routes)

    // Legacy health endpoint
    expressApp.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    // Error handler (must be last)
    expressApp.use(errorHandler)
    const port = process.env.API_PORT || 3000
    server = expressApp.listen(port, () => {
      console.log(`API Server running on http://localhost:${port}`)

      // Start background scheduler jobs
      SchedulerService.startAllJobs()
    })
  } catch (error) {
    console.error('Failed to initialize Express server:', error)
    throw error
  }
}

// ============================================================================
// ELECTRON APP SETUP
// ============================================================================

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ============================================================================
// FILE PROTOCOL
// ============================================================================

const setupFileProtocol = (): void => {
  protocol.registerFileProtocol('media', (request, callback) => {
    const url = request.url.replace('media://', '')
    try {
      const decodedPath = decodeURIComponent(url)

      // SECURITY: Restriction to specific allowed directories
      const allowedRoot = FileStorageUtil.getStorageDir()

      if (!decodedPath.startsWith(allowedRoot) && !decodedPath.includes('resources')) {
        console.warn(`[PROTOCOL] Blocked access to: ${decodedPath}`)
        return callback({ error: -10 /* ACCESS_DENIED */ })
      }

      callback(decodedPath)
    } catch (error) {
      console.error('File protocol error:', error)
      callback({ error: -2 /* FAILED */ })
    }
  })
}

// ============================================================================
// IPC HANDLERS (Electron to Renderer communication)
// ============================================================================

const setupIPCHandlers = (): void => {
  // Legacy support - redirect to API
  ipcMain.handle('scan-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return []
    return scanFolderForArchive(filePaths[0])
  })

  ipcMain.handle('open-file', async (_, filePath: string) => {
    // Basic security check: ensure filePath is within allowed directories or is a registered file
    // For now, we'll just open it, but in a real app, you'd check database records
    const result = await shell.openPath(filePath)
    return !result
  })

  ipcMain.handle('fetch-remote-file', async (_, url: string) => {
    try {
      // Upewnij się że katalog cache istnieje
      const cacheDir = getCacheDir()
      console.log('📁 Cache directory:', cacheDir)

      const cachedPath = getCachedFilePath(url)
      console.log('🔍 Checking cache for:', url)
      console.log('📂 Cache file path:', cachedPath)

      // Sprawdź czy mamy w cache i czy nie jest za stary (24h)
      const fileExists = existsSync(cachedPath)
      console.log('📄 File exists:', fileExists)

      if (fileExists) {
        const isValid = await isCacheValid(cachedPath, 24)
        console.log('✅ Cache valid:', isValid)

        if (isValid) {
          console.log('⚡ Using cached file for:', url)
          const cachedData = await fs.readFile(cachedPath)
          console.log('📦 Loaded from cache, size:', cachedData.length, 'bytes')
          return cachedData
        } else {
          console.log('🗑️  Cache expired, will re-download')
        }
      }

      // Pobierz z internetu
      console.log('🌐 Downloading from internet:', url)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
      }
      const buffer = await response.arrayBuffer()
      const fileBuffer = Buffer.from(buffer)
      console.log('⬇️  Downloaded, size:', fileBuffer.length, 'bytes')

      // Zapisz w cache
      try {
        await fs.writeFile(cachedPath, fileBuffer)
        console.log('💾 Saved to cache:', cachedPath)

        // Verify write
        const verifyExists = existsSync(cachedPath)
        console.log('✔️  Verify file exists after write:', verifyExists)
      } catch (cacheError) {
        console.error('❌ Failed to save to cache:', cacheError)
      }

      return fileBuffer
    } catch (error) {
      console.error('💥 Failed to fetch remote file via IPC:', error)
      throw error
    }
  })

  // Handler do czyszczenia cache
  ipcMain.handle('clear-pdf-cache', async () => {
    try {
      const cacheDir = getCacheDir()
      const files = await fs.readdir(cacheDir)
      let cleared = 0

      for (const file of files) {
        if (file.endsWith('.pdf')) {
          await fs.unlink(path.join(cacheDir, file))
          cleared++
        }
      }

      console.log(`Wyczyszczono ${cleared} plików z cache`)
      return { cleared }
    } catch (error) {
      console.error('Błąd czyszczenia cache:', error)
      return { cleared: 0, error: String(error) }
    }
  })
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getMediaType = (filename: string): string => {
  const ext = extname(filename).toLowerCase()
  if (['.pdf', '.txt', '.doc', '.docx', '.epub'].includes(ext)) return 'teksty'
  if (['.mp3', '.wav', '.flac', '.ogg'].includes(ext)) return 'audio'
  if (['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext)) return 'filmy'
  if (['.iso', '.bin', '.cue', '.exe', '.img'].includes(ext)) return 'oprogramowanie'
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) return 'obrazy'
  return 'inne'
}

const generateFileHash = async (filePath: string): Promise<string> => {
  const fileBuffer = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(fileBuffer).digest('hex')
}

const scanFolderForArchive = async (folderPath: string): Promise<Record<string, unknown>[]> => {
  const items = await fs.readdir(folderPath, { withFileTypes: true })
  const archiveItems: Array<Record<string, unknown>> = []

  for (const item of items) {
    if (!item.isDirectory()) {
      const filePath = join(folderPath, item.name)
      const fileHash = await generateFileHash(filePath)
      const mediaType = getMediaType(item.name)

      archiveItems.push({
        id: fileHash,
        title: basename(item.name, extname(item.name)),
        filePath,
        mediaType,
        coverColor: `bg-gradient-to-br from-slate-600 to-slate-800`,
        description: `Plik: ${item.name}`,
        a11yDescription: `Zarchiwizowany plik: ${item.name}`,
        rating: 0
      })
    }
  }

  return archiveItems
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.earchiwum')

  // Set a more permissive Content-Security-Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' data: blob: https://cdn.tailwindcss.com https://api.dicebear.com; " +
            "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com blob:; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: https:; " +
            "media-src 'self' data: blob: http://localhost:3000; " +
            "connect-src 'self' https: http://localhost:3000;"
        ]
      }
    })
  })

  try {
    // Initialize database
    console.log('Initializing database...')
    await db.initializePool()

    // Initialize Express API
    console.log('Initializing API server...')
    await initializeExpressServer()

    // Setup protocols and handlers
    setupFileProtocol()
    setupIPCHandlers()

    // Create window
    createWindow()
  } catch (error) {
    console.error('Initialization failed:', error)
    app.quit()
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
})

app.on('window-all-closed', async () => {
  SchedulerService.stopAllJobs()
  if (server) server.close()
  await db.closePool()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// Handle app termination
process.on('SIGINT', async () => {
  if (server) server.close()
  await db.closePool()
  process.exit(0)
})

export default app
