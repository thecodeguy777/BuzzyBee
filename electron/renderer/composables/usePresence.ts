import { ref, watch, onUnmounted, computed } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase, supabaseSession } from '../lib/supabase-client'

// Generic Supabase Presence wrapper.
// Joins a named channel, tracks the current user with a reactive payload,
// and exposes `all` / `others` of the connected clients in real time.
//
// Use a dedicated channel per surface — one global ("ops:online"), one
// per lead detail view ("lead:<id>"), etc. Channels are cheap; each tracks
// independently and clears on disconnect.

export interface PresenceUser {
  userId: string
  email: string | null
  fullName: string | null
  ref: string                       // Supabase presence_ref (per-connection)
  joinedAt: number
  // Surface-specific extras passed in via payload
  [key: string]: any
}

export function usePresence(
  channelName: string,
  payloadFactory: () => Record<string, any> = () => ({}),
) {
  const all = ref<PresenceUser[]>([])
  let channel: RealtimeChannel | null = null
  let unsubed = false

  const me = computed(() => supabaseSession.value?.userId ?? null)
  const others = computed(() => all.value.filter(u => u.userId !== me.value))
  const isOnline = (userId: string) => all.value.some(u => u.userId === userId)

  function readState() {
    if (!channel) return
    const state = channel.presenceState() as Record<string, any[]>
    // Dedupe by userId — one user with multiple windows shouldn't appear
    // multiple times in the avatar strip. Merge surface-specific flags
    // (e.g., editingField) across their connections so an "editing" signal
    // from any of their windows propagates.
    const byUser = new Map<string, PresenceUser>()
    for (const userKey of Object.keys(state)) {
      for (const p of state[userKey]) {
        const id: string = p.userId ?? userKey
        const existing = byUser.get(id)
        if (!existing) {
          byUser.set(id, {
            userId: id,
            email: p.email ?? null,
            fullName: p.fullName ?? null,
            ref: p.presence_ref,
            joinedAt: p.joinedAt ?? Date.now(),
            ...p,
          })
        } else {
          // Prefer the entry with a real editingField if any connection has it.
          if (p.editingField && !existing.editingField) {
            existing.editingField = p.editingField
          }
          // Take the earliest joinedAt across connections.
          if ((p.joinedAt ?? Infinity) < (existing.joinedAt ?? Infinity)) {
            existing.joinedAt = p.joinedAt
          }
        }
      }
    }
    all.value = Array.from(byUser.values())
  }

  async function start() {
    if (channel || unsubed) return
    const client = await getSupabase()
    const session = supabaseSession.value
    if (!client || !session) return

    channel = client.channel(channelName, {
      config: { presence: { key: session.userId } },
    })

    channel
      .on('presence', { event: 'sync' }, readState)
      .on('presence', { event: 'join' }, readState)
      .on('presence', { event: 'leave' }, readState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && channel && !unsubed) {
          await channel.track({
            userId: session.userId,
            email: session.email,
            fullName: null,
            joinedAt: Date.now(),
            ...payloadFactory(),
          })
        }
      })
  }

  function stop() {
    if (channel) {
      try { channel.untrack() } catch {}
      try { channel.unsubscribe() } catch {}
      channel = null
    }
  }

  // Start when session resolves (or immediately if already)
  watch(supabaseSession, (s) => {
    if (s && !channel) start()
    else if (!s && channel) stop()
  }, { immediate: true })

  // Re-track on payload changes — Vue tracks reactive reads inside payloadFactory
  watch(() => payloadFactory(), async (newPayload) => {
    if (!channel || unsubed) return
    const session = supabaseSession.value
    if (!session) return
    await channel.track({
      userId: session.userId,
      email: session.email,
      fullName: null,
      joinedAt: Date.now(),
      ...newPayload,
    })
  }, { deep: true })

  onUnmounted(() => {
    unsubed = true
    stop()
  })

  return {
    all,
    others,
    me,
    isOnline,
  }
}
