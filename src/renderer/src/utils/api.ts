/**
 * API Client for e-Archiwum Backend
 * Handles all communication with Express API on port 3000
 */

const API_BASE = 'http://localhost:3000'

interface ApiResponse<T = Record<string, unknown>> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

let authToken: string | null = null

export const setAuthToken = (token: string): void => {
  authToken = token
}

export const getAuthToken = (): string | null => authToken

const apiCall = async <T = Record<string, unknown>>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: Record<string, unknown>
    requiresAuth?: boolean
  } = {}
): Promise<ApiResponse<T>> => {
  const { method = 'GET', body, requiresAuth = true } = options
  const fullUrl = `${API_BASE}${endpoint}`

  console.log('[API] Request:', { method, url: fullUrl, body })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (requiresAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    console.log('[API] Response:', { status: response.status, url: fullUrl })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: {
          code: `HTTP_${response.status}`,
          message: errorData.error?.message || `HTTP Error: ${response.status}`
        }
      }
    }

    const data = await response.json()
    return data
  } catch (error) {
    let message = 'Unknown error'
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        message = 'Request timeout'
      } else {
        message = error.message
      }
    }
    console.error('[API] Error:', { message, url: fullUrl })
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `Network error: ${message}`
      }
    }
  }
}

/**
 * Upload file with FormData (multipart/form-data)
 */
const apiUpload = async <T = Record<string, unknown>>(
  endpoint: string,
  formData: FormData
): Promise<ApiResponse<T>> => {
  const headers: Record<string, string> = {}

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData
    })

    const data = await response.json()
    return data
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: `Upload error: ${error instanceof Error ? error.message : 'Unknown'}`
      }
    }
  }
}

/**
 * Download file as blob (stream)
 */
const apiDownload = async (endpoint: string): Promise<{ blob: Blob; headers: Headers } | null> => {
  const headers: Record<string, string> = {}

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      return null
    }

    const blob = await response.blob()
    return { blob, headers: response.headers }
  } catch (error) {
    console.error('Download error:', error)
    return null
  }
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

export const auth = {
  register: async (
    username: string,
    password: string,
    email: string
  ): Promise<
    ApiResponse<{ user: Record<string, unknown>; token: string; refreshToken: string }>
  > => {
    return apiCall('/api/auth/register', {
      method: 'POST',
      body: { username, password, email },
      requiresAuth: false
    })
  },

  login: async (
    username: string,
    password: string
  ): Promise<
    ApiResponse<{ user: Record<string, unknown>; token: string; refreshToken: string }>
  > => {
    return apiCall('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      requiresAuth: false
    })
  },

  refresh: async (refreshToken: string): Promise<ApiResponse<{ token: string }>> => {
    return apiCall('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      requiresAuth: false
    })
  }
}

// ============================================================================
// FILES
// ============================================================================

export const files = {
  search: async (query: {
    q?: string
    category?: string
    creator?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
    offset?: number
  }): Promise<ApiResponse<Record<string, unknown>[]>> => {
    const params = new URLSearchParams()
    if (query.q) params.append('q', query.q)
    if (query.category) params.append('category', query.category)
    if (query.creator) params.append('creator', query.creator)
    if (query.dateFrom) params.append('dateFrom', query.dateFrom)
    if (query.dateTo) params.append('dateTo', query.dateTo)
    if (query.limit) params.append('limit', query.limit.toString())
    if (query.offset) params.append('offset', query.offset.toString())

    return apiCall(`/api/files/search?${params.toString()}`)
  },

  getFile: async (id: string): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiCall(`/api/files/${id}`)
  },

  getRecent: async (limit: number = 20): Promise<ApiResponse<Record<string, unknown>[]>> => {
    return apiCall(`/api/files/recent?limit=${limit}`)
  },

  getStats: async (): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiCall('/api/files/stats')
  },

  getVersions: async (id: string): Promise<ApiResponse<Record<string, unknown>[]>> => {
    return apiCall(`/api/files/${id}/versions`)
  },

  updateMetadata: async (
    id: string,
    metadata: Record<string, unknown>
  ): Promise<ApiResponse<{ message: string }>> => {
    return apiCall(`/api/files/${id}/metadata`, {
      method: 'PUT',
      body: { dublinCore: metadata }
    })
  },

  getAudit: async (
    id: string,
    limit?: number,
    offset?: number
  ): Promise<ApiResponse<Record<string, unknown>>> => {
    const params = new URLSearchParams()
    if (limit) params.append('limit', limit.toString())
    if (offset) params.append('offset', offset.toString())
    return apiCall(`/api/files/${id}/audit?${params.toString()}`)
  },

  /**
   * Upload a file with optional metadata
   */
  upload: async (
    file: File,
    metadata?: { description?: string; accessLevel?: string }
  ): Promise<ApiResponse<Record<string, unknown>>> => {
    const formData = new FormData()
    formData.append('file', file)
    if (metadata?.description) {
      formData.append('description', metadata.description)
    }
    if (metadata?.accessLevel) {
      formData.append('accessLevel', metadata.accessLevel)
    }
    return apiUpload('/api/files/upload', formData)
  },

  /**
   * Download a file as blob
   */
  download: async (fileId: string) => {
    const result = await apiDownload(`/api/files/${fileId}/download`)
    if (!result) {
      return null
    }
    return {
      blob: result.blob,
      filename:
        result.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') ||
        'download'
    }
  },

  /**
   * Delete a file (soft delete)
   */
  delete: async (fileId: string, reason?: string): Promise<ApiResponse<{ message: string }>> => {
    return apiCall(`/api/files/${fileId}`, {
      method: 'DELETE',
      body: { reason: reason || 'No reason provided' }
    })
  },

  /**
   * Restore a deleted file
   */
  restore: async (fileId: string): Promise<ApiResponse<Record<string, unknown>>> => {
    return apiCall(`/api/files/${fileId}/restore`, {
      method: 'POST'
    })
  }
}

// ============================================================================
// ADMIN
// ============================================================================

export const admin = {
  listUsers: async (): Promise<ApiResponse<Record<string, unknown>[]>> => {
    return apiCall('/api/admin/users')
  },

  updateUserRole: async (
    userId: string,
    role: string
  ): Promise<ApiResponse<{ message: string }>> => {
    return apiCall(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      body: { role }
    })
  },

  getAuditLog: async (limit: number = 100): Promise<ApiResponse<Record<string, unknown>[]>> => {
    return apiCall(`/api/admin/audit?limit=${limit}`)
  }
}

export default {
  auth,
  files,
  admin,
  setAuthToken,
  getAuthToken
}
