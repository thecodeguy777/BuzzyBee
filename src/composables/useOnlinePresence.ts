/**
 * useOnlinePresence — who has the app open right now, system-wide.
 *
 * BROADCAST heartbeats with a TTL, not Supabase presence-sync: presence proved
 * flaky for exactly this kind of indicator (see useHuddlePresence, which was
 * rebuilt the same way — commit "drive huddle indicators by heartbeat+TTL").
 * Every authenticated client pings { user, role, path } every 10s on one
 * global channel; entries older than 25s prune out. Self-reception is on, so
 * your own row doubles as a connection health check.
 *
 * Distinct from useHivePresence ("on the clock" via running time entries) —
 * this is "in the building".
 */

import { computed, effectScope, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const HEARTBEAT_MS = 10_000
const TTL_MS = 25_000
const PRUNE_MS = 5_000

export interface OnlineUser {
  user_id: string
  name: string
  role: string
  avatar_url: string | null
  /** Route they're currently on (re-broadcast on navigation). */
  path: string
  /** ISO timestamp of when this session joined. */
  at: string
}

const online = ref<Record<string, OnlineUser>>({})
const ready = ref(false)

let channel: RealtimeChannel | null = null
let trackedFor: string | null = null
let subscribed = false
let currentPath = '/app'
let joinedAt: string | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | undefined
let pruneTimer: ReturnType<typeof setInterval> | undefined
// user_id → last heartbeat wall-clock, pruned past TTL.
const lastSeen: Record<string, number> = {}

function payload(userId: string): OnlineUser {
  const auth = useAuthStore()
  return {
    user_id: userId,
    name: auth.fullName || auth.user?.email || 'Someone',
    role: auth.role,
    avatar_url: auth.profile?.avatar_url ?? null,
    path: currentPath,
    at: joinedAt ?? new Date().toISOString(),
  }
}

function ping() {
  if (!channel || !subscribed || !trackedFor) return
  void channel.send({ type: 'broadcast', event: 'online', payload: payload(trackedFor) })
}

/** Call on navigation — updates everyone else's view of where you are. */
export function reportPath(path: string) {
  currentPath = path
  ping()
}

function onPing(p: OnlineUser | undefined) {
  if (!p?.user_id) return
  lastSeen[p.user_id] = Date.now()
  const existing = online.value[p.user_id]
  online.value = {
    ...online.value,
    // Newest ping wins (path, name), earliest join survives ("online since").
    [p.user_id]: existing && existing.at < p.at ? { ...p, at: existing.at } : p,
  }
  ready.value = true
}

function onBye(userId: string | undefined) {
  if (!userId) return
  delete lastSeen[userId]
  if (online.value[userId]) {
    const next = { ...online.value }
    delete next[userId]
    online.value = next
  }
}

function prune() {
  const cutoff = Date.now() - TTL_MS
  const stale = Object.keys(online.value).filter((id) => (lastSeen[id] ?? 0) < cutoff)
  if (!stale.length) return
  const next = { ...online.value }
  for (const id of stale) {
    delete next[id]
    delete lastSeen[id]
  }
  online.value = next
}

function onVisible() {
  if (document.visibilityState === 'visible') {
    ping()
    prune()
  }
}

async function start(userId: string) {
  if (channel && trackedFor === userId) return
  await stop() // supabase-js caches channels by topic — never race a teardown
  trackedFor = userId
  joinedAt = new Date().toISOString()

  const ch = supabase.channel('bb-online', { config: { broadcast: { self: true } } })
  ch.on('broadcast', { event: 'online' }, (m: { payload?: unknown }) => onPing(m.payload as OnlineUser | undefined))
  ch.on('broadcast', { event: 'bye' }, (m: { payload?: unknown }) => onBye((m.payload as { user_id?: string } | undefined)?.user_id))
  ch.subscribe((status) => {
    subscribed = status === 'SUBSCRIBED'
    // Announce on every (re)join so a reconnect can't lose us.
    if (subscribed) ping()
  })
  channel = ch

  heartbeatTimer = setInterval(ping, HEARTBEAT_MS)
  pruneTimer = setInterval(prune, PRUNE_MS)
  document.addEventListener('visibilitychange', onVisible)
}

async function stop() {
  if (channel && subscribed && trackedFor) {
    // Best-effort goodbye — TTL catches the rest.
    try {
      await channel.send({ type: 'broadcast', event: 'bye', payload: { user_id: trackedFor } })
    } catch { /* ignore */ }
  }
  trackedFor = null
  joinedAt = null
  subscribed = false
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = undefined }
  if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = undefined }
  document.removeEventListener('visibilitychange', onVisible)
  if (channel) {
    try { await supabase.removeChannel(channel) } catch { /* ignore */ }
    channel = null
  }
  online.value = {}
  for (const k of Object.keys(lastSeen)) delete lastSeen[k]
  ready.value = false
}

// Wire exactly once, in a detached scope: components call this during setup —
// often BEFORE the session has restored — so joining must be reactive to auth
// and survive any individual component unmounting.
let wired = false
function wire() {
  if (wired) return
  wired = true
  const scope = effectScope(true) // detached — never disposed
  scope.run(() => {
    const auth = useAuthStore()
    watch(
      () => auth.user?.id ?? null,
      (id) => {
        if (id) void start(id)
        else void stop()
      },
      { immediate: true },
    )
    // The profile (name/role/avatar) loads after the session — re-announce
    // when it lands so the list doesn't show fallbacks.
    watch(
      () => [auth.profile?.full_name, auth.profile?.role, auth.profile?.avatar_url],
      () => ping(),
    )
  })
}

export function useOnlinePresence() {
  wire()

  const list = computed(() =>
    Object.values(online.value).sort((a, b) => a.name.localeCompare(b.name)))
  const count = computed(() => list.value.length)

  return { online, list, count, ready, start, stop }
}
