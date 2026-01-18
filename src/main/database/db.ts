import { Pool, QueryResult, PoolClient } from 'pg'
// import path from 'path' // Not used - PostgreSQL used instead of SQLite
// import { app } from 'electron' // Not used - PostgreSQL used instead of SQLite

let pool: Pool | null = null

const getConnectionConfig = (): Record<string, unknown> => {
  const env = process.env.NODE_ENV || 'development'
  // dbPath removed - PostgreSQL used instead of SQLite in production

  // Production: use environment variables
  // Development: use SQLite via better-sqlite3 or PostgreSQL local
  if (env === 'production' || env === 'development') {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || (env === 'production' ? 'e_archiwum' : 'e_archiwum_dev'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: env === 'production' ? 20 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      application_name: 'e-archiwum'
    }
  } else {
    // Fallback for other environments (e.g., test)
    return {
      host: 'localhost',
      port: 5432,
      database: 'e_archiwum_test',
      user: 'postgres',
      password: 'postgres'
    }
  }
}

export const initializePool = async (): Promise<Pool> => {
  if (pool) return pool

  try {
    const config = getConnectionConfig()
    console.log(`Initializing database pool to ${config.database}...`)

    pool = new Pool(config)

    // Test connection
    const client = await pool.connect()
    await client.query('SELECT NOW()')
    client.release()

    console.log('Database connection pool initialized successfully')
    return pool
  } catch (error) {
    console.error('Failed to initialize database pool:', error)
    throw error
  }
}

export const getPool = (): Pool => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializePool first.')
  }
  return pool
}

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// Query execution with error handling
export const query = async <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values?: Array<unknown>
): Promise<QueryResult<T>> => {
  const client = await getPool().connect()
  try {
    return await client.query<T>(text, values)
  } catch (error) {
    console.error('Database query error:', error, { text, values })
    throw error
  } finally {
    client.release()
  }
}

// Transaction support
export const withTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Batch insert helper
export const batchInsert = async <T extends Record<string, unknown>>(
  table: string,
  columns: string[],
  rows: Array<Array<unknown>>,
  batchSize: number = 1000
): Promise<T[]> => {
  const results: T[] = []
  const columnStr = columns.join(', ')

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = batch
      .map((_row, idx) => {
        const paramIndexes = columns
          .map((_, colIdx) => `$${idx * columns.length + colIdx + 1}`)
          .join(', ')
        return `(${paramIndexes})`
      })
      .join(', ')

    const flatValues = batch.flat()
    const sql = `INSERT INTO ${table} (${columnStr}) VALUES ${values} RETURNING *`

    const result = await query<T>(sql, flatValues)
    results.push(...result.rows)
  }

  return results
}

export default {
  initializePool,
  getPool,
  closePool,
  query,
  withTransaction,
  batchInsert
}
