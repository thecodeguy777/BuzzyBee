// BuzzyBee Workstation — schema setup script
// Applies all SQL files in supabase/migrations/ against the shared Supabase project.
//
// Usage (Windows):
//   set WS_NO_BUFFER_UTIL=1 && set SUPABASE_DB_URL="postgresql://..." && node scripts/buzzybee-setup.mjs
//
// Or put SUPABASE_DB_URL in a .env file and run:
//   set WS_NO_BUFFER_UTIL=1 && node scripts/buzzybee-setup.mjs
//
// Find the connection string at:
//   Supabase dashboard → Project Settings → Database → Connection string → URI
//   Use the "Session" pooler (port 5432) — required for DDL.
//
// Idempotent: safe to re-run.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const migrationsDir = join(repoRoot, 'supabase', 'migrations')

loadEnv({ path: join(repoRoot, '.env') })
loadEnv({ path: join(repoRoot, '.env.local') })

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL.')
  console.error('Set it in .env or pass inline:')
  console.error('  SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"')
  process.exit(1)
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.error(`No .sql files in ${migrationsDir}`)
  process.exit(1)
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
})

await client.connect()
console.log(`Connected. Applying ${files.length} migration(s)…\n`)

try {
  for (const file of files) {
    const path = join(migrationsDir, file)
    const sql = readFileSync(path, 'utf8')
    process.stdout.write(`  ${file} … `)
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('commit')
      console.log('ok')
    } catch (err) {
      await client.query('rollback')
      console.log('FAILED')
      throw err
    }
  }
  console.log('\nAll migrations applied.')
} finally {
  await client.end()
}
