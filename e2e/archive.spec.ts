import { test, expect } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * E2E Tests for Digital Archive
 *
 * Prerequisites:
 * - API server running on http://localhost:3000
 * - Test database initialized
 * - Test user credentials available
 */

const API_URL = 'http://localhost:3000'
const TEST_PASSWORD = 'TestPass123!'

test.describe('Authentication Flow', () => {
  test('should register a new user', async ({ request }: { request: any }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        username: `user_${Date.now()}`,
        password: TEST_PASSWORD,
        email: `user_${Date.now()}@example.com`
      }
    })

    expect(response.status()).toBe(201)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.token).toBeTruthy()
  })

  test('should login successfully', async ({ request }: { request: any }) => {
    // First register
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        username: `login_test_${Date.now()}`,
        password: TEST_PASSWORD,
        email: `login_test_${Date.now()}@example.com`
      }
    })
    expect(registerRes.status()).toBe(201)
    const registerBody = await registerRes.json()

    // Then login
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: {
        username: registerBody.data.user.username,
        password: TEST_PASSWORD
      }
    })

    expect(loginRes.status()).toBe(200)
    const loginBody = await loginRes.json()
    expect(loginBody.success).toBe(true)
    expect(loginBody.data.token).toBeTruthy()
  })

  test('should reject invalid credentials', async ({ request }: { request: any }) => {
    const response = await request.post(`${API_URL}/api/auth/login`, {
      data: {
        username: 'nonexistent',
        password: 'wrongpass'
      }
    })

    expect(response.status()).toBe(401)
  })
})

test.describe('File Upload Flow', () => {
  test.beforeAll(async () => {
    // Setup: create and login a test user
    // In a real scenario, this would be handled by test setup
  })

  test('should upload a file', async ({ request }: { request: any }) => {
    // Create test user and get token
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        username: `upload_test_${Date.now()}`,
        password: TEST_PASSWORD,
        email: `upload_test_${Date.now()}@example.com`
      }
    })

    const registerBody = await registerRes.json()
    const token = registerBody.data.token

    // Create test file content
    const fileContent = Buffer.from('Test file content for archive')

    // Upload file
    const uploadRes = await request.post(`${API_URL}/api/files/upload`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      multipart: {
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: fileContent
        },
        description: 'Test file upload',
        accessLevel: 'private'
      }
    })

    expect(uploadRes.status()).toBe(201)
    const uploadBody = await uploadRes.json()
    expect(uploadBody.success).toBe(true)
    expect(uploadBody.data.id).toBeTruthy()
    expect(uploadBody.data.file_hash).toBeTruthy()
  })

  test('should reject upload without auth', async ({ request }: { request: any }) => {
    const fileContent = Buffer.from('Unauthorized content')

    const uploadRes = await request.post(`${API_URL}/api/files/upload`, {
      multipart: {
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: fileContent
        }
      }
    })

    expect(uploadRes.status()).toBe(401)
  })
})

test.describe('File Operations', () => {
  let fileId = ''
  let userToken = ''

  test.beforeAll(async ({ request }: { request: any }) => {
    // Create test user
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        username: `ops_test_${Date.now()}`,
        password: TEST_PASSWORD,
        email: `ops_test_${Date.now()}@example.com`
      }
    })
    const registerBody = await registerRes.json()
    userToken = registerBody.data.token

    // Upload a test file
    const fileContent = Buffer.from('Content for operations test')
    const uploadRes = await request.post(`${API_URL}/api/files/upload`, {
      headers: { Authorization: `Bearer ${userToken}` },
      multipart: {
        file: {
          name: 'ops_test.txt',
          mimeType: 'text/plain',
          buffer: fileContent
        }
      }
    })
    const uploadBody = await uploadRes.json()
    fileId = uploadBody.data.id
  })

  test('should download a file', async ({ request }: { request: any }) => {
    const downloadRes = await request.get(`${API_URL}/api/files/${fileId}/download`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(downloadRes.status()).toBe(200)
    expect(downloadRes.headers()['content-type']).toContain('text')
  })

  test('should get file metadata', async ({ request }: { request: any }) => {
    const getRes = await request.get(`${API_URL}/api/files/${fileId}`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(getRes.status()).toBe(200)
    const body = await getRes.json()
    expect(body.data.id).toBe(fileId)
  })

  test('should update file metadata', async ({ request }: { request: any }) => {
    const updateRes = await request.put(`${API_URL}/api/files/${fileId}/metadata`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      },
      data: {
        dublinCore: {
          title: 'Updated Title',
          description: 'Updated description'
        }
      }
    })

    expect(updateRes.status()).toBe(200)
  })

  test('should delete (soft delete) a file', async ({ request }: { request: any }) => {
    const deleteRes = await request.delete(`${API_URL}/api/files/${fileId}`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      },
      data: {
        reason: 'Test deletion'
      }
    })

    expect(deleteRes.status()).toBe(200)

    // Verify file is marked as not accessible
    const checkRes = await request.get(`${API_URL}/api/files/${fileId}`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    const body = await checkRes.json()
    expect(body.data.is_accessible).toBe(false)
  })

  test('should restore a deleted file', async ({ request }: { request: any }) => {
    // Delete first
    await request.delete(`${API_URL}/api/files/${fileId}`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      },
      data: {
        reason: 'Test for restoration'
      }
    })

    // Then restore
    const restoreRes = await request.post(`${API_URL}/api/files/${fileId}/restore`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(restoreRes.status()).toBe(200)

    // Verify restored
    const checkRes = await request.get(`${API_URL}/api/files/${fileId}`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    const body = await checkRes.json()
    expect(body.data.is_accessible).toBe(true)
  })
})

test.describe('Fixity Verification', () => {
  let fileId = ''
  let userToken = ''

  test.beforeAll(async ({ request }: { request: any }) => {
    // Setup: create user and upload file
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        username: `fixity_test_${Date.now()}`,
        password: TEST_PASSWORD,
        email: `fixity_test_${Date.now()}@example.com`
      }
    })
    const registerBody = await registerRes.json()
    userToken = registerBody.data.token

    const fileContent = Buffer.from('Content to verify integrity')
    const uploadRes = await request.post(`${API_URL}/api/files/upload`, {
      headers: { Authorization: `Bearer ${userToken}` },
      multipart: {
        file: {
          name: 'fixity_test.txt',
          mimeType: 'text/plain',
          buffer: fileContent
        }
      }
    })
    const uploadBody = await uploadRes.json()
    fileId = uploadBody.data.id
  })

  test('should verify file integrity', async ({ request }: { request: any }) => {
    const verifyRes = await request.post(`${API_URL}/api/files/${fileId}/fixity/verify`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(verifyRes.status()).toBe(200)
    const body = await verifyRes.json()
    expect(body.success).toBe(true)
    expect(body.data.isValid).toBe(true)
  })

  test('should get fixity report', async ({ request }: { request: any }) => {
    const reportRes = await request.get(`${API_URL}/api/files/${fileId}/fixity`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(reportRes.status()).toBe(200)
    const body = await reportRes.json()
    expect(body.data.fileId).toBe(fileId)
    expect(body.data.status).toBeDefined()
  })
})

test.describe('Search Functionality', () => {
  let userToken = ''

  test.beforeAll(async ({ request }: { request: any }) => {
    // Create test user
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        username: `search_test_${Date.now()}`,
        password: TEST_PASSWORD,
        email: `search_test_${Date.now()}@example.com`
      }
    })
    const registerBody = await registerRes.json()
    userToken = registerBody.data.token
  })

  test('should search files', async ({ request }: { request: any }) => {
    const searchRes = await request.get(`${API_URL}/api/files/search?q=test&limit=10`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(searchRes.status()).toBe(200)
    const body = await searchRes.json()
    expect(Array.isArray(body.data) || body.data === null).toBe(true)
  })

  test('should get recent files', async ({ request }: { request: any }) => {
    const recentRes = await request.get(`${API_URL}/api/files/recent?limit=20`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(recentRes.status()).toBe(200)
    const body = await recentRes.json()
    expect(Array.isArray(body.data)).toBe(true)
  })

  test('should get file statistics', async ({ request }: { request: any }) => {
    const statsRes = await request.get(`${API_URL}/api/files/stats`, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    })

    expect(statsRes.status()).toBe(200)
    const body = await statsRes.json()
    expect(body.data).toBeDefined()
  })
})
