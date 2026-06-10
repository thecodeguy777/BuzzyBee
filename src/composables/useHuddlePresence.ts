import { onUnmounted, ref, watch, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

interface HuddleMeta {
  user_id: string
  // null when the user is online but not in a huddle.
  channel_id: string | null
}

/**
 * A single per-client presence channel that tracks who is in a huddle and on
 * which channel — so the channel list can show a huddle indicator on channels
 * the viewer isn't currently bound to (per-channel presence only sees the
 * active channel). Lives in the workstation shell so it broadcasts regardless
 * of route. Public presence channel — non-sensitive, and it degrades gracefully
 * (the active channel still shows its huddle via the live stream).
 */
export function useHuddlePresence(opts: {
  clientId: Ref<string | null | undefined>
  inHuddle: Ref<boolean>
  channelId: Ref<string | null | undefined>
}) {
  const auth = useAuthStore()
  const byChannel = ref<Record<string, number>>({})
  // Everyone connected for this client (online roster) — drives presence dots.
  const onlineUsers = ref<string[]>([])

  let channel: RealtimeChannel | null = null
  let currentClient: string | null = null

  function sync() {
    if (!channel) return
    const state = channel.presenceState<HuddleMeta>()
    const online = new Set<string>()
    const sets: Record<string, Set<string>> = {}
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as HuddleMeta[]) {
        if (!m?.user_id) continue
        online.add(m.user_id)
        if (m.channel_id) (sets[m.channel_id] ??= new Set()).add(m.user_id)
      }
    }
    onlineUsers.value = [...online]
    const out: Record<string, number> = {}
    for (const [cid, set] of Object.entries(sets)) out[cid] = set.size
    byChannel.value = out
  }

  // Always present (online); carry the channel_id only while in a huddle.
  async function track() {
    if (!channel) return
    await channel.track({
      user_id: auth.user?.id,
      channel_id: opts.inHuddle.value ? opts.channelId.value ?? null : null
    })
  }

  async function close() {
    if (channel) {
      try {
        await channel.untrack()
        await supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      channel = null
    }
    byChannel.value = {}
    onlineUsers.value = []
    currentClient = null
  }

  async function open(clientId: string) {
    await close()
    currentClient = clientId
    const ch = supabase.channel(`bb-huddles:${clientId}`, {
      config: { presence: { key: auth.user?.id ?? `anon-${clientId}` } }
    })
    ch.on('presence', { event: 'sync' }, sync)
    ch.on('presence', { event: 'join' }, sync)
    ch.on('presence', { event: 'leave' }, sync)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') void track()
    })
    channel = ch
  }

  watch(
    () => opts.clientId.value,
    (cid) => {
      if (cid && cid !== currentClient) void open(cid)
      else if (!cid) void close()
    },
    { immediate: true }
  )

  // Re-broadcast whenever the viewer joins/leaves a huddle or switches channel.
  watch([() => opts.inHuddle.value, () => opts.channelId.value], () => void track())

  onUnmounted(close)

  return { byChannel, onlineUsers }
}
