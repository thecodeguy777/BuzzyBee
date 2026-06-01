import { ref } from 'vue'
import { getSupabase, supabaseSession } from '../lib/supabase-client'

// Lazy-loaded profile cache. First call to getProfile(id) triggers a
// fetch; subsequent calls are synchronous from the cache. Vue reactivity
// re-renders any consumer once the fetch lands.
//
// Use:
//   const profiles = useProfiles()
//   profiles.displayName(event.actorUserId)
//
// Returns sensible fallbacks while waiting: 'Loading…' on first read,
// then the real name once cached.

export interface ProfileInfo {
  id: string
  fullName: string | null
  email: string | null
}

const cache = ref<Record<string, ProfileInfo>>({})
const inFlight = new Set<string>()
const notFound = new Set<string>()

async function fetchProfile(userId: string): Promise<void> {
  if (cache.value[userId] || inFlight.has(userId) || notFound.has(userId)) return
  inFlight.add(userId)
  try {
    const client = await getSupabase()
    if (!client) { inFlight.delete(userId); return }
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.error('[useProfiles] fetch failed:', error)
      return
    }
    if (data) {
      cache.value = {
        ...cache.value,
        [userId]: {
          id: (data as any).id,
          fullName: (data as any).full_name ?? null,
          email: (data as any).email ?? null,
        },
      }
    } else {
      notFound.add(userId)
    }
  } finally {
    inFlight.delete(userId)
  }
}

export function useProfiles() {
  /** Returns the cached profile, kicks off a background fetch if missing. */
  function getProfile(userId: string | null | undefined): ProfileInfo | null {
    if (!userId) return null
    if (!cache.value[userId]) fetchProfile(userId)
    return cache.value[userId] ?? null
  }

  /**
   * Display-ready name. Resolution order:
   *   1. cached profile.full_name
   *   2. cached profile.email (local part)
   *   3. if userId matches current session, use session's email local part
   *   4. fallback (default 'Someone')
   */
  function displayName(userId: string | null | undefined, fallback = 'Someone'): string {
    if (!userId) return 'System'
    const p = getProfile(userId)
    if (p?.fullName) return p.fullName
    if (p?.email) return p.email.split('@')[0]
    // Self fallback — we know our own email from the session even without
    // a profile fetch, so users never see "Someone" for themselves.
    if (supabaseSession.value?.userId === userId) {
      const email = supabaseSession.value.email
      if (email) return email.split('@')[0]
    }
    return fallback
  }

  return { getProfile, displayName, cache }
}
