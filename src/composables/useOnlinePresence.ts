/**
 * useOnlinePresence — who has the app open right now, system-wide.
 *
 * Every authenticated client joins one global Supabase Presence channel and
 * tracks itself ({ user_id, name, role, at }). Presence state is ephemeral and
 * server-managed: close the tab and the entry evaporates. Module-level
 * singleton (one channel for the whole app), same pattern as useNotifications.
 *
 * Distinct from useHivePresence, which is "on the clock" (running time
 * entries) — this is "in the building".
 */

import { computed, ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export interface OnlineUser {
  user_id: string
  name: string
  role: string
  avatar_url: string | null
  /** Route they're currently on (re-tracked on navigation). */
  path: string
  /** ISO timestamp of when this session joined. */
  at: string
}

const online = ref<Record<string, OnlineUser>>({})
const ready = ref(false)
let channel: RealtimeChannel | null = null
let trackedFor: string | null = null
let currentPath = '/app'
let joinedAt: string | null = null
let subscribed = false

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

/** Call on navigation — updates everyone else's view of where you are. */
export function reportPath(path: string) {
  currentPath = path
  if (channel && subscribed && trackedFor) void channel.track(payload(trackedFor))
}

function syncFromState() {
  if (!channel) return
  const state = channel.presenceState<OnlineUser>()
  const next: Record<string, OnlineUser> = {}
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      if (!p.user_id) continue
      // Multiple tabs = multiple presences per person: report the NEWEST
      // tab's location, but keep the EARLIEST join as "online since".
      const existing = next[p.user_id]
      if (!existing) {
        next[p.user_id] = p
      } else {
        next[p.user_id] = {
          ...(p.at > existing.at ? p : existing),
          at: p.at < existing.at ? p.at : existing.at,
        }
      }
    }
  }
  online.value = next
  ready.value = true
}

function start(userId: string) {
  if (channel && trackedFor === userId) return
  void stop()
  trackedFor = userId
  joinedAt = new Date().toISOString()
  channel = supabase
    .channel('bb-online', { config: { presence: { key: userId } } })
    .on('presence', { event: 'sync' }, syncFromState)
    .on('presence', { event: 'join' }, syncFromState)
    .on('presence', { event: 'leave' }, syncFromState)
    .subscribe((status) => {
      subscribed = status === 'SUBSCRIBED'
      if (subscribed && trackedFor) void channel?.track(payload(trackedFor))
    })
}

async function stop() {
  trackedFor = null
  joinedAt = null
  subscribed = false
  if (channel) {
    try { await supabase.removeChannel(channel) } catch { /* ignore */ }
    channel = null
  }
  online.value = {}
  ready.value = false
}

export function useOnlinePresence() {
  const auth = useAuthStore()

  // Auto-join on first call when authenticated (watch handles later changes).
  if (auth.user?.id && trackedFor !== auth.user.id) start(auth.user.id)

  const list = computed(() =>
    Object.values(online.value).sort((a, b) => a.name.localeCompare(b.name)))
  const count = computed(() => list.value.length)

  return { online, list, count, ready, start, stop }
}
