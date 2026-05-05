// One-shot script to create PM accounts via Supabase Admin API.
// Uses the service-role / sb_secret key (NEVER ship this to the client).
//
// Usage:
//   node scripts/create-pm-accounts.mjs <SB_SECRET_KEY>
//
// The buzzybee.handle_new_user() trigger reads role + full_name from
// raw_user_meta_data, so passing them in user_metadata is enough — but we
// also explicitly upsert the profile afterwards as a belt-and-suspenders
// fallback in case the trigger ever drifts.

import { createClient } from '@supabase/supabase-js'

const url = 'https://bsjplzpoynsnluihmnul.supabase.co'
const key = process.argv[2] || process.env.SB_SECRET_KEY
if (!key) {
  console.error('Pass the sb_secret_… key as the first arg or via SB_SECRET_KEY env.')
  process.exit(1)
}

const auth = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
})
const bb = createClient(url, key, {
  db: { schema: 'buzzybee' },
  auth: { autoRefreshToken: false, persistSession: false }
})

const accounts = [
  {
    email: 'dennis@buzzybee.ph',
    password: 'BuzzyBee2026!',
    full_name: 'Dennis',
    role: 'pm'
  },
  {
    email: 'mark@buzzybee.ph',
    password: 'BuzzyBee2026!',
    full_name: 'Mark',
    role: 'pm'
  }
]

let created = 0
let updated = 0
let skipped = 0
let failed = 0

for (const a of accounts) {
  // 1. Try to create. If the email already exists, fall through and just
  //    update the profile role.
  const { data, error } = await auth.auth.admin.createUser({
    email: a.email,
    password: a.password,
    email_confirm: true,
    user_metadata: { full_name: a.full_name, role: a.role }
  })

  let userId = data?.user?.id ?? null

  if (error) {
    // already exists — look up the user
    if (
      error.message?.toLowerCase().includes('already') ||
      error.message?.toLowerCase().includes('registered')
    ) {
      const list = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const found = list.data?.users?.find((u) => u.email === a.email)
      if (found) {
        userId = found.id
        skipped++
        console.log(`[${a.email}] already exists (${found.id}) — keeping account, updating profile`)
      } else {
        failed++
        console.error(`[${a.email}] FAILED: ${error.message}`)
        continue
      }
    } else {
      failed++
      console.error(`[${a.email}] FAILED: ${error.message}`)
      continue
    }
  } else {
    created++
    console.log(`[${a.email}] created (${userId})`)
  }

  if (!userId) continue

  // 2. Ensure the buzzybee.profiles row reflects role + name
  const { error: pErr } = await bb
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: a.email,
        full_name: a.full_name,
        role: a.role
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single()
  if (pErr) {
    console.error(`  ↳ profile update failed: ${pErr.message}`)
    failed++
  } else {
    updated++
  }
}

console.log('---')
console.log(`Created: ${created}  ·  Profile updated: ${updated}  ·  Pre-existing: ${skipped}  ·  Failed: ${failed}`)
