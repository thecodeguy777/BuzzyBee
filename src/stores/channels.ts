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
  is_group: boolean
  dm_key: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface DmThread {
  channel_id: string
  is_group: boolean
  name: string
  members: string[]
  last_message_at: string | null
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
  // DM channel id → the *other* participants' user ids (everyone but me).
  // 1:1 DMs have one entry; group DMs have many.
  const dmMembers = ref<Record<string, string[]>>({})
  // Back-compat: DM channel id → the single other participant. For 1:1 DMs this
  // is the partner; for groups it's just the first member (group surfaces use
  // dmMembers + dmName instead).
  const dmOther = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const [id, mem] of Object.entries(dmMembers.value)) if (mem[0]) out[id] = mem[0]
    return out
  })
  const memberships = ref<Record<string, Membership>>({})
  // The last_read_at a channel had *before* this session first read it — so the
  // UI can highlight what was unseen on entry. Captured once per channel.
  const entryReadAt = ref<Record<string, string | null>>({})
  const unread = ref<Record<string, number>>({})
  // Unread messages that @-mention me, per channel (subset of unread + replies).
  const mentions = ref<Record<string, number>>({})
  // Cross-workspace totals (client_id → counts; DMs under 'dm') so the client
  // switcher can show that ANOTHER workspace is pinging you.
  const unreadByClient = ref<Record<string, { unread: number; mentions: number }>>({})
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
  // Channel-only unread (DMs live in their own surface, badged separately).
  const totalUnread = computed(() =>
    channels.value.reduce((a, c) => a + (unread.value[c.id] ?? 0), 0),
  )
  // Aggregate DM badges for the Messages nav item.
  const dmUnreadTotal = computed(() =>
    dms.value.reduce((a, c) => a + (unread.value[c.id] ?? 0), 0),
  )
  const dmMentionTotal = computed(() =>
    dms.value.reduce((a, c) => a + (mentions.value[c.id] ?? 0), 0),
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

  // ── Cross-workspace totals ───────────────────────────────────────────────────
  let crossTimer: ReturnType<typeof setTimeout> | undefined
  async function refreshCrossClient() {
    if (!auth.isAuthenticated) return
    const { data, error } = await supabase.rpc('comms_unread_by_client')
    if (error) {
      console.warn('[channels] cross-client overview:', error.message)
      return
    }
    const next: Record<string, { unread: number; mentions: number }> = {}
    for (const row of (data ?? []) as any[]) {
      next[row.client_id ?? 'dm'] = { unread: row.unread ?? 0, mentions: row.mentions ?? 0 }
    }
    unreadByClient.value = next
  }
  // Debounced: WAL events can arrive in bursts.
  function scheduleCrossRefresh(delay = 1500) {
    clearTimeout(crossTimer)
    crossTimer = setTimeout(() => void refreshCrossClient(), delay)
  }
  /** Unread total in workspaces OTHER than the selected one (DMs excluded —
   *  those are visible from any workspace's channel list). */
  const otherClientsUnread = computed(() => {
    let n = 0
    for (const [cid, v] of Object.entries(unreadByClient.value)) {
      if (cid !== 'dm' && cid !== clients.currentClientId) n += v.unread
    }
    return n
  })

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
    else scheduleCrossRefresh(800)
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
  // DMs (1:1 and group) are private is_dm channels with no client. dm_threads()
  // returns each one I'm in with its other participants + last activity in a
  // single round-trip; RLS-equivalent scoping happens inside the RPC.
  async function loadDms() {
    if (!auth.isAuthenticated) {
      dms.value = []
      dmMembers.value = {}
      return
    }
    const { data, error } = await supabase.rpc('dm_threads')
    if (error) {
      console.warn('[channels] loadDms:', error.message)
      return
    }
    const rows = (data ?? []) as DmThread[]
    // Synthesize Channel-shaped rows (only id/name/is_dm/is_group are consumed).
    dms.value = rows.map((r) => ({
      id: r.channel_id,
      client_id: null,
      name: r.name ?? '',
      topic: null,
      is_private: true,
      is_dm: true,
      is_group: r.is_group,
      dm_key: null,
      created_by: null,
      created_at: '',
      updated_at: '',
    }))
    const members: Record<string, string[]> = {}
    for (const r of rows) members[r.channel_id] = r.members ?? []
    dmMembers.value = members
    // Seed last activity for DM sorting without clobbering channel entries.
    const lm = { ...lastMessageAt.value }
    for (const r of rows) if (r.last_message_at) lm[r.channel_id] = r.last_message_at
    lastMessageAt.value = lm
    const ids = [...new Set(rows.flatMap((r) => r.members ?? []))]
    if (ids.length) {
      const { useTeamStore } = await import('@/stores/team')
      void useTeamStore().fetchProfiles(ids)
    }
  }

  /** Find-or-create a 1:1 DM with another user, returning its channel id. */
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

  /** Create a group DM with the given members (+ optional name). Always a new
   *  thread — group DMs aren't deduped. Returns its channel id. */
  async function createGroupDm(memberIds: string[], name?: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('create_group_dm', {
      p_members: memberIds,
      p_name: name?.trim() || null,
    })
    if (error) {
      console.warn('[channels] createGroupDm:', error.message)
      throw error
    }
    const id = data as string
    await loadDms()
    return id
  }

  /** Leave a group DM (no-op for 1:1 DMs, enforced server-side). */
  async function leaveDm(id: string): Promise<void> {
    const { error } = await supabase.rpc('leave_dm', { p_channel: id })
    if (error) {
      console.warn('[channels] leaveDm:', error.message)
      throw error
    }
    if (currentChannelId.value === id) currentChannelId.value = null
    await loadDms()
  }

  // Light meta sync: channel add/remove reloads the list, and every message
  // INSERT I'm allowed to see (RLS-scoped WAL) keeps badges live — including
  // channels I'm not subscribed to and workspaces I don't have selected.
  function startMeta() {
    if (metaChannel) return
    metaChannel = supabase
      .channel('bb-channels-meta')
      .on('postgres_changes', { event: '*', schema: 'buzzybee', table: 'channels' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'buzzybee', table: 'messages' }, (p: any) => {
        const row = p.new
        if (!row?.channel_id || row.user_id === auth.user?.id) return
        // The active channel is handled by the live stream (with proper
        // "is the user looking?" logic) — leave it alone here.
        if (row.channel_id === currentChannelId.value) return
        const known =
          channels.value.some((c) => c.id === row.channel_id) ||
          dms.value.some((c) => c.id === row.channel_id)
        if (known) {
          if (!row.parent_id) bumpUnread(row.channel_id)
          const me = auth.user?.id
          if (me && (row.mentioned_user_ids ?? []).includes(me)) bumpMention(row.channel_id)
          lastMessageAt.value = { ...lastMessageAt.value, [row.channel_id]: row.created_at }
        } else {
          // Unknown channel — could be a brand-new DM aimed at me.
          void loadDms()
        }
        scheduleCrossRefresh()
      })
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
        void refreshCrossClient()
        startMeta()
      } else {
        channels.value = []
        dms.value = []
        dmMembers.value = {}
        unreadByClient.value = {}
        currentChannelId.value = null
        void stopMeta()
      }
    },
    { immediate: true },
  )

  return {
    channels,
    dms,
    dmMembers,
    dmOther,
    memberships,
    entryReadAt,
    unread,
    mentions,
    unreadByClient,
    otherClientsUnread,
    lastMessageAt,
    currentChannelId,
    currentChannel,
    sorted,
    pinned,
    unpinned,
    totalUnread,
    dmUnreadTotal,
    dmMentionTotal,
    loading,
    isUnread,
    load,
    loadDms,
    openDm,
    createGroupDm,
    leaveDm,
    refreshOverview,
    refreshCrossClient,
    select,
    bumpUnread,
    bumpMention,
    markRead,
    togglePin,
    toggleMute,
    addChannel,
  }
})
