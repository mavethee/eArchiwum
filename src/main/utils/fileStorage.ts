import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * File Storage Utility
 * Manages file upload/download paths and storage
 */

export class FileStorageUtil {
  private static readonly STORAGE_DIR =
    process.env.FILE_STORAGE_DIR || join(app.getPath('userData'), 'files')

  private static readonly TEMP_UPLOAD_DIR = join(this.STORAGE_DIR, '.tmp')

  /**
   * Initialize storage directories
   */
  static initialize(): void {
    if (!existsSync(this.STORAGE_DIR)) {
      mkdirSync(this.STORAGE_DIR, { recursive: true })
    }
    if (!existsSync(this.TEMP_UPLOAD_DIR)) {
      mkdirSync(this.TEMP_UPLOAD_DIR, { recursive: true })
    }
  }

  /**
   * Get storage directory path
   */
  static getStorageDir(): string {
    return this.STORAGE_DIR
  }

  /**
   * Get temp upload directory
   */
  static getTempDir(): string {
    return this.TEMP_UPLOAD_DIR
  }

  /**
   * Get file path for a file ID
   */
  static getFilePath(fileId: string): string {
    return join(this.STORAGE_DIR, fileId)
  }

  /**
   * Get archive subdirectory for organized storage
   */
  static getArchivePath(year: number, month: number): string {
    return join(this.STORAGE_DIR, `archive/${year}/${String(month).padStart(2, '0')}`)
  }

  /**
   * Max file size (100 MB)
   */
  static readonly MAX_FILE_SIZE = 100 * 1024 * 1024

  /**
   * Allowed MIME types
   */
  static readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/x-zip-compressed',
    'application/gzip',
    'application/x-tar'
  ]

  /**
   * Validate MIME type
   */
  static isAllowedMimeType(mimeType: string): boolean {
    return this.ALLOWED_MIME_TYPES.includes(mimeType)
  }

  /**
   * Get safe filename from original
   */
  static getSafeFilename(originalName: string): string {
    return originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255)
  }
}

export default FileStorageUtil
