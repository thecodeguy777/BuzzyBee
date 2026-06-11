import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

/**
 * ONE global realtime topic for the workstation, carrying two signals:
 *
 *  • onlineUsers — via PRESENCE. Presence is right for "who is connected":
 *    it carries no claim beyond the connection itself, so it can't go stale.
 *
 *  • byChannel (huddle indicators) — via BROADCAST heartbeats with a TTL.
 *    Presence proved wrong for this: "I'm huddling on channel X" is a claim,
 *    and any missed "I left" (raced reconnect, dropped frame, dev hot-reload
 *    zombie) left a live connection serving a stale flag forever. Heartbeats
 *    invert the failure mode: a huddler pings every 10s, receivers expire
 *    entries after 25s — no ping, no indicator, by construction. Graceful
 *    leaves also send an explicit stop for an instant clear.
 */
const HEARTBEAT_MS = 10_000
const TTL_MS = 25_000

interface HuddlePing {
  user_id: string
  // null = explicit "I left the huddle".
  channel_id: string | null
}

export function useHuddlePresence(opts: {
  inHuddle: Ref<boolean>
  channelId: Ref<string | null | undefined>
}) {
  const auth = useAuthStore()
  const onlineUsers = ref<string[]>([])
  // user_id → { channelId, at } — last heartbeat seen, pruned past TTL.
  const lastPing = ref<Record<string, { channelId: string; at: number }>>({})

  const byChannel = computed<Record<string, number>>(() => {
    const sets: Record<string, Set<string>> = {}
    for (const [uid, p] of Object.entries(lastPing.value)) {
      ;(sets[p.channelId] ??= new Set()).add(uid)
    }
    const out: Record<string, number> = {}
    for (const [cid, set] of Object.entries(sets)) out[cid] = set.size
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
    if (payload.channel_id) {
      lastPing.value = { ...lastPing.value, [payload.user_id]: { channelId: payload.channel_id, at: Date.now() } }
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
    const channelId = !leaving && opts.inHuddle.value ? opts.channelId.value ?? null : null
    void channel.send({
      type: 'broadcast',
      event: 'huddle',
      payload: { user_id: uid, channel_id: channelId } satisfies HuddlePing,
    })
    // Our own indicator shouldn't wait for the round trip (self-broadcast is off).
    onPing({ user_id: uid, channel_id: channelId })
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
        if (opts.inHuddle.value) sendPing()
      }
    })
    channel = ch
    heartbeatTimer = setInterval(() => {
      if (opts.inHuddle.value) sendPing()
    }, HEARTBEAT_MS)
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

  // Joining/leaving a huddle (or carrying it to another channel) announces
  // immediately — the heartbeat is just the keep-alive between transitions.
  watch([() => opts.inHuddle.value, () => opts.channelId.value], () => sendPing())

  onUnmounted(close)

  return { byChannel, onlineUsers }
}
