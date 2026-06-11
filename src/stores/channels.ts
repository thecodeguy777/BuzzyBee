import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'

export interface Channel {
  id: string
  client_id: string | null
  name: string
  topic: string | null
  is_private: boolean
  is_dm: boolean
  dm_key: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface Membership {
  last_read_at: string
  pinned: boolean
  muted: boolean
}

export const useChannelsStore = defineStore('channels', () => {
  const auth = useAuthStore()
  const clients = useClientsStore()

  const channels = ref<Channel[]>([])
  const dms = ref<Channel[]>([])
  // DM channel id → the *other* participant's user id.
  const dmOther = ref<Record<string, string>>({})
  const memberships = ref<Record<string, Membership>>({})
  // The last_read_at a channel had *before* this session first read it — so the
  // UI can highlight what was unseen on entry. Captured once per channel.
  const entryReadAt = ref<Record<string, string | null>>({})
  const unread = ref<Record<string, number>>({})
  // Unread messages that @-mention me, per channel (subset of unread + replies).
  const mentions = ref<Record<string, number>>({})
  const lastMessageAt = ref<Record<string, string>>({})
  const currentChannelId = ref<string | null>(null)
  const loading = ref(false)
  let metaChannel: RealtimeChannel | null = null

  const currentChannel = computed(
    () =>
      channels.value.find((c) => c.id === currentChannelId.value) ??
      dms.value.find((c) => c.id === currentChannelId.value) ??
      null,
  )

  // Pinned channels first, then alphabetical.
  const sorted = computed(() =>
    [...channels.value].sort((a, b) => {
      const pa = memberships.value[a.id]?.pinned ? 0 : 1
      const pb = memberships.value[b.id]?.pinned ? 0 : 1
      return pa - pb || a.name.localeCompare(b.name)
    }),
  )
  const pinned = computed(() => sorted.value.filter((c) => memberships.value[c.id]?.pinned))
  const unpinned = computed(() => sorted.value.filter((c) => !memberships.value[c.id]?.pinned))
  const totalUnread = computed(() =>
    Object.values(unread.value).reduce((a, b) => a + b, 0),
  )

  function isUnread(id: string) {
    return (unread.value[id] ?? 0) > 0
  }

  async function load() {
    const cid = clients.currentClientId
    if (!auth.isAuthenticated || !cid) {
      channels.value = []
      currentChannelId.value = null
      // DM unreads aren't client-scoped — keep them fresh even with no client.
      if (auth.isAuthenticated) void refreshOverview()
      return
    }
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('client_id', cid)
        .order('name', { ascending: true })
      if (error) throw error
      channels.value = (data ?? []) as Channel[]

      // My membership rows (last_read / pinned / muted).
      const { data: mem } = await supabase
        .from('channel_members')
        .select('channel_id, last_read_at, pinned, muted')
        .eq('user_id', auth.user?.id ?? '')
      const m: Record<string, Membership> = {}
      for (const row of (mem ?? []) as any[]) {
        m[row.channel_id] = { last_read_at: row.last_read_at, pinned: row.pinned, muted: row.muted }
      }
      memberships.value = m

      await refreshOverview()

      // Default selection: keep current if still present, else #general / first.
      if (!channels.value.some((c) => c.id === currentChannelId.value)) {
        currentChannelId.value =
          channels.value.find((c) => c.name === 'general')?.id ?? channels.value[0]?.id ?? null
      }
    } catch (e) {
      console.warn('[channels] load:', (e as Error).message)
    } finally {
      loading.value = false
    }
  }

  async function refreshOverview() {
    // Returns the current client's channels plus my DMs (DMs have no client,
    // so a null p_client still resolves them).
    const { data, error } = await supabase.rpc('comms_overview', {
      p_client: clients.currentClientId ?? null,
    })
    if (error) {
      console.warn('[channels] overview:', error.message)
      return
    }
    const u: Record<string, number> = {}
    const mn: Record<string, number> = {}
    const lm: Record<string, string> = {}
    for (const row of (data ?? []) as any[]) {
      u[row.channel_id] = row.unread ?? 0
      mn[row.channel_id] = row.mentions ?? 0
      if (row.last_message_at) lm[row.channel_id] = row.last_message_at
    }
    unread.value = u
    mentions.value = mn
    lastMessageAt.value = lm
  }

  function select(id: string) {
    currentChannelId.value = id
    void markRead(id)
  }

  // Live unread bump for a message that arrived while the user wasn't looking.
  function bumpUnread(id: string) {
    unread.value = { ...unread.value, [id]: (unread.value[id] ?? 0) + 1 }
  }
  function bumpMention(id: string) {
    mentions.value = { ...mentions.value, [id]: (mentions.value[id] ?? 0) + 1 }
  }

  async function markRead(id: string) {
    const uid = auth.user?.id
    if (!uid) return
    // Snapshot the pre-read position the first time we read this channel.
    if (!(id in entryReadAt.value)) {
      entryReadAt.value = { ...entryReadAt.value, [id]: memberships.value[id]?.last_read_at ?? null }
    }
    unread.value = { ...unread.value, [id]: 0 }
    mentions.value = { ...mentions.value, [id]: 0 }
    const now = new Date().toISOString()
    memberships.value[id] = { ...(memberships.value[id] ?? { pinned: false, muted: false }), last_read_at: now }
    const { error } = await supabase
      .from('channel_members')
      .upsert({ channel_id: id, user_id: uid, last_read_at: now }, { onConflict: 'channel_id,user_id' })
    if (error) console.warn('[channels] markRead:', error.message)
  }

  async function setMembershipFlag(id: string, patch: { pinned?: boolean; muted?: boolean }) {
    const uid = auth.user?.id
    if (!uid) return
    memberships.value[id] = {
      last_read_at: memberships.value[id]?.last_read_at ?? new Date().toISOString(),
      pinned: patch.pinned ?? memberships.value[id]?.pinned ?? false,
      muted: patch.muted ?? memberships.value[id]?.muted ?? false,
    }
    const { error } = await supabase
      .from('channel_members')
      .upsert({ channel_id: id, user_id: uid, ...patch }, { onConflict: 'channel_id,user_id' })
    if (error) console.warn('[channels] setMembershipFlag:', error.message)
  }
  const togglePin = (id: string) => setMembershipFlag(id, { pinned: !memberships.value[id]?.pinned })
  const toggleMute = (id: string) => setMembershipFlag(id, { muted: !memberships.value[id]?.muted })

  async function addChannel(name: string, topic?: string): Promise<Channel | null> {
    const cid = clients.currentClientId
    if (!cid) return null
    const clean = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!clean) return null
    const { data, error } = await supabase
      .from('channels')
      .insert({ client_id: cid, name: clean, topic: topic?.trim() || null, created_by: auth.user?.id ?? null })
      .select('*')
      .single()
    if (error) throw error
    const ch = data as Channel
    if (!channels.value.some((c) => c.id === ch.id)) channels.value = [...channels.value, ch]
    currentChannelId.value = ch.id
    return ch
  }

  // ── Direct messages ─────────────────────────────────────────────────────────
  // DMs are private 2-person channels (is_dm). RLS scopes them to my memberships,
  // so a plain is_dm query returns exactly my DMs (not client-scoped).
  async function loadDms() {
    if (!auth.isAuthenticated) {
      dms.value = []
      dmOther.value = {}
      return
    }
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('is_dm', true)
    if (error) {
      console.warn('[channels] loadDms:', error.message)
      return
    }
    const list = (data ?? []) as Channel[]
    dms.value = list
    if (!list.length) {
      dmOther.value = {}
      return
    }
    const { data: mem } = await supabase
      .from('channel_members')
      .select('channel_id, user_id')
      .in('channel_id', list.map((c) => c.id))
    const me = auth.user?.id
    const other: Record<string, string> = {}
    for (const row of (mem ?? []) as { channel_id: string; user_id: string }[]) {
      if (row.user_id !== me) other[row.channel_id] = row.user_id
    }
    dmOther.value = other
    const ids = [...new Set(Object.values(other))]
    if (ids.length) {
      const { useTeamStore } = await import('@/stores/team')
      void useTeamStore().fetchProfiles(ids)
    }
  }

  /** Find-or-create a DM with another user, returning its channel id. */
  async function openDm(otherUserId: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('open_dm', { p_other: otherUserId })
    if (error) {
      console.warn('[channels] openDm:', error.message)
      throw error
    }
    const id = data as string
    await loadDms()
    return id
  }

  // Light meta sync: when channels are added/removed for this client elsewhere,
  // reload the list. (Per-message unread is refreshed on channel switch.)
  function startMeta() {
    if (metaChannel) return
    metaChannel = supabase
      .channel('bb-channels-meta')
      .on('postgres_changes', { event: '*', schema: 'buzzybee', table: 'channels' }, () => void load())
      .subscribe()
  }
  async function stopMeta() {
    if (metaChannel) {
      try { await supabase.removeChannel(metaChannel) } catch { /* ignore */ }
      metaChannel = null
    }
  }

  watch(
    () => [auth.isAuthenticated, clients.currentClientId] as const,
    ([authed]) => {
      if (authed) {
        void load()
        void loadDms()
        startMeta()
      } else {
        channels.value = []
        dms.value = []
        dmOther.value = {}
        currentChannelId.value = null
        void stopMeta()
      }
    },
    { immediate: true },
  )

  return {
    channels,
    dms,
    dmOther,
    memberships,
    entryReadAt,
    unread,
    mentions,
    lastMessageAt,
    currentChannelId,
    currentChannel,
    sorted,
    pinned,
    unpinned,
    totalUnread,
    loading,
    isUnread,
    load,
    loadDms,
    openDm,
    refreshOverview,
    select,
    bumpUnread,
    bumpMention,
    markRead,
    togglePin,
    toggleMute,
    addChannel,
  }
})
