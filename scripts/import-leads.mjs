// One-shot lead import for HiveMind dialer.
//
// Reads three CSV files (realtor / enterprise construction / commercial retail),
// normalizes each per-format, dedupes by phone, and bulk-inserts into
// buzzybee.dialer_leads using direct postgres (bypasses RLS via service connection).
//
// Usage (Windows PowerShell):
//   $env:WS_NO_BUFFER_UTIL=1; node scripts/import-leads.mjs
//
// Requires SUPABASE_DB_URL in .env or .env.local (same as buzzybee-setup.mjs).
//
// Idempotent: existing phone numbers are skipped automatically.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

loadEnv({ path: join(repoRoot, '.env') })
loadEnv({ path: join(repoRoot, '.env.local') })

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL in .env or .env.local')
  process.exit(1)
}

// ── File registry ────────────────────────────────────────────────
// Edit paths here if files move. Each entry declares which normalizer
// to use and what `source` tag to apply for downstream filtering.

const downloads = 'C:\\Users\\mary\\Downloads'
const FILES = [
  {
    path: join(downloads, 'Real Estate Keller Williams Contact Leads - emails-for-kw-com-1548018.csv'),
    source: 'kw-realtor-2026-05',
    normalizer: 'realtor',
    label: 'KW Realtors',
  },
  {
    path: join(downloads, 'Enterprise Leads - Sheet1.csv'),
    source: 'enterprise-construction-2026-05',
    normalizer: 'construction',
    label: 'Construction Enterprises',
  },
  {
    path: join(downloads, 'Commercial Leads - Sheet1.csv'),
    source: 'commercial-fl-retail-2026-05',
    normalizer: 'retail',
    label: 'FL Commercial Retail',
  },
]

// ── CSV parser (RFC 4180-ish, handles quoted fields with commas) ─

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (c === '"') { inQuotes = false; i++; continue }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c?.trim()))
}

// ── Phone normalization ─────────────────────────────────────────
// US default: 10 digits → +1XXXXXXXXXX. Already-prefixed strings preserved.

function toE164(raw) {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '')
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return '+' + digits
}

function isValidE164(p) {
  if (!p) return false
  return /^\+\d{10,15}$/.test(p)
}

// ── Per-file normalizers ────────────────────────────────────────
// Each returns an array of { fullName, phoneE164, email, company, notes, source }.

function normalizeRealtor(rows) {
  // Headers: First name, Last name, Phone number, Email address, Position, Organization, Domain name, Type
  const out = []
  for (let r = 1; r < rows.length; r++) {
    const [first, last, phone, email, position, org] = rows[r]
    const fullName = [first, last].map(s => (s ?? '').trim()).filter(Boolean).join(' ')
    if (!fullName || !phone) continue
    const p = toE164(phone)
    if (!isValidE164(p)) continue
    const notes = position?.trim() ? `Role: ${position.trim()}` : null
    out.push({
      fullName,
      phoneE164: p,
      email: email?.trim() || null,
      company: org?.trim() || null,
      notes,
    })
  }
  return out
}

function normalizeConstruction(rows) {
  // Headers: Business Name, Contact Person, Address, City, State, Zip-Code, Business Description, Phone number
  const out = []
  for (let r = 1; r < rows.length; r++) {
    const [biz, contact, _addr, city, state, _zip, desc, phone] = rows[r]
    const fullName = (contact ?? '').trim()
    if (!fullName || !phone) continue
    const p = toE164(phone)
    if (!isValidE164(p)) continue
    const noteParts = []
    if (desc?.trim()) noteParts.push(desc.trim())
    if (city?.trim() || state?.trim()) noteParts.push(`Location: ${[city, state].filter(Boolean).join(', ')}`)
    out.push({
      fullName,
      phoneE164: p,
      email: null,
      company: biz?.trim() || null,
      notes: noteParts.length ? noteParts.join(' — ') : null,
    })
  }
  return out
}

function normalizeRetail(rows) {
  // Headers: FIRM NAME, OWNER NAME, ADDRESS, CITY, COUNTY, ZIP, BUSINESS TYPE, AREA CODE, PHONE, EMAIL
  const out = []
  for (let r = 1; r < rows.length; r++) {
    const [firm, owner, _addr, city, county, _zip, bizType, area, phoneNum, email] = rows[r]
    const ownerRaw = (owner ?? '').trim()
    if (!ownerRaw || ownerRaw === '.') continue
    // Owner format: "LAST, FIRST" → "First Last"
    let fullName = ownerRaw
    if (ownerRaw.includes(',')) {
      const [last, ...rest] = ownerRaw.split(',').map(s => s.trim())
      fullName = [rest.join(' '), last].filter(Boolean).join(' ').trim()
    }
    // Title case (data is ALL CAPS)
    fullName = fullName.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    const phoneCombined = ((area ?? '').trim() + (phoneNum ?? '').trim()).trim()
    if (!phoneCombined) continue
    const p = toE164(phoneCombined)
    if (!isValidE164(p)) continue
    const company = (firm ?? '').trim()
      ? firm.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
      : null
    const noteParts = []
    if (bizType?.trim()) noteParts.push(`Type: ${bizType.trim()}`)
    if (city?.trim() || county?.trim()) noteParts.push(`Location: ${[city, county].filter(Boolean).join(', ')}`)
    out.push({
      fullName,
      phoneE164: p,
      email: email?.trim() || null,
      company,
      notes: noteParts.length ? noteParts.join(' — ') : null,
    })
  }
  return out
}

const NORMALIZERS = {
  realtor: normalizeRealtor,
  construction: normalizeConstruction,
  retail: normalizeRetail,
}

// ── Main ─────────────────────────────────────────────────────────

const client = new pg.Client({ connectionString })
await client.connect()
console.log('Connected to Supabase\n')

// Pull existing phones once (so re-runs are idempotent and cross-file dedup works)
const existing = await client.query('select phone_e164 from buzzybee.dialer_leads')
const existingPhones = new Set(existing.rows.map(r => r.phone_e164))
console.log(`Existing leads in DB: ${existingPhones.size}\n`)

const seenInThisRun = new Set()
let grandInserted = 0
let grandSkipped = 0
let grandInvalid = 0

for (const file of FILES) {
  console.log(`── ${file.label} (${file.source}) ──`)
  if (!existsSync(file.path)) {
    console.log(`  ✗ File not found: ${file.path}\n`)
    continue
  }

  const text = readFileSync(file.path, 'utf8')
  const rows = parseCsv(text)
  console.log(`  CSV rows: ${rows.length - 1} data lines`)

  const normalized = NORMALIZERS[file.normalizer](rows)
  console.log(`  Valid after normalization: ${normalized.length}`)
  const invalid = (rows.length - 1) - normalized.length
  grandInvalid += invalid

  // Dedupe against existing DB + against earlier files in this run
  const toInsert = []
  let skipped = 0
  for (const r of normalized) {
    if (existingPhones.has(r.phoneE164) || seenInThisRun.has(r.phoneE164)) {
      skipped++
      continue
    }
    seenInThisRun.add(r.phoneE164)
    toInsert.push({ ...r, source: file.source })
  }
  console.log(`  Skipped as duplicate: ${skipped}`)
  console.log(`  To insert: ${toInsert.length}`)

  // Batch insert (500/batch — well under any postgres limit, fast enough)
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH)
    const values = []
    const params = []
    let p = 1
    for (const row of chunk) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, 'new', 'lead', 0, now(), now(), now())`)
      params.push(
        randomUUID(),
        row.fullName,
        row.phoneE164,
        row.email,
        row.company,
        row.notes,
        row.source,
      )
    }
    const sql = `
      insert into buzzybee.dialer_leads
        (id, full_name, phone_e164, email, company, notes, source,
         status, stage, call_count, stage_changed_at, created_at, updated_at)
      values ${values.join(',')}
    `
    try {
      const res = await client.query(sql, params)
      inserted += res.rowCount
    } catch (err) {
      console.error(`  ✗ Batch ${i / BATCH + 1} failed:`, err.message)
      // Surface first conflict-shape problems clearly so user can fix
      throw err
    }
  }
  console.log(`  ✓ Inserted: ${inserted}\n`)
  grandInserted += inserted
  grandSkipped += skipped
}

console.log('──────────────────────────────────')
console.log(`Total inserted: ${grandInserted}`)
console.log(`Total skipped (duplicates): ${grandSkipped}`)
console.log(`Total invalid (missing name/phone or bad format): ${grandInvalid}`)
console.log('──────────────────────────────────\n')

await client.end()
console.log('Done.')
