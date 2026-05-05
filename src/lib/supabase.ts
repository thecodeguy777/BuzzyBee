import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
// Supabase renamed "anon key" → "publishable key" in 2025. Both are the same
// public client-side credential, just different prefixes (eyJ… vs sb_publishable_…).
// Accept either env-var name so the app works regardless of which naming the
// project's Supabase dashboard uses.
const anon =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !anon) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.'
  )
}

// All Workstation tables live in the `buzzybee` schema. The schema must be
// listed under Project Settings → API → Exposed schemas for PostgREST to
// reach it.
export const supabase = createClient(url, anon, {
  db: { schema: 'buzzybee' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    // Offload heartbeat to a Web Worker so a backgrounded tab's
    // throttling can't kill the realtime connection.
    worker: true,
    // Detect silent disconnects via the heartbeat callback.
    // Supabase pings every ~25s — if a heartbeat fails, reconnect.
    heartbeatCallback: (status) => {
      if (status === 'disconnected' || status === 'error' || status === 'timeout') {
        console.log('[Supabase] Heartbeat lost — reconnecting:', status)
        supabase.realtime.connect()
      }
    }
  }
})
