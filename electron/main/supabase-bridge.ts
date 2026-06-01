import { ipcMain, BrowserWindow } from 'electron'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Store from 'electron-store'
import { SUPABASE_IPC, type SupabaseConfig, type SupabaseTokens } from '../shared/ipc-channels-supabase'

// SINGLE main-process Supabase client. Owns:
//   - Auth (electron-store persisted, with autoRefreshToken)
//   - Bridge to renderers (broadcasts tokens on every auth state change)
//   - Server-side reads (used by supabase-sync.ts via getMainSupabaseClient)
//
// Renderers create their own clients (real WebSocket for realtime, since
// Node 20 lacks ws — main's transport is stubbed). They get session tokens
// from this bridge via IPC and replay them onto their own auth.
//
// Renderers call GET_CONFIG once to get URL+anon key, then GET_TOKENS to
// pull the current session, then listen on TOKENS_CHANGED to know when
// to refresh their session.

const SUPABASE_URL = 'https://bsjplzpoynsnluihmnul.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_ML1dsNqpypvT84J-U4w6Rw_0UA4iycp'

const store = new Store()

let mainClient: SupabaseClient | null = null

/**
 * The single authoritative Supabase client for the main process.
 * supabase-sync.ts (sign in/out, queries) and this bridge both use this
 * — so onAuthStateChange fires exactly once per real auth change.
 */
export function getMainSupabaseClient(): SupabaseClient {
  if (mainClient) return mainClient
  mainClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'buzzybee' as never },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: {
        getItem: (key: string) => (store.get(`auth_${key}`) as string | undefined) ?? null,
        setItem: (key: string, value: string) => store.set(`auth_${key}`, value),
        removeItem: (key: string) => store.delete(`auth_${key}` as never),
      },
    },
    realtime: {
      transport: class StubSocket {
        constructor() { /* no-op */ }
        connect() { /* no-op */ }
        disconnect() { /* no-op */ }
        send() { /* no-op */ }
        addEventListener() { /* no-op */ }
        removeEventListener() { /* no-op */ }
      } as any,
    },
  })
  return mainClient
}

function broadcastTokens(tokens: SupabaseTokens | null) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send(SUPABASE_IPC.TOKENS_CHANGED, tokens)
    } catch (err) {
      console.error('[supabase-bridge] broadcast failed:', err)
    }
  }
}

async function readTokensFromClient(): Promise<SupabaseTokens | null> {
  try {
    const client = getMainSupabaseClient()
    const { data } = await client.auth.getSession()
    if (!data.session) return null
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      userId: data.session.user.id,
      email: data.session.user.email ?? null,
      expiresAt: data.session.expires_at ?? 0,
    }
  } catch (err) {
    console.error('[supabase-bridge] read tokens failed:', err)
    return null
  }
}

export function registerSupabaseBridge(): void {
  const client = getMainSupabaseClient()

  // Subscribe to auth state changes (sign-in, sign-out, token refresh)
  // and push the new tokens to every renderer.
  client.auth.onAuthStateChange((_event, session) => {
    const tokens: SupabaseTokens | null = session
      ? {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          userId: session.user.id,
          email: session.user.email ?? null,
          expiresAt: session.expires_at ?? 0,
        }
      : null
    broadcastTokens(tokens)
  })

  // IPC: renderer asks for static config (URL + anon key)
  ipcMain.handle(SUPABASE_IPC.GET_CONFIG, (): SupabaseConfig => ({
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  }))

  // IPC: renderer asks for the current session tokens
  ipcMain.handle(SUPABASE_IPC.GET_TOKENS, () => readTokensFromClient())
}
