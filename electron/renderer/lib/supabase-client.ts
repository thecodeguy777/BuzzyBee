import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ref } from 'vue'
import type { SupabaseConfig, SupabaseTokens } from '../../shared/ipc-channels-supabase'

// Renderer-side Supabase client.
//
// One singleton per renderer (control window has its own, dialer window has
// its own). Each pulls config + session tokens from main via the auth bridge,
// then handles its own realtime subscriptions (browser WebSocket, fully
// supported in renderers — unlike main process where ws is stubbed).
//
// API exposure:
//   - control window: `window.electronAPI.supabase.*`
//   - dialer window:  `window.dialerAPI.supabase.*`
// We probe both at runtime so the same module works in either context.

interface SupabaseBridgeAPI {
  getConfig: () => Promise<SupabaseConfig>
  getTokens: () => Promise<SupabaseTokens | null>
  onTokensChanged: (cb: (tokens: SupabaseTokens | null) => void) => void
}

function findBridge(): SupabaseBridgeAPI | null {
  const w = window as any
  return w.electronAPI?.supabase
    ?? w.dialerAPI?.supabase
    ?? null
}

let cachedClient: SupabaseClient | null = null
let initPromise: Promise<SupabaseClient | null> | null = null

export const supabaseSession = ref<SupabaseTokens | null>(null)
export const supabaseReady = ref(false)

async function initClient(): Promise<SupabaseClient | null> {
  const bridge = findBridge()
  if (!bridge) {
    console.warn('[supabase-client] No bridge available — Supabase features disabled.')
    return null
  }

  const config = await bridge.getConfig()
  const client = createClient(config.url, config.anonKey, {
    db: { schema: 'buzzybee' as never },
    auth: {
      persistSession: false,   // main process owns persistence
      autoRefreshToken: false, // main process drives refresh; we sync via bridge
      detectSessionInUrl: false,
    },
  })

  const initialTokens = await bridge.getTokens()
  if (initialTokens) {
    await client.auth.setSession({
      access_token: initialTokens.accessToken,
      refresh_token: initialTokens.refreshToken,
    })
    supabaseSession.value = initialTokens
  }

  // Stay in sync with main process auth state
  bridge.onTokensChanged((tokens) => {
    if (tokens) {
      client.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      }).catch(err => console.error('[supabase-client] setSession failed:', err))
      supabaseSession.value = tokens
    } else {
      client.auth.signOut().catch(() => {})
      supabaseSession.value = null
    }
  })

  supabaseReady.value = true
  return client
}

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient
  if (!initPromise) initPromise = initClient()
  cachedClient = await initPromise
  return cachedClient
}

/** Synchronous accessor — returns null until getSupabase() has resolved at
 *  least once. Use sparingly; prefer await getSupabase(). */
export function getSupabaseSync(): SupabaseClient | null {
  return cachedClient
}
