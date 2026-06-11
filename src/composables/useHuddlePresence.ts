import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

/**
 * ONE global realtime topic for the workstation, carrying three signals:
 *
 *  • onlineUsers — via PRESENCE. Presence is right for "who is connected":
 *    it carries no claim beyond the connection itself, so it can't go stale.
 *
 *  • byChannel (huddle indicators) and viewersByChannel (who is sitting in
 *    which channel) — via BROADCAST heartbeats with a TTL. Presence proved
 *    wrong for claims like "I'm huddling on X": any missed "I left" (raced
 *    reconnect, dropped frame, dev hot-reload zombie) left a live connection
 *    serving a stale flag forever. Heartbeats invert the failure mode: every
 *    client pings its state every 10s, receivers expire entries after 25s —
 *    no ping, no indicator, by construction. Transitions also send an
 *    immediate ping for an instant update.
 */
const HEARTBEAT_MS = 10_000
const TTL_MS = 25_000

interface HuddlePing {
  user_id: string
  // Channel the user is huddling on (null = not in a huddle).
  channel_id: string | null
  // Channel the user is viewing in Comms (null = elsewhere in the app).
  viewing: string | null
}

export function useHuddlePresence(opts: {
  inHuddle: Ref<boolean>
  channelId: Ref<string | null | undefined>
  /** Channel currently on screen (only when the Comms surface is open). */
  viewingChannelId?: Ref<string | null | undefined>
}) {
  const auth = useAuthStore()
  const onlineUsers = ref<string[]>([])
  // user_id → last heartbeat seen, pruned past TTL.
  const lastPing = ref<Record<string, { huddle: string | null; viewing: string | null; at: number }>>({})

  const byChannel = computed<Record<string, number>>(() => {
    const sets: Record<string, Set<string>> = {}
    for (const [uid, p] of Object.entries(lastPing.value)) {
      if (p.huddle) (sets[p.huddle] ??= new Set()).add(uid)
    }
    const out: Record<string, number> = {}
    for (const [cid, set] of Object.entries(sets)) out[cid] = set.size
    return out
  })

  /** Who (besides me) is sitting in each channel right now. */
  const viewersByChannel = computed<Record<string, string[]>>(() => {
    const me = auth.user?.id
    const out: Record<string, string[]> = {}
    for (const [uid, p] of Object.entries(lastPing.value)) {
      if (p.viewing && uid !== me) (out[p.viewing] ??= []).push(uid)
    }
    return out
  })

  let channel: RealtimeChannel | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let pruneTimer: ReturnType<typeof setInterval> | undefined

  function syncOnline() {
    if (!channel) return
    const state = channel.presenceState<{ user_id: string }>()
    const online = new Set<string>()
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as { user_id: string }[]) {
        if (m?.user_id) online.add(m.user_id)
      }
    }
    onlineUsers.value = [...online]
  }

  function onPing(payload: HuddlePing | undefined) {
    if (!payload?.user_id) return
    if (payload.channel_id || payload.viewing) {
      lastPing.value = {
        ...lastPing.value,
        [payload.user_id]: { huddle: payload.channel_id, viewing: payload.viewing ?? null, at: Date.now() },
      }
    } else if (lastPing.value[payload.user_id]) {
      const next = { ...lastPing.value }
      delete next[payload.user_id]
      lastPing.value = next
    }
  }

  function prune() {
    const cutoff = Date.now() - TTL_MS
    const entries = Object.entries(lastPing.value)
    if (!entries.some(([, p]) => p.at < cutoff)) return
    lastPing.value = Object.fromEntries(entries.filter(([, p]) => p.at >= cutoff))
  }

  function sendPing(leaving = false) {
    const uid = auth.user?.id
    if (!channel || !uid) return
    const payload: HuddlePing = {
      user_id: uid,
      channel_id: !leaving && opts.inHuddle.value ? opts.channelId.value ?? null : null,
      viewing: !leaving ? opts.viewingChannelId?.value ?? null : null,
    }
    void channel.send({ type: 'broadcast', event: 'huddle', payload })
    // Our own indicator shouldn't wait for the round trip (self-broadcast is off).
    onPing(payload)
  }

  async function close() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = undefined }
    if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = undefined }
    if (channel) {
      try {
        sendPing(true) // best-effort instant clear for everyone else
        await channel.untrack()
        await supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      channel = null
    }
    lastPing.value = {}
    onlineUsers.value = []
  }

  async function open() {
    await close()
    const ch = supabase.channel('bb-huddles', {
      config: { presence: { key: auth.user?.id ?? 'anon' }, broadcast: { self: false } }
    })
    ch.on('presence', { event: 'sync' }, syncOnline)
    ch.on('presence', { event: 'join' }, syncOnline)
    ch.on('presence', { event: 'leave' }, syncOnline)
    ch.on('broadcast', { event: 'huddle' }, (m: { payload?: any }) => onPing(m.payload as HuddlePing | undefined))
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch.track({ user_id: auth.user?.id })
        // Announce current state on every (re)join, so a reconnect can't lose us.
        sendPing()
      }
    })
    channel = ch
    heartbeatTimer = setInterval(() => sendPing(), HEARTBEAT_MS)
    pruneTimer = setInterval(prune, 5_000)
  }

  watch(
    () => auth.isAuthenticated,
    (authed) => {
      if (authed) void open()
      else void close()
    },
    { immediate: true }
  )

  // State transitions announce immediately — the heartbeat is the keep-alive.
  watch(
    [() => opts.inHuddle.value, () => opts.channelId.value, () => opts.viewingChannelId?.value],
    () => sendPing(),
  )

  onUnmounted(close)

  return { byChannel, viewersByChannel, onlineUsers }
}
