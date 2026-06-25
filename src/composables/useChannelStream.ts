import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { broadcast } from '@/lib/realtime'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'
import { useTasksStore } from '@/stores/tasks'
import { useProjectsStore } from '@/stores/projects'
import { useChannelsStore } from '@/stores/channels'
import {
  playSelfJoin,
  playSelfLeave,
  playPeerJoin,
  playPeerLeave,
  playScreenShare,
  playMessage,
  soundsMuted,
  setSoundsMuted,
} from '@/lib/commsSounds'
import { createNoisePipeline, type NoisePipeline } from '@/lib/noiseSuppressor'
import { iceServers, hasTurn } from '@/lib/iceServers'

export interface Attachment {
  /** Stable id assigned at creation — used as the v-for key in the composer. */
  id?: string
  kind: 'image' | 'file' | 'link'
  name: string
  url?: string
  size?: number
  mime?: string
}

export interface CommsMessage {
  id: string
  channel_id: string
  parent_id: string | null
  /** null = system message (e.g. the CRM pipeline announcer); render user_name. */
  user_id: string | null
  user_name: string | null
  body: string
  attachments: Attachment[]
  mentioned_user_ids: string[]
  is_pinned: boolean
  is_decision: boolean
  decision_done: boolean
  linked_task_id: string | null
  edited_at: string | null
  /** Set when the author/manager soft-deletes — renders a "deleted" tombstone. */
  deleted_at?: string | null
  /** Present when this message is a poll (rendered as a poll card). */
  poll?: { question: string; options: string[] } | null
  created_at: string
  updated_at: string
}

export interface CommsReminder {
  id: string
  channel_id: string
  created_by: string
  body: string
  remind_at: string
  fired_at: string | null
  /** Manual completion (separate from the cron's fired_at delivery). */
  done_at: string | null
  created_at: string
}

export interface HuddlePresence {
  userId: string
  name: string
  avatarUrl: string | null
  inHuddle: boolean
  muted: boolean
  sharing?: boolean
  /** ms timestamp the user joined the huddle; earliest joiner = host. */
  huddleSince?: number | null
}

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

export function useChannelStream(channelId: Ref<string | null | undefined>) {
  const auth = useAuthStore()
  const team = useTeamStore()
  const tasks = useTasksStore()
  const projects = useProjectsStore()
  const channelsStore = useChannelsStore()

  const allMessages = ref<CommsMessage[]>([])
  // reactions: messageId -> emoji -> Set<userId>. Tracking the actual user ids
  // (not a raw counter) makes applying a reaction idempotent — so the optimistic
  // update and the DB broadcast echo for the same (user, emoji) don't double up.
  const reactions = ref<Record<string, Record<string, Set<string>>>>({})
  // poll votes: messageId -> userId -> optionIndex. One vote per user (single
  // choice, changeable); counts + your-vote derive from this, kept live off the
  // same channel broadcast as reactions.
  const pollVotes = ref<Record<string, Record<string, number>>>({})
  const loading = ref(false)
  const sending = ref(false)
  const online = ref<HuddlePresence[]>([])
  // Pagination: load the newest page on entry, fetch older on scroll-up.
  const PAGE = 40
  const hasMore = ref(false)
  const loadingOlder = ref(false)

  // Read receipts: every member's last_read_at for this channel. Kept live off
  // the SAME private broadcast as messages (the broadcast_channel_member trigger
  // mirrors broadcast_message), so "seen by" updates instantly instead of
  // trailing behind on the slower postgres_changes path. Powers the honeycomb.
  const reads = ref<{ user_id: string; last_read_at: string }[]>([])
  // Pending reminders for the bound channel (unfired). Loaded on entry + after
  // any create/edit/delete; not realtime (they change rarely).
  const reminders = ref<CommsReminder[]>([])

  // Huddle: WebRTC audio mesh, signaled over the channel's private broadcast.
  const inHuddle = ref(false)
  const muted = ref(false)
  const speaking = ref<Set<string>>(new Set())
  const huddleError = ref<string | null>(null)

  // Noise cancellation: RNNoise (neural) running in an AudioWorklet, with a
  // fallback to the browser's native suppressor if RNNoise can't load.
  // User-toggleable; on by default. Echo-cancellation + auto-gain are always on.
  const NOISE_KEY = 'buzzybee.comms.noise-suppression'
  const noiseSuppression = ref(
    typeof window === 'undefined' || window.localStorage.getItem(NOISE_KEY) !== '0',
  )
  // true once the RNNoise pipeline is live (vs. the native-suppressor fallback).
  const rnnoiseActive = ref(false)
  let rawStream: MediaStream | null = null // the real mic, before processing
  let nsPipeline: NoisePipeline | null = null

  const ICE_SERVERS = iceServers()
  let localStream: MediaStream | null = null
  let huddleSince = 0
  let audioCtx: AudioContext | null = null
  interface PeerEntry {
    pc: RTCPeerConnection
    audioEl?: HTMLAudioElement
    screenSender?: RTCRtpSender
    audioSender?: RTCRtpSender
    /** Last video stream received from them (their screen), live or not. */
    remoteVideo?: MediaStream
    /** ICE candidates that raced ahead of the remote description — flushed after it lands. */
    pendingIce: RTCIceCandidateInit[]
    /** True once presence has confirmed this user in the huddle (see reconcilePeers). */
    confirmed: boolean
    makingOffer: boolean
    ignoreOffer: boolean
    polite: boolean
  }
  const peers = new Map<string, PeerEntry>()
  const analysers = new Map<string, AnalyserNode>() // userId -> analyser (local keyed by me())
  let speakingRaf = 0

  // Screen share
  const sharingScreen = ref(false)
  const remoteScreens = ref<Record<string, MediaStream>>({}) // userId -> their shared screen
  let screenStream: MediaStream | null = null
  const localScreen = ref<MediaStream | null>(null) // the sharer's own stream, for self-preview

  // Sound cues: remember the last seen huddle membership / sharers so each
  // presence sync can tell who just joined, left, or started sharing.
  const soundMuted = ref(soundsMuted())
  let prevHuddleIds = new Set<string>()
  let prevSharers = new Set<string>()

  // How many UI surfaces are actively showing this channel's messages (the full
  // Comms page, or the expanded dock). When 0 — or the tab is hidden — an
  // incoming message is "unseen": it pings + bumps the unread badge.
  const viewers = ref(0)
  const registerViewer = () => { viewers.value++ }
  const unregisterViewer = () => { viewers.value = Math.max(0, viewers.value - 1) }
  function isViewing() {
    return viewers.value > 0 && !(typeof document !== 'undefined' && document.hidden)
  }

  let channel: RealtimeChannel | null = null
  let activeId: string | null = null
  let setupToken = 0

  const me = () => auth.user?.id ?? null

  const rootMessages = computed(() =>
    allMessages.value
      .filter((m) => !m.parent_id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  )
  const repliesByParent = computed(() => {
    const map: Record<string, CommsMessage[]> = {}
    for (const m of allMessages.value) {
      if (m.parent_id) (map[m.parent_id] ??= []).push(m)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }
    return map
  })
  const decisions = computed(() => rootMessages.value.filter((m) => m.is_decision))
  const pinned = computed(() => rootMessages.value.filter((m) => m.is_pinned))
  const huddlePeople = computed(() => online.value.filter((p) => p.inHuddle))
  // Host = the earliest joiner still in the huddle.
  const huddleHost = computed(() => {
    const inH = huddlePeople.value.filter((p) => p.huddleSince)
    if (!inH.length) return null
    return inH.reduce((a, b) => ((a.huddleSince ?? 0) <= (b.huddleSince ?? 0) ? a : b)).userId
  })

  function reactionList(messageId: string) {
    const r = reactions.value[messageId]
    const uid = me() ?? ''
    if (!r) return [] as { emoji: string; count: number; mine: boolean }[]
    return Object.entries(r)
      .map(([emoji, users]) => ({ emoji, count: users.size, mine: users.has(uid) }))
      .filter((x) => x.count > 0)
  }
  // Aggregate a poll's votes: voter ids per option, total, and your own pick.
  function pollTally(messageId: string) {
    const v = pollVotes.value[messageId] ?? {}
    const uid = me() ?? ''
    const byOption: Record<number, string[]> = {}
    let total = 0
    for (const [userId, opt] of Object.entries(v)) {
      ;(byOption[opt] ?? (byOption[opt] = [])).push(userId)
      total++
    }
    return { byOption, total, myVote: uid in v ? v[uid] : null }
  }
  function profile(userId: string) {
    return team.profiles[userId] ?? null
  }

  function upsertMessage(row: CommsMessage | null | undefined) {
    if (!row?.id) return
    const i = allMessages.value.findIndex((m) => m.id === row.id)
    if (i === -1) {
      allMessages.value = [...allMessages.value, row]
      if (row.user_id && !team.profiles[row.user_id]) void team.fetchProfiles([row.user_id])
      // A fresh root message in the channel you're actively viewing → keep it
      // marked read. (If you're not looking, it stays unread — see onChange.)
      if (!row.parent_id && row.channel_id === activeId && isViewing()) {
        void channelsStore.markRead(row.channel_id)
      }
    } else {
      allMessages.value[i] = row
    }
  }
  function removeMessage(id: string | undefined) {
    if (!id) return
    allMessages.value = allMessages.value.filter((m) => m.id !== id)
  }

  function applyReactionRow(row: any, removed: boolean) {
    const mid = row?.message_id
    const emoji = row?.emoji
    const uid = row?.user_id
    if (!mid || !emoji || !uid) return
    const byEmoji = reactions.value[mid] ?? (reactions.value[mid] = {})
    const set = byEmoji[emoji] ?? (byEmoji[emoji] = new Set<string>())
    if (removed) set.delete(uid)
    else set.add(uid) // idempotent: re-adding the same user is a no-op
    if (set.size === 0) delete byEmoji[emoji]
    // Reassign the message entry so the template's reactionList() recomputes.
    reactions.value = { ...reactions.value, [mid]: { ...byEmoji } }
  }

  function applyPollVoteRow(row: any, removed: boolean) {
    const mid = row?.message_id
    const uid = row?.user_id
    if (!mid || !uid) return
    const byUser = pollVotes.value[mid] ?? (pollVotes.value[mid] = {})
    if (removed) delete byUser[uid]
    else byUser[uid] = row.option_index
    pollVotes.value = { ...pollVotes.value, [mid]: { ...byUser } }
  }

  // Replies for a set of root messages (threads load with their parents).
  async function fetchReplies(rootIds: string[]): Promise<CommsMessage[]> {
    if (!rootIds.length) return []
    const { data, error } = await supabase.from('messages').select('*').in('parent_id', rootIds)
    if (error) {
      console.warn('[comms] replies:', error.message)
      return []
    }
    return (data ?? []) as CommsMessage[]
  }

  function primeProfiles(msgs: CommsMessage[]) {
    const ids = [...new Set(msgs.map((m) => m.user_id))]
      .filter((u): u is string => !!u && !team.profiles[u])
    if (ids.length) void team.fetchProfiles(ids)
  }

  // Initial load: newest PAGE root messages (+ their replies), oldest→newest.
  async function loadHistory(id: string, opts: { silent?: boolean } = {}) {
    if (!opts.silent) loading.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', id)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (error) throw error
      const roots = ((data ?? []) as CommsMessage[]).reverse()
      hasMore.value = (data?.length ?? 0) >= PAGE
      const replies = await fetchReplies(roots.map((r) => r.id))
      allMessages.value = [...roots, ...replies]
      primeProfiles(allMessages.value)
      await loadReactions()
      await loadPollVotes()
    } catch (e) {
      console.warn('[comms] loadHistory:', (e as Error).message)
      if (!opts.silent) {
        allMessages.value = []
        hasMore.value = false
      }
    } finally {
      if (!opts.silent) loading.value = false
    }
  }

  // Scroll-up: prepend the previous PAGE of root messages before the oldest loaded.
  async function loadOlder() {
    if (loadingOlder.value || !hasMore.value || !activeId) return
    const id = activeId
    const oldest = rootMessages.value[0]?.created_at
    if (!oldest) return
    loadingOlder.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', id)
        .is('parent_id', null)
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (error) throw error
      const older = ((data ?? []) as CommsMessage[]).reverse()
      hasMore.value = (data?.length ?? 0) >= PAGE
      const replies = await fetchReplies(older.map((r) => r.id))
      const existing = new Set(allMessages.value.map((m) => m.id))
      const add = [...older, ...replies].filter((m) => !existing.has(m.id))
      if (add.length) {
        allMessages.value = [...add, ...allMessages.value]
        primeProfiles(add)
        await loadReactions()
        await loadPollVotes()
      }
    } catch (e) {
      console.warn('[comms] loadOlder:', (e as Error).message)
    } finally {
      loadingOlder.value = false
    }
  }

  // Jump target (from search): ensure a message is loaded by pulling everything
  // from its timestamp to now — keeps the view contiguous (no gaps).
  async function loadAround(messageId: string) {
    if (!activeId) return
    const id = activeId
    if (allMessages.value.some((m) => m.id === messageId)) return
    const { data: target } = await supabase
      .from('messages')
      .select('created_at, channel_id')
      .eq('id', messageId)
      .maybeSingle()
    const t = target as { created_at: string; channel_id: string } | null
    if (!t || t.channel_id !== id) return
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', id)
      .is('parent_id', null)
      .gte('created_at', t.created_at)
      .order('created_at', { ascending: true })
    if (error) return
    const roots = (data ?? []) as CommsMessage[]
    if (!roots.length) return
    const replies = await fetchReplies(roots.map((r) => r.id))
    const existing = new Set(allMessages.value.map((m) => m.id))
    const add = [...roots, ...replies].filter((m) => !existing.has(m.id))
    if (add.length) {
      allMessages.value = [...add, ...allMessages.value]
      primeProfiles(add)
      await loadReactions()
    }
    hasMore.value = true
  }

  async function loadReactions() {
    const ids = allMessages.value.map((m) => m.id)
    if (!ids.length) {
      reactions.value = {}
      return
    }
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', ids)
    if (error) {
      console.warn('[comms] loadReactions:', error.message)
      return
    }
    const map: Record<string, Record<string, Set<string>>> = {}
    for (const r of (data ?? []) as any[]) {
      const m = (map[r.message_id] ??= {})
      const s = (m[r.emoji] ??= new Set<string>())
      s.add(r.user_id)
    }
    reactions.value = map
  }

  // Pull votes for every loaded poll message (rebuilt like loadReactions).
  async function loadPollVotes() {
    const ids = allMessages.value.filter((m) => m.poll).map((m) => m.id)
    if (!ids.length) {
      pollVotes.value = {}
      return
    }
    const { data, error } = await supabase
      .from('comms_poll_votes')
      .select('message_id, user_id, option_index')
      .in('message_id', ids)
    if (error) {
      console.warn('[comms] loadPollVotes:', error.message)
      return
    }
    const map: Record<string, Record<string, number>> = {}
    for (const r of (data ?? []) as any[]) {
      ;(map[r.message_id] ??= {})[r.user_id] = r.option_index
    }
    pollVotes.value = map
  }

  async function teardown() {
    online.value = []
    reads.value = []
    typing.value = []
    if (typingPrune) { clearInterval(typingPrune); typingPrune = null }
    prevHuddleIds = new Set()
    prevSharers = new Set()
    if (inHuddle.value) stopHuddle()
    if (channel) {
      try {
        await channel.untrack()
        await supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
      channel = null
    }
  }

  function trackPresence() {
    const uid = me()
    if (!channel || !uid) return
    void channel.track({
      userId: uid,
      name: auth.fullName,
      avatarUrl: auth.profile?.avatar_url ?? null,
      inHuddle: inHuddle.value,
      muted: muted.value,
      sharing: sharingScreen.value,
      huddleSince: inHuddle.value ? huddleSince : null,
    } satisfies HuddlePresence)
  }
  function syncPresence() {
    if (!channel) return
    const state = channel.presenceState<HuddlePresence>()
    const seen = new Map<string, HuddlePresence>()
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as HuddlePresence[]) {
        if (m?.userId) seen.set(m.userId, m)
      }
    }
    online.value = [...seen.values()]
    const all = [...seen.values()]
    // A shared screen is only valid while its owner's presence says sharing.
    const sharers = new Set(all.filter((p) => p.sharing).map((p) => p.userId))
    for (const uid of Object.keys(remoteScreens.value)) {
      if (!sharers.has(uid)) removeRemoteScreen(uid)
    }
    // Heal the reverse race: frames (track unmute → show) can land before the
    // sharer's presence flips to sharing, so the hide above just ate the screen
    // — and 'unmute' won't re-fire. Once presence confirms a share, re-show any
    // live stream we already hold.
    for (const uid of sharers) {
      if (remoteScreens.value[uid]) continue
      const stream = peers.get(uid)?.remoteVideo
      const track = stream?.getVideoTracks()[0]
      if (stream && track && !track.muted && track.readyState === 'live') {
        remoteScreens.value = { ...remoteScreens.value, [uid]: stream }
      }
    }

    // Audio cues for huddle activity — only while *you're* in the huddle, and
    // never for your own presence (self join/leave/share play their own cues).
    const myId = me()
    const huddleIds = new Set(all.filter((p) => p.inHuddle).map((p) => p.userId))
    if (inHuddle.value) {
      for (const uid of huddleIds) {
        if (uid !== myId && !prevHuddleIds.has(uid)) playPeerJoin()
      }
      for (const uid of prevHuddleIds) {
        if (uid !== myId && !huddleIds.has(uid)) playPeerLeave()
      }
      for (const uid of sharers) {
        if (uid !== myId && !prevSharers.has(uid)) playScreenShare()
      }
    }
    // Track regardless of membership so joining a busy huddle doesn't replay a
    // join chime for everyone already in it.
    prevHuddleIds = huddleIds
    prevSharers = sharers
  }

  // Typing indicator: ephemeral + high-frequency → broadcast only, never the DB.
  // Each received event refreshes a per-user TTL; a 1s sweep drops stale typers.
  type Typer = { userId: string; name: string; avatarUrl: string | null; at: number }
  const typing = ref<Typer[]>([])
  let typingPrune: ReturnType<typeof setInterval> | null = null
  let lastTypingSent = 0

  function applyTyping(p: { userId?: string; name?: string; avatarUrl?: string | null }) {
    if (!p?.userId || p.userId === me()) return
    const next = typing.value.filter((t) => t.userId !== p.userId)
    next.push({ userId: p.userId, name: p.name || 'Someone', avatarUrl: p.avatarUrl ?? null, at: Date.now() })
    typing.value = next
  }
  function pruneTyping() {
    if (!typing.value.length) return
    const cutoff = Date.now() - 4500
    const next = typing.value.filter((t) => t.at > cutoff)
    if (next.length !== typing.value.length) typing.value = next
  }
  // Someone who just posted is no longer typing — drop them immediately.
  function clearTyper(userId?: string) {
    if (!userId || !typing.value.length) return
    const next = typing.value.filter((t) => t.userId !== userId)
    if (next.length !== typing.value.length) typing.value = next
  }
  // Throttled — fire at most every ~1.8s while the user is actively typing.
  function sendTyping() {
    if (!channel) return
    const now = Date.now()
    if (now - lastTypingSent < 1800) return
    lastTypingSent = now
    broadcast(channel, 'typing', { userId: me(), name: auth.fullName, avatarUrl: auth.profile?.avatar_url ?? null })
  }

  // Pull every member's read position once on entry; the broadcast keeps it live.
  async function loadReads(id: string) {
    const { data, error } = await supabase
      .from('channel_members')
      .select('user_id, last_read_at')
      .eq('channel_id', id)
    if (error) {
      console.warn('[stream] loadReads:', error.message)
      return
    }
    if (activeId !== id) return
    reads.value = (data ?? []).filter((r) => r.last_read_at) as { user_id: string; last_read_at: string }[]
    const ids = reads.value.map((r) => r.user_id).filter((u) => u !== me())
    if (ids.length) {
      const { useTeamStore } = await import('@/stores/team')
      void useTeamStore().fetchProfiles(ids)
    }
  }

  // Merge a single channel_members row from the broadcast into `reads` (replace
  // by user_id, newest wins), keeping the array reactive via reassignment.
  function applyRead(rec: { user_id?: string; last_read_at?: string } | null | undefined) {
    if (!rec?.user_id || !rec.last_read_at) return
    const next = reads.value.filter((r) => r.user_id !== rec.user_id)
    next.push({ user_id: rec.user_id, last_read_at: rec.last_read_at })
    reads.value = next
    if (rec.user_id !== me()) {
      void import('@/stores/team').then(({ useTeamStore }) => useTeamStore().fetchProfiles([rec.user_id!]))
    }
  }

  async function setup(id: string, token: number) {
    activeId = id
    reminders.value = []
    await loadHistory(id)
    void loadReads(id)
    void loadReminders(id)
    if (token !== setupToken) return
    try { await supabase.realtime.setAuth() } catch { /* already set */ }
    if (token !== setupToken) return

    const uid = me()
    let subscribedOnce = false
    const ch = supabase.channel(`channel:${id}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: uid ?? `anon-${id}` } },
    })

    const onChange = (m: { payload?: any; event?: string }) => {
      if (activeId !== id) return
      const p = m.payload ?? {}
      const table = p.table ?? p.schema_table
      const rec = p.record ?? p.new
      const old = p.old_record ?? p.old
      if (table === 'channel_members') {
        // Read receipt — keep the "seen by" honeycomb live. (No deletes matter.)
        if (p.operation !== 'DELETE' && m.event !== 'DELETE') applyRead(rec)
      } else if (table === 'message_reactions') {
        if (p.operation === 'DELETE' || m.event === 'DELETE') applyReactionRow(old, true)
        else applyReactionRow(rec, false)
      } else if (table === 'comms_poll_votes') {
        if (p.operation === 'DELETE' || m.event === 'DELETE') applyPollVoteRow(old, true)
        else applyPollVoteRow(rec, false)
      } else {
        // messages
        if (p.operation === 'DELETE' || m.event === 'DELETE') {
          removeMessage(old?.id)
        } else {
          const incoming = rec as CommsMessage
          const isNew = !!incoming?.id && !allMessages.value.some((mm) => mm.id === incoming.id)
          const fromOther = !!incoming?.user_id && incoming.user_id !== me()
          if (isNew && incoming.user_id) clearTyper(incoming.user_id) // posting ends "typing…"
          upsertMessage(incoming)
          // New message from someone else that you didn't see → ping + bump unread.
          if (isNew && fromOther && !isViewing()) {
            playMessage()
            if (!incoming.parent_id) channelsStore.bumpUnread(incoming.channel_id)
            const myId = me()
            if (myId && incoming.mentioned_user_ids?.includes(myId)) {
              channelsStore.bumpMention(incoming.channel_id)
            }
          }
        }
      }
    }
    ch.on('broadcast', { event: 'INSERT' }, onChange)
    ch.on('broadcast', { event: 'UPDATE' }, onChange)
    ch.on('broadcast', { event: 'DELETE' }, onChange)

    const onPresence = () => {
      syncPresence()
      if (inHuddle.value) reconcilePeers()
    }
    ch.on('presence', { event: 'sync' }, onPresence)
    ch.on('presence', { event: 'join' }, onPresence)
    ch.on('presence', { event: 'leave' }, onPresence)

    // WebRTC signaling (offer/answer/ice) for the huddle audio mesh.
    ch.on('broadcast', { event: 'rtc' }, (m: { payload?: any }) => {
      if (activeId === id) void handleSignal(m.payload)
    })

    // "typing…" — ephemeral, broadcast-only.
    ch.on('broadcast', { event: 'typing' }, (m: { payload?: any }) => {
      if (activeId === id) applyTyping(m.payload ?? {})
    })
    if (typingPrune) clearInterval(typingPrune)
    typingPrune = setInterval(pruneTyping, 1000)

    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      trackPresence()
      if (subscribedOnce) {
        if (activeId === id) void loadHistory(id, { silent: true })
      } else {
        subscribedOnce = true
      }
    })

    if (token !== setupToken) {
      try { await ch.untrack(); await supabase.removeChannel(ch) } catch { /* ignore */ }
      return
    }
    channel = ch
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function send(
    body: string,
    opts: { attachments?: Attachment[]; parentId?: string | null; mentions?: string[] } = {},
  ) {
    const text = body.trim()
    const id = activeId
    const uid = me()
    if ((!text && !(opts.attachments?.length)) || !id || !uid || sending.value) return
    sending.value = true
    try {
      // Only keep mentioned ids whose @handle still survives in the text.
      const mentions = (opts.mentions ?? []).filter((mid) => {
        const name = team.profiles[mid]?.full_name
        return name ? text.includes('@' + name) || text.includes('@' + name.split(' ')[0]) : true
      })
      const { data, error } = await supabase
        .from('messages')
        .insert({
          channel_id: id,
          parent_id: opts.parentId ?? null,
          user_id: uid,
          user_name: auth.fullName || null,
          body: text,
          attachments: opts.attachments ?? [],
          mentioned_user_ids: mentions,
        })
        .select('*')
        .single()
      if (error) throw error
      upsertMessage(data as CommsMessage)
      return data as CommsMessage
    } catch (e) {
      console.warn('[comms] send:', (e as Error).message)
      throw e
    } finally {
      sending.value = false
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const uid = me()
    if (!uid) return
    const mine = reactions.value[messageId]?.[emoji]?.has(uid) ?? false
    // Optimistic (idempotent vs. the broadcast echo, since we key by user id)
    applyReactionRow({ message_id: messageId, user_id: uid, emoji }, mine)
    if (mine) {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', uid)
        .eq('emoji', emoji)
      if (error) console.warn('[comms] unreact:', error.message)
    } else {
      const { error } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: uid, emoji })
      if (error) console.warn('[comms] react:', error.message)
    }
  }

  // ── Polls ──────────────────────────────────────────────────────────────────
  async function createPoll(question: string, options: string[]) {
    const id = activeId
    const uid = me()
    const q = question.trim()
    const opts = options.map((o) => o.trim()).filter(Boolean)
    if (!q || opts.length < 2 || !id || !uid || sending.value) return null
    sending.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          channel_id: id,
          user_id: uid,
          user_name: auth.fullName || null,
          body: q,
          poll: { question: q, options: opts },
        })
        .select('*')
        .single()
      if (error) throw error
      upsertMessage(data as CommsMessage)
      return data as CommsMessage
    } catch (e) {
      console.warn('[comms] createPoll:', (e as Error).message)
      throw e
    } finally {
      sending.value = false
    }
  }
  // Single-choice, changeable: clicking your current option clears it (unvote);
  // any other option upserts. self:false on the channel means the optimistic
  // update is authoritative for the voter; everyone else gets the broadcast.
  async function votePoll(messageId: string, optionIndex: number) {
    const uid = me()
    if (!uid) return
    const removing = pollVotes.value[messageId]?.[uid] === optionIndex
    applyPollVoteRow({ message_id: messageId, user_id: uid, option_index: optionIndex }, removing)
    if (removing) {
      const { error } = await supabase
        .from('comms_poll_votes')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', uid)
      if (error) console.warn('[comms] unvote:', error.message)
    } else {
      const { error } = await supabase
        .from('comms_poll_votes')
        .upsert({ message_id: messageId, user_id: uid, option_index: optionIndex }, { onConflict: 'message_id,user_id' })
      if (error) console.warn('[comms] vote:', error.message)
    }
  }

  // ── Reminders ───────────────────────────────────────────────────────────────
  // Queued against the channel; the bb-fire-comms-reminders pg_cron job posts
  // "⏰ Reminder: …" into the channel at remind_at and @mentions the creator.
  function sortReminders(list: CommsReminder[]) {
    return [...list].sort((a, b) => a.remind_at.localeCompare(b.remind_at))
  }
  async function createReminder(remindAt: string, body: string) {
    const id = activeId
    const uid = me()
    const text = body.trim()
    if (!text || !id || !uid) return null
    const { data, error } = await supabase
      .from('comms_reminders')
      .insert({ channel_id: id, created_by: uid, body: text, remind_at: remindAt })
      .select('*')
      .single()
    if (error) {
      console.warn('[comms] createReminder:', error.message)
      throw error
    }
    if (data && activeId === id) reminders.value = sortReminders([...reminders.value, data as CommsReminder])
    // Announce in the channel so the team sees it the moment it's set (a HiveMind
    // announcer line, same style as the fire message). Best-effort — the reminder
    // itself is already saved; a failed notice shouldn't surface as an error.
    const when = new Date(remindAt).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    const who = auth.fullName || 'Someone'
    try {
      const { data: notice, error: noticeErr } = await supabase.rpc('post_channel_notice', {
        p_channel_id: id,
        p_body: `📌 ${who} set a reminder for ${when}: ${text}`,
      })
      if (noticeErr) console.warn('[comms] reminder notice:', noticeErr.message)
      // Show it immediately for the author — the DB-triggered broadcast covers others.
      else if (notice) upsertMessage((Array.isArray(notice) ? notice[0] : notice) as CommsMessage)
    } catch (e) {
      console.warn('[comms] reminder notice:', (e as Error).message)
    }
    return (data as { id: string } | null)?.id ?? null
  }
  // Pending (unfired) reminders for a channel — fired ones become messages.
  async function loadReminders(channelId?: string) {
    const id = channelId ?? activeId
    if (!id) return
    // All reminders for the channel (the rail filters Upcoming/All/Done; fired
    // but not-done ones linger as "overdue" until checked off).
    const { data, error } = await supabase
      .from('comms_reminders')
      .select('*')
      .eq('channel_id', id)
      .order('remind_at', { ascending: true })
      .limit(200)
    if (error) {
      console.warn('[comms] loadReminders:', error.message)
      return
    }
    if (activeId !== id) return
    reminders.value = (data ?? []) as CommsReminder[]
  }
  async function updateReminder(
    id: string,
    patch: { body?: string; remind_at?: string; done_at?: string | null; fired_at?: string | null },
  ) {
    const prev = reminders.value
    reminders.value = sortReminders(reminders.value.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    // .select() so an RLS-blocked update (not a channel member) rolls back.
    const { data, error } = await supabase.from('comms_reminders').update(patch).eq('id', id).select('id')
    if (error || (data ?? []).length === 0) {
      reminders.value = prev
      console.warn('[comms] updateReminder:', error?.message ?? 'no rows updated (RLS)')
      return false
    }
    return true
  }
  // Mark a reminder done / active. A done reminder won't fire.
  const toggleReminderDone = (r: CommsReminder) =>
    updateReminder(r.id, { done_at: r.done_at ? null : new Date().toISOString() })
  // Push a reminder out and let it fire again at the new time.
  const snoozeReminder = (r: CommsReminder, minutes = 60) =>
    updateReminder(r.id, {
      remind_at: new Date(new Date(r.remind_at).getTime() + minutes * 60000).toISOString(),
      fired_at: null,
    })
  async function deleteReminder(id: string) {
    const prev = reminders.value
    reminders.value = reminders.value.filter((r) => r.id !== id)
    const { error } = await supabase.from('comms_reminders').delete().eq('id', id)
    if (error) {
      reminders.value = prev
      console.warn('[comms] deleteReminder:', error.message)
      return false
    }
    return true
  }

  async function patchMessage(id: string, patch: Partial<CommsMessage>) {
    const i = allMessages.value.findIndex((m) => m.id === id)
    const prev = i !== -1 ? { ...allMessages.value[i] } : null
    if (i !== -1) allMessages.value[i] = { ...allMessages.value[i], ...patch }
    // .select() so an RLS-filtered 0-row update (not the author / not a
    // manager) is detected and rolled back — PostgREST returns no error for it.
    const { data, error } = await supabase.from('messages').update(patch).eq('id', id).select('id')
    if (error || (data ?? []).length === 0) {
      const j = allMessages.value.findIndex((m) => m.id === id)
      if (prev && j !== -1) allMessages.value[j] = prev
      console.warn('[comms] patchMessage:', error?.message ?? 'no rows updated (RLS)')
    }
  }
  const togglePin = (m: CommsMessage) => patchMessage(m.id, { is_pinned: !m.is_pinned })
  const markDecision = (m: CommsMessage) => patchMessage(m.id, { is_decision: !m.is_decision })
  const toggleDecisionDone = (m: CommsMessage) => patchMessage(m.id, { decision_done: !m.decision_done })
  // Edit stamps edited_at so the UI can show "(edited)". RLS (messages_update)
  // restricts this to the author / admins / the client PM; patchMessage rolls
  // back the optimistic change if the 0-row (denied) update comes back empty.
  function editMessage(id: string, body: string) {
    const text = body.trim()
    if (!text) return Promise.resolve()
    return patchMessage(id, { body: text, edited_at: new Date().toISOString() })
  }
  // Soft delete: a tombstone, not a hard DELETE — messages.parent_id cascades,
  // so removing a threaded parent would wipe its replies. Clears the content and
  // any pin/decision flags so it drops out of those surfaces too.
  function deleteMessage(m: CommsMessage) {
    return patchMessage(m.id, {
      deleted_at: new Date().toISOString(),
      body: '',
      attachments: [],
      is_pinned: false,
      is_decision: false,
      decision_done: false,
    })
  }

  /** Projects belonging to a message's channel-client (for the task picker). */
  function projectsForMessage(m: CommsMessage) {
    const clientId = channelsStore.channels.find((c) => c.id === m.channel_id)?.client_id
    if (!clientId) return []
    return projects.projectsByClient[clientId] ?? projects.projects.filter((p) => p.client_id === clientId)
  }

  /** Turn a message into a tracked task. Defaults to the client's first project;
   *  pass projectId (and/or a title) to place it explicitly. */
  async function createTaskFromMessage(
    m: CommsMessage,
    opts: {
      projectId?: string
      title?: string
      assignee_id?: string | null
      due_on?: string | null
      priority?: 1 | 2 | 3 | 4
      statusKey?: string
    } = {},
  ): Promise<{ id: string; linked: boolean } | null> {
    const channelObj = channelsStore.channels.find((c) => c.id === m.channel_id)
    const clientId = channelObj?.client_id
    if (!clientId) return null
    const list = projectsForMessage(m)
    const project = opts.projectId ? list.find((p) => p.id === opts.projectId) : list[0]
    if (!project) throw new Error('Create a project for this client before turning messages into tasks.')
    const title = (opts.title ?? stripHtml(m.body)).slice(0, 140) || 'Task from message'
    const task = await tasks.createTask({
      title,
      project_id: project.id,
      client_id: clientId,
      assignee_id: opts.assignee_id ?? null,
      due_on: opts.due_on ?? null,
      priority: opts.priority,
    })
    // Optional non-default status (the composer lets you pick a column).
    if (opts.statusKey && opts.statusKey !== task.status) {
      void tasks.setStatus(task.id, opts.statusKey)
    }
    // Back-link so the task card renders under the message for everyone.
    // messages_update RLS only covers the author/managers, so this goes
    // through a security-definer RPC gated on channel visibility instead —
    // a Task action from anyone in the channel must persist, not just look
    // persisted.
    const i = allMessages.value.findIndex((x) => x.id === m.id)
    const prevLink = i !== -1 ? allMessages.value[i].linked_task_id : null
    if (i !== -1) allMessages.value[i] = { ...allMessages.value[i], linked_task_id: task.id }
    const { data: linked, error: linkErr } = await supabase.rpc('link_task_to_message', {
      p_message_id: m.id,
      p_task_id: task.id,
    })
    if (linkErr || !linked) {
      // Roll back the optimistic link (someone linked a task first, or the
      // function rejected it); the task itself still exists on the board.
      const j = allMessages.value.findIndex((x) => x.id === m.id)
      if (j !== -1) allMessages.value[j] = { ...allMessages.value[j], linked_task_id: prevLink }
      console.warn('[comms] link_task_to_message:', linkErr?.message ?? 'link not applied')
    }
    // The task always lands on the board; `linked` tells the caller whether the
    // back-link to this message actually persisted, so the toast can't claim
    // "& linked" when the link RPC rejected (already linked / not permitted).
    return { id: task.id, linked: !linkErr && !!linked }
  }

  // ── Huddle: WebRTC audio mesh ───────────────────────────────────────────────
  function sendRtc(to: string, kind: string, data: unknown) {
    broadcast(channel, 'rtc', { from: me(), to, kind, data })
  }

  function setupAnalyser(userId: string, stream: MediaStream) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      audioCtx ??= new AC()
      const src = audioCtx.createMediaStreamSource(stream)
      const an = audioCtx.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      analysers.set(userId, an)
      ensureSpeakingLoop()
    } catch {
      /* analyser is best-effort (just powers the speaking glow) */
    }
  }

  function ensureSpeakingLoop() {
    if (speakingRaf) return
    let last = 0
    const tick = (ts: number) => {
      speakingRaf = requestAnimationFrame(tick)
      if (ts - last < 120) return
      last = ts
      const next = new Set<string>()
      for (const [uid, an] of analysers) {
        const buf = new Uint8Array(an.fftSize)
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        if (rms > 0.045 && !(uid === me() && muted.value)) next.add(uid)
      }
      const changed = next.size !== speaking.value.size || [...next].some((u) => !speaking.value.has(u))
      if (changed) speaking.value = next
    }
    speakingRaf = requestAnimationFrame(tick)
  }

  async function ensureLocalStream() {
    if (localStream) return localStream
    // Honor the mic chosen in the Mic & sound check; fall back to default if the
    // exact device is no longer available.
    const deviceId =
      typeof window !== 'undefined' ? window.localStorage.getItem('buzzybee.comms.mic-device') : null
    // Raw mic: keep echo-cancel + auto-gain (they don't fight RNNoise), but turn
    // the browser's noise suppressor OFF — RNNoise owns NS now (never stack them).
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: false,
    }
    if (deviceId) audio.deviceId = { exact: deviceId }
    try {
      rawStream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    } catch {
      rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    }
    // Apply the mute state the instant the mic exists — before the (async) RNNoise
    // graph is built or the track is added to any peer — so "join muted" never
    // leaves a hot mic open during the pipeline-build window. Re-applied below
    // after the pipeline in case mute was toggled mid-build.
    rawStream.getAudioTracks().forEach((t) => (t.enabled = !muted.value))

    // Route the mic through RNNoise; fall back to the raw mic if it can't load.
    nsPipeline = await createNoisePipeline(rawStream, noiseSuppression.value)
    rnnoiseActive.value = !!nsPipeline
    if (!nsPipeline) {
      // No RNNoise → at least honor the toggle via the native suppressor.
      try {
        await rawStream.getAudioTracks()[0]?.applyConstraints({
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: noiseSuppression.value,
        })
      } catch { /* ignore */ }
    }
    localStream = nsPipeline ? nsPipeline.stream : rawStream

    // Mute acts on the real mic track so both the processed and raw paths go silent.
    rawStream.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    const uid = me()
    if (uid) setupAnalyser(uid, localStream)
    return localStream
  }

  // Perfect-negotiation peer. Handles initial audio AND later screen-share
  // (re)negotiation without glare: the "impolite" side (lower id) ignores a
  // colliding offer; the "polite" side rolls back.
  function getPeer(userId: string): PeerEntry {
    const existing = peers.get(userId)
    if (existing) return existing
    const myId = me() ?? ''
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const entry: PeerEntry = {
      pc,
      pendingIce: [],
      confirmed: false,
      makingOffer: false,
      ignoreOffer: false,
      polite: myId > userId
    }
    peers.set(userId, entry)

    // Fixed transceiver layout — created in the SAME order on both peers so the
    // SDP m-lines never reorder across renegotiation: [audio, video]. Screen
    // share is done with replaceTrack on the video sender (never
    // addTrack/removeTrack), so there's no per-share renegotiation and the
    // "order of m-lines doesn't match" glare can't occur.
    const micTrack = localStream?.getAudioTracks()[0] ?? null
    const audioTx = pc.addTransceiver(micTrack ?? 'audio', {
      direction: 'sendrecv',
      streams: localStream ? [localStream] : [],
    })
    entry.audioSender = audioTx.sender
    const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' })
    entry.screenSender = videoTx.sender
    if (screenStream) {
      const vt = screenStream.getVideoTracks()[0]
      if (vt) {
        void videoTx.sender.replaceTrack(vt)
        void tuneScreenSender(videoTx.sender)
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) sendRtc(userId, 'ice', e.candidate.toJSON())
    }
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return
      try {
        entry.makingOffer = true
        await pc.setLocalDescription()
        sendRtc(userId, 'desc', pc.localDescription)
      } catch (e) {
        console.warn('[huddle] negotiate:', (e as Error).message)
      } finally {
        entry.makingOffer = false
      }
    }
    pc.ontrack = (e) => {
      if (e.track.kind === 'video') {
        // The video m-line always exists (fixed layout) but only carries frames
        // while the peer is actually sharing. Their replaceTrack(track|null)
        // mutes/unmutes the remote track — use that to show/hide their screen.
        // The screen goes out over a streamless transceiver (replaceTrack, no
        // msid), so e.streams is empty — wrap the bare track in a MediaStream
        // ourselves, else <video>.srcObject is null and the tile is black.
        const stream = e.streams[0] ?? new MediaStream([e.track])
        entry.remoteVideo = stream
        const show = () => { remoteScreens.value = { ...remoteScreens.value, [userId]: stream } }
        const hide = () => removeRemoteScreen(userId)
        if (!e.track.muted) show()
        e.track.addEventListener('unmute', show)
        e.track.addEventListener('mute', hide)
        e.track.addEventListener('ended', hide)
      } else {
        let el = entry.audioEl
        if (!el) {
          el = document.createElement('audio')
          el.autoplay = true
          ;(el as any).playsInline = true
          document.body.appendChild(el)
          entry.audioEl = el
        }
        el.srcObject = e.streams[0]
        void el.play().catch(() => {})
        if (!analysers.has(userId)) setupAnalyser(userId, e.streams[0])
      }
    }
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState
      if (st === 'failed') {
        // A failed peer used to die silently — surface it so people don't sit in
        // a dead/one-way call wondering why. Strict/symmetric NATs need a TURN
        // relay (STUN alone can't punch through), so hint at it when none is set.
        const who = team.profiles[userId]?.full_name
          ?? huddlePeople.value.find((p) => p.userId === userId)?.name
          ?? 'a teammate'
        huddleError.value = hasTurn()
          ? `Lost the audio connection to ${who}.`
          : `Lost the audio connection to ${who} — strict networks need a TURN relay (set VITE_TURN_*).`
        console.warn('[huddle] peer connection failed:', userId, 'turn=', hasTurn())
      }
      if (st === 'failed' || st === 'closed') closePeer(userId)
    }
    return entry
  }

  // Open a peer to everyone in the huddle (both sides create one; negotiation
  // bootstraps via onnegotiationneeded). Close peers who left.
  function reconcilePeers() {
    const myId = me()
    if (!inHuddle.value || !myId) return
    const wanted = new Set(huddlePeople.value.map((p) => p.userId).filter((u) => u !== myId))
    for (const uid of wanted) {
      getPeer(uid).confirmed = true
    }
    for (const uid of [...peers.keys()]) {
      if (wanted.has(uid)) continue
      // A joiner's offer can outrun their presence join — a peer born from that
      // early signal must survive until presence confirms them, or any stray
      // heartbeat sync reaps the connection mid-negotiation. Only reap peers
      // presence has CONFIRMED and then dropped; the rest die via
      // connectionState 'failed' if their owner truly never shows.
      if (peers.get(uid)?.confirmed) closePeer(uid)
    }
  }

  async function handleSignal(p: any) {
    if (!p || p.to !== me()) return
    // Signals can outlive membership (we just left, or are mid-rejoin before
    // the mic exists). Answering them would mint a half-configured peer with
    // no audio sender — the classic "in the huddle but nobody hears you".
    if (!inHuddle.value) return
    const from = p.from as string
    const entry = getPeer(from)
    const pc = entry.pc
    try {
      if (p.kind === 'desc') {
        const desc = p.data as RTCSessionDescriptionInit
        const collision = desc.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable')
        entry.ignoreOffer = !entry.polite && collision
        if (entry.ignoreOffer) return
        await pc.setRemoteDescription(desc)
        // Candidates that raced ahead of this description were parked — flush
        // them now that addIceCandidate can succeed. Dropping them instead is
        // an intermittent one-way-audio generator on stricter NATs.
        while (entry.pendingIce.length) {
          const c = entry.pendingIce.shift()!
          try {
            await pc.addIceCandidate(c)
          } catch (e) {
            if (!entry.ignoreOffer) console.warn('[huddle] flush ice:', (e as Error).message)
          }
        }
        if (desc.type === 'offer') {
          await pc.setLocalDescription()
          sendRtc(from, 'desc', pc.localDescription)
        }
      } else if (p.kind === 'ice') {
        // Broadcast gives no ordering guarantee vs. the 'desc' send — park
        // early candidates instead of letting addIceCandidate throw them away.
        if (!pc.remoteDescription) {
          entry.pendingIce.push(p.data as RTCIceCandidateInit)
          return
        }
        try {
          await pc.addIceCandidate(p.data)
        } catch (e) {
          if (!entry.ignoreOffer) throw e
        }
      }
    } catch (e) {
      console.warn('[huddle] signal:', (e as Error).message)
    }
  }

  // Push the screen sender to a high bitrate and stop it auto-downscaling, so a
  // healthy connection keeps text crisp. (Best-effort — not all browsers allow.)
  async function tuneScreenSender(sender: RTCRtpSender) {
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      params.encodings[0].maxBitrate = 2_500_000 // 2.5 Mbps
      params.encodings[0].scaleResolutionDownBy = 1
      await sender.setParameters(params)
    } catch {
      /* setParameters unsupported / not ready on some browsers */
    }
  }

  function removeRemoteScreen(userId: string) {
    if (!remoteScreens.value[userId]) return
    const next = { ...remoteScreens.value }
    delete next[userId]
    remoteScreens.value = next
  }

  async function startScreenShare() {
    if (!inHuddle.value || sharingScreen.value) return
    try {
      // Cap frame-rate so the encoder spends its bitrate on resolution, not motion.
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      })
    } catch {
      return // user cancelled the picker
    }
    const track = screenStream.getVideoTracks()[0]
    if (!track) return
    // "detail" = prioritize sharp text/UI over smooth motion (vs. the default).
    if ('contentHint' in track) (track as any).contentHint = 'detail'
    sharingScreen.value = true
    localScreen.value = screenStream // self-preview for the sharer
    // Push the track onto each peer's pre-created video sender — starts media on
    // the existing m-line. No addTrack, so no renegotiation and no m-line churn.
    for (const entry of peers.values()) {
      if (!entry.screenSender) continue
      void entry.screenSender.replaceTrack(track)
      void tuneScreenSender(entry.screenSender)
    }
    track.addEventListener('ended', () => stopScreenShare()) // browser "Stop sharing"
    trackPresence()
  }

  function stopScreenShare() {
    if (!sharingScreen.value && !screenStream) return
    // Stop sending frames but KEEP the sender + its m-line — the remote sees the
    // track mute and hides our screen. No removeTrack, so no renegotiation.
    for (const entry of peers.values()) {
      try { void entry.screenSender?.replaceTrack(null) } catch { /* ignore */ }
    }
    screenStream?.getTracks().forEach((t) => t.stop())
    screenStream = null
    localScreen.value = null
    sharingScreen.value = false
    trackPresence()
  }

  function toggleScreenShare() {
    if (sharingScreen.value) stopScreenShare()
    else void startScreenShare()
  }

  // Re-pick the shared source without leaving the huddle ("Switch"). Reuses the
  // same senders via replaceTrack, so no renegotiation — same as start.
  async function switchScreenShare() {
    if (!sharingScreen.value) return
    let next: MediaStream
    try {
      next = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      })
    } catch {
      return // user cancelled the picker — keep the current share
    }
    const track = next.getVideoTracks()[0]
    if (!track) { next.getTracks().forEach((t) => t.stop()); return }
    if ('contentHint' in track) (track as any).contentHint = 'detail'
    screenStream?.getTracks().forEach((t) => t.stop()) // stop the old capture
    screenStream = next
    localScreen.value = next
    for (const entry of peers.values()) {
      if (!entry.screenSender) continue
      void entry.screenSender.replaceTrack(track)
      void tuneScreenSender(entry.screenSender)
    }
    track.addEventListener('ended', () => stopScreenShare())
  }

  function closePeer(userId: string) {
    const e = peers.get(userId)
    if (!e) return
    try { e.pc.close() } catch { /* ignore */ }
    if (e.audioEl) {
      e.audioEl.srcObject = null
      e.audioEl.remove()
    }
    removeRemoteScreen(userId)
    analysers.delete(userId)
    peers.delete(userId)
  }

  async function startHuddle() {
    huddleError.value = null
    try {
      await ensureLocalStream()
      // Any peer minted before the mic existed has a trackless audio sender —
      // it would negotiate fine and carry silence. Arm them all now.
      const mic = localStream?.getAudioTracks()[0] ?? null
      if (mic) {
        for (const entry of peers.values()) {
          if (entry.audioSender && !entry.audioSender.track) void entry.audioSender.replaceTrack(mic)
        }
      }
      huddleSince = Date.now()
      inHuddle.value = true
      playSelfJoin()
      trackPresence()
      reconcilePeers()
    } catch {
      huddleError.value = 'Microphone access is needed to join the huddle.'
      inHuddle.value = false
    }
  }

  function stopHuddle() {
    if (inHuddle.value) playSelfLeave()
    inHuddle.value = false
    muted.value = false
    huddleSince = 0
    stopScreenShare()
    remoteScreens.value = {}
    for (const uid of [...peers.keys()]) closePeer(uid)
    nsPipeline?.destroy()
    nsPipeline = null
    rnnoiseActive.value = false
    rawStream?.getTracks().forEach((t) => t.stop())
    rawStream = null
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    analysers.clear()
    speaking.value = new Set()
    if (speakingRaf) {
      cancelAnimationFrame(speakingRaf)
      speakingRaf = 0
    }
    audioCtx?.close().catch(() => {})
    audioCtx = null
    trackPresence()
  }

  function toggleHuddle() {
    if (inHuddle.value) stopHuddle()
    else void startHuddle()
  }
  function toggleMute() {
    muted.value = !muted.value
    // Mute the real mic (upstream of RNNoise) so both processed/raw paths silence.
    ;(rawStream ?? localStream)?.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    trackPresence()
  }
  function toggleSounds() {
    soundMuted.value = !soundMuted.value
    setSoundsMuted(soundMuted.value)
  }
  async function toggleNoise() {
    noiseSuppression.value = !noiseSuppression.value
    if (typeof window !== 'undefined')
      window.localStorage.setItem(NOISE_KEY, noiseSuppression.value ? '1' : '0')
    if (nsPipeline) {
      // Instant, pop-free crossfade — no track swap / renegotiation.
      nsPipeline.setEnabled(noiseSuppression.value)
    } else {
      // RNNoise unavailable → fall back to the browser's native suppressor.
      try {
        await (rawStream ?? localStream)?.getAudioTracks()[0]?.applyConstraints({
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: noiseSuppression.value,
        })
      } catch { /* runtime retune unsupported */ }
    }
  }

  watch(
    channelId,
    async (id) => {
      const token = ++setupToken
      await teardown()
      allMessages.value = []
      reactions.value = {}
      activeId = null
      if (id && token === setupToken) await setup(id, token)
    },
    { immediate: true },
  )

  onUnmounted(teardown)

  return {
    rootMessages,
    repliesByParent,
    decisions,
    pinned,
    reads,
    typing,
    sendTyping,
    loading,
    hasMore,
    loadingOlder,
    loadOlder,
    loadAround,
    sending,
    online,
    huddlePeople,
    huddleHost,
    inHuddle,
    muted,
    speaking,
    huddleError,
    sharingScreen,
    remoteScreens,
    localScreen,
    toggleScreenShare,
    switchScreenShare,
    soundMuted,
    toggleSounds,
    viewers,
    registerViewer,
    unregisterViewer,
    noiseSuppression,
    rnnoiseActive,
    toggleNoise,
    reactionList,
    pollTally,
    profile,
    send,
    toggleReaction,
    createPoll,
    votePoll,
    createReminder,
    reminders,
    loadReminders,
    updateReminder,
    toggleReminderDone,
    snoozeReminder,
    deleteReminder,
    togglePin,
    markDecision,
    toggleDecisionDone,
    editMessage,
    deleteMessage,
    createTaskFromMessage,
    projectsForMessage,
    toggleHuddle,
    toggleMute,
  }
}
