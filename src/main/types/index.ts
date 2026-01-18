// Archive metadata types - Dublin Core compliant
export interface DublinCoreMetadata {
  'dc:identifier': string // Unique identifier (UUID)
  'dc:title': string
  'dc:creator': string
  'dc:subject'?: string
  'dc:description'?: string
  'dc:publisher'?: string
  'dc:date': string // ISO 8601
  'dc:type': 'document' | 'video' | 'audio' | 'image' | 'software' | 'collection'
  'dc:format': string // MIME type
  'dc:language': string // ISO 639-1
  'dc:rights'?: string
  'dc:source'?: string
}

// PREMIS preservation metadata
export interface PremisMetadata {
  'premis:objectIdentifier': string
  'premis:objectCharacteristics': {
    'premis:compositionLevel': number
    'premis:fixity': {
      'premis:messageDigestAlgorithm': 'SHA-256' | 'MD5'
      'premis:messageDigest': string
      'premis:messageDigestValidation': string // ISO 8601
    }
    'premis:format': {
      'premis:formatRegistry': string
      'premis:formatName': string
    }
  }
  'premis:preservationLevel': 'bitPreservation' | 'referencePreservation' | 'fulPreservation'
  'premis:events': PremisEvent[]
}

export interface PremisEvent {
  'premis:eventIdentifier': string
  'premis:eventType':
    | 'capture'
    | 'creation'
    | 'modification'
    | 'access'
    | 'migration'
    | 'validation'
  'premis:eventDateTime': string // ISO 8601
  'premis:eventDetail'?: string
  'premis:linkingAgentIdentifier': string
  'premis:linkingObjectIdentifier': string
}

// File metadata in archive
export interface ArchiveFile {
  id: string // UUID
  filename: string
  filePath: string
  fileHash: string // SHA-256
  mimeType: string
  fileSize: number
  originalCreatedAt: string // ISO 8601
  archiveAddedAt: string // ISO 8601
  updatedAt: string
  currentVersion: number
  description?: string
  a11yDescription?: string
  dublinCore: DublinCoreMetadata
  premis: PremisMetadata
  checksum: string
  isAccessible: boolean
  accessLevel: 'public' | 'internal' | 'restricted' | 'confidential'
}

// File versioning
export interface FileVersion {
  id: string
  fileId: string
  versionNumber: number
  fileHash: string
  createdBy: string // User ID
  changeSummary?: string
  createdAt: string
  metadata?: {
    previousHash?: string
    diffSize?: number
    formatChanged?: boolean
  }
}

// User and RBAC
export enum UserRole {
  READER = 'reader',
  CURATOR = 'curator',
  ADMIN = 'admin'
}

export interface User {
  id: string
  username: string
  passwordHash: string
  role: UserRole
  email?: string
  createdAt: string
  lastLogin?: string
  isActive: boolean
}

// JWT payload
export interface JWTPayload {
  userId: string
  username: string
  role: UserRole
  iat: number
  exp: number
}

// Audit log
export interface AuditLogEntry {
  id: string
  userId: string
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'DOWNLOAD' | 'SHARE' | 'VALIDATE'
  resourceType: 'file' | 'metadata' | 'user' | 'version'
  resourceId: string
  details: {
    previousValue?: unknown
    newValue?: unknown
    reason?: string
    ipAddress?: string
  }
  timestamp: string
  success: boolean
  errorMessage?: string
}

// Search query
export interface SearchQuery {
  q: string // Full-text search
  category?: 'document' | 'video' | 'audio' | 'image' | 'software'
  creator?: string
  dateFrom?: string
  dateTo?: string
  accessLevel?: string
  limit?: number
  offset?: number
  orderBy?: 'relevance' | 'date' | 'title'
  orderDir?: 'asc' | 'desc'
}

export interface SearchResult {
  files: ArchiveFile[]
  total: number
  limit: number
  offset: number
  executionTime: number // ms
}

// Backup metadata
export interface BackupMetadata {
  id: string
  backupDate: string
  filesCount: number
  totalSize: number
  checksumSHA256: string
  type: 'full' | 'incremental'
  retention: string // ISO 8601 duration
  location: string // S3 path or local path
  verified: boolean
  verificationDate?: string
}

// API Response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  timestamp: string
  requestId: string
}
