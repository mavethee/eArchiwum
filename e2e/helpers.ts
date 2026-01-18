import { APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:3000'

/**
 * Test Helper Functions
 */

export interface TestUser {
  username: string
  password: string
  email: string
  token?: string
  userId?: string
}

/**
 * Create a test user and return auth token
 */
export async function createTestUser(request: APIRequestContext): Promise<TestUser> {
  const timestamp = Date.now()
  const user: TestUser = {
    username: `test_${timestamp}`,
    password: 'TestPass123!',
    email: `test_${timestamp}@example.com`
  }

  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: {
      username: user.username,
      password: user.password,
      email: user.email
    }
  })

  const body = await response.json()
  if (!body.success) {
    throw new Error(`Failed to create test user: ${body.error?.message}`)
  }

  user.token = body.data.token
  user.userId = body.data.user.id

  return user
}

/**
 * Upload a test file
 */
export async function uploadTestFile(
  request: APIRequestContext,
  token: string,
  options?: {
    filename?: string
    content?: string
    description?: string
    accessLevel?: string
  }
): Promise<Record<string, unknown>> {
  const filename = options?.filename || 'test.txt'
  const content = options?.content || 'Test file content'
  const fileBuffer = Buffer.from(content)

  const response = await request.post(`${API_URL}/api/files/upload`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    multipart: {
      file: {
        name: filename,
        mimeType: 'text/plain',
        buffer: fileBuffer
      },
      description: options?.description || 'Test file',
      accessLevel: options?.accessLevel || 'private'
    }
  })

  const body = await response.json()
  if (!body.success) {
    throw new Error(`Failed to upload test file: ${body.error?.message}`)
  }

  return body.data
}

/**
 * Download a file
 */
export async function downloadFile(
  request: APIRequestContext,
  fileId: string,
  token: string
): Promise<Buffer> {
  const response = await request.get(`${API_URL}/api/files/${fileId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!response.ok()) {
    throw new Error(`Failed to download file: ${response.status()}`)
  }

  return await response.body()
}

/**
 * Delete a file
 */
export async function deleteFile(
  request: APIRequestContext,
  fileId: string,
  token: string,
  reason?: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/api/files/${fileId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    data: {
      reason: reason || 'Test deletion'
    }
  })

  if (!response.ok()) {
    throw new Error(`Failed to delete file: ${response.status()}`)
  }
}

/**
 * Restore a deleted file
 */
export async function restoreFile(
  request: APIRequestContext,
  fileId: string,
  token: string
): Promise<Record<string, unknown>> {
  const response = await request.post(`${API_URL}/api/files/${fileId}/restore`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const body = await response.json()
  if (!body.success) {
    throw new Error(`Failed to restore file: ${body.error?.message}`)
  }

  return body.data
}

/**
 * Get file metadata
 */
export async function getFile(
  request: APIRequestContext,
  fileId: string,
  token: string
): Promise<Record<string, unknown>> {
  const response = await request.get(`${API_URL}/api/files/${fileId}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const body = await response.json()
  if (!body.success && response.status() !== 200) {
    throw new Error(`Failed to get file: ${body.error?.message}`)
  }

  return body.data
}

/**
 * Verify file integrity
 */
export async function verifyFileIntegrity(
  request: APIRequestContext,
  fileId: string,
  token: string
): Promise<{ isValid: boolean; error?: string }> {
  const response = await request.post(`${API_URL}/api/files/${fileId}/fixity/verify`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const body = await response.json()
  return body.data
}
