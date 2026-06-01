// IPC channels for the cross-window Supabase auth bridge.
//
// Main process owns the canonical Supabase auth session (persisted in
// electron-store, refreshed on its own). Renderers (control + dialer)
// each create their own Supabase client for queries + realtime, and use
// these channels to pull the session tokens from main and listen for
// refreshes.
//
// Kept in its own file so the auth bridge doesn't conflict with the
// in-flight changes to ipc-channels.ts.

export const SUPABASE_IPC = {
  // renderer → main (invoke)
  GET_CONFIG: 'supabase:get-config',     // returns { url, anonKey }
  GET_TOKENS: 'supabase:get-tokens',     // returns { accessToken, refreshToken } | null

  // main → renderer (send) — broadcast on every auth state change
  TOKENS_CHANGED: 'supabase:tokens-changed',
} as const

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export interface SupabaseTokens {
  accessToken: string
  refreshToken: string
  userId: string
  email: string | null
  expiresAt: number  // unix seconds
}
