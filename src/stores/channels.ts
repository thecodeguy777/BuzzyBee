import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'

export interface Channel {
  id: string
  client_id: string
  name: string
  topic: string | null
  is_private: boolean
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
  const memberships = ref<Record<string, Membership>>({})
  const unread = ref<Record<string, number>>({})
  const lastMessageAt = ref<Record<string, string>>({})
  const currentChannelId = ref<string | null>(null)
  const loading = ref(false)
  let metaChannel: RealtimeChannel | null = null

  const currentChannel = computed(() =>
    channels.value.find((c) => c.id === currentChannelId.value) ?? null,
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
    const cid = clients.currentClientId
    if (!cid) return
    const { data, error } = await supabase.rpc('comms_overview', { p_client: cid })
    if (error) {
      console.warn('[channels] overview:', error.message)
      return
    }
    const u: Record<string, number> = {}
    const lm: Record<string, string> = {}
    for (const row of (data ?? []) as any[]) {
      u[row.channel_id] = row.unread ?? 0
      if (row.last_message_at) lm[row.channel_id] = row.last_message_at
    }
    unread.value = u
    lastMessageAt.value = lm
  }

  function select(id: string) {
    currentChannelId.value = id
    void markRead(id)
  }

  async function markRead(id: string) {
    const uid = auth.user?.id
    if (!uid) return
    unread.value = { ...unread.value, [id]: 0 }
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
        startMeta()
      } else {
        channels.value = []
        currentChannelId.value = null
        void stopMeta()
      }
    },
    { immediate: true },
  )

  return {
    channels,
    memberships,
    unread,
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
    refreshOverview,
    select,
    markRead,
    togglePin,
    toggleMute,
    addChannel,
  }
})
