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
 * ONE global presence topic for the whole workstation: who is online, and who
 * is huddling on which channel — so the channel list can flag huddles the
 * viewer isn't bound to. Global on purpose: the old per-client topic
 * (`bb-huddles:<clientId>`) silently split people by their *selected
 * workspace*, so a superadmin parked on client A could never see a VA's huddle
 * on client B even when both sat in the same channel list. Public presence
 * channel — non-sensitive (user ids + channel ids), and it degrades gracefully
 * (the active channel still shows its huddle via the live stream).
 */
export function useHuddlePresence(opts: {
  inHuddle: Ref<boolean>
  channelId: Ref<string | null | undefined>
}) {
  const auth = useAuthStore()
  const byChannel = ref<Record<string, number>>({})
  // Everyone connected to the workstation (online roster) — drives presence dots.
  const onlineUsers = ref<string[]>([])

  let channel: RealtimeChannel | null = null

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
    if (!channel || channel.state !== 'joined') return
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
  }

  async function open() {
    await close()
    const ch = supabase.channel('bb-huddles', {
      config: { presence: { key: auth.user?.id ?? 'anon' } }
    })
    ch.on('presence', { event: 'sync' }, sync)
    ch.on('presence', { event: 'join' }, sync)
    ch.on('presence', { event: 'leave' }, sync)
    ch.subscribe((status) => {
      // Re-track on every (re)join so a reconnect restores our presence.
      if (status === 'SUBSCRIBED') void track()
    })
    channel = ch
  }

  watch(
    () => auth.isAuthenticated,
    (authed) => {
      if (authed) void open()
      else void close()
    },
    { immediate: true }
  )

  // Re-broadcast whenever the viewer joins/leaves a huddle or switches channel.
  watch([() => opts.inHuddle.value, () => opts.channelId.value], () => void track())

  onUnmounted(close)

  return { byChannel, onlineUsers }
}
