#!/usr/bin/env node

/**
 * Migration runner for e-Archiwum
 * Usage: node run-migrations.js [environment]
 * Example: node run-migrations.js development
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const environment = process.argv[2] || 'development'

// Database config
const config =
  environment === 'production'
    ? {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'e_archiwum',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
      }
    : {
        host: 'localhost',
        port: 5432,
        database: 'e_archiwum_dev',
        user: 'postgres',
        password: 'postgres'
      }

async function runMigrations() {
  const client = new Client(config)

  try {
    console.log(`[${environment}] Connecting to database...`)
    await client.connect()
    console.log('✓ Connected')

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'src/main/database/migrations')
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    console.log(`\nFound ${migrationFiles.length} migration(s):`)
    migrationFiles.forEach((m) => console.log(`  - ${m}`))

    // Create migrations tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Get already applied migrations
    const result = await client.query('SELECT name FROM migrations ORDER BY applied_at')
    const appliedMigrations = new Set(result.rows.map((r) => r.name))

    console.log(`\nAlready applied: ${appliedMigrations.size}`)
    if (appliedMigrations.size > 0) {
      appliedMigrations.forEach((m) => console.log(`  ✓ ${m}`))
    }

    // Run pending migrations
    const pendingMigrations = migrationFiles.filter((f) => !appliedMigrations.has(f))
    console.log(`\nPending: ${pendingMigrations.length}`)

    if (pendingMigrations.length === 0) {
      console.log('All migrations up to date!')
      await client.end()
      process.exit(0)
    }

    for (const migrationFile of pendingMigrations) {
      console.log(`\n▶ Running: ${migrationFile}`)
      const migrationPath = path.join(migrationsDir, migrationFile)
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

      try {
        await client.query(migrationSQL)
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [migrationFile])
        console.log(`  ✓ ${migrationFile} applied`)
      } catch (error) {
        console.error(`  ✗ ${migrationFile} failed:`, error.message)
        throw error
      }
    }

    console.log('\n✓ All migrations applied successfully!')
    await client.end()
    process.exit(0)
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message)
    await client.end()
    process.exit(1)
  }
}

runMigrations()
