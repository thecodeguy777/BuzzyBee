import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
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
import { iceServers } from '@/lib/iceServers'

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
  user_id: string
  user_name: string | null
  body: string
  attachments: Attachment[]
  mentioned_user_ids: string[]
  is_pinned: boolean
  is_decision: boolean
  decision_done: boolean
  linked_task_id: string | null
  edited_at: string | null
  created_at: string
  updated_at: string
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
  const loading = ref(false)
  const sending = ref(false)
  const online = ref<HuddlePresence[]>([])

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
  function profile(userId: string) {
    return team.profiles[userId] ?? null
  }

  function upsertMessage(row: CommsMessage | null | undefined) {
    if (!row?.id) return
    const i = allMessages.value.findIndex((m) => m.id === row.id)
    if (i === -1) {
      allMessages.value = [...allMessages.value, row]
      if (!team.profiles[row.user_id]) void team.fetchProfiles([row.user_id])
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

  async function loadHistory(id: string, opts: { silent?: boolean } = {}) {
    if (!opts.silent) loading.value = true
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      allMessages.value = (data ?? []) as CommsMessage[]
      const ids = [...new Set(allMessages.value.map((m) => m.user_id))].filter((u) => !team.profiles[u])
      if (ids.length) void team.fetchProfiles(ids)
      await loadReactions()
    } catch (e) {
      console.warn('[comms] loadHistory:', (e as Error).message)
      if (!opts.silent) allMessages.value = []
    } finally {
      if (!opts.silent) loading.value = false
    }
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

  async function teardown() {
    online.value = []
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

  async function setup(id: string, token: number) {
    activeId = id
    await loadHistory(id)
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
      if (table === 'message_reactions') {
        if (p.operation === 'DELETE' || m.event === 'DELETE') applyReactionRow(old, true)
        else applyReactionRow(rec, false)
      } else {
        // messages
        if (p.operation === 'DELETE' || m.event === 'DELETE') {
          removeMessage(old?.id)
        } else {
          const incoming = rec as CommsMessage
          const isNew = !!incoming?.id && !allMessages.value.some((mm) => mm.id === incoming.id)
          const fromOther = !!incoming?.user_id && incoming.user_id !== me()
          upsertMessage(incoming)
          // New message from someone else that you didn't see → ping + bump unread.
          if (isNew && fromOther && !isViewing()) {
            playMessage()
            if (!incoming.parent_id) channelsStore.bumpUnread(incoming.channel_id)
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

  async function patchMessage(id: string, patch: Partial<CommsMessage>) {
    const i = allMessages.value.findIndex((m) => m.id === id)
    const prev = i !== -1 ? { ...allMessages.value[i] } : null
    if (i !== -1) allMessages.value[i] = { ...allMessages.value[i], ...patch }
    const { error } = await supabase.from('messages').update(patch).eq('id', id)
    if (error) {
      if (prev && i !== -1) allMessages.value[i] = prev
      console.warn('[comms] patchMessage:', error.message)
    }
  }
  const togglePin = (m: CommsMessage) => patchMessage(m.id, { is_pinned: !m.is_pinned })
  const markDecision = (m: CommsMessage) => patchMessage(m.id, { is_decision: !m.is_decision })
  const toggleDecisionDone = (m: CommsMessage) => patchMessage(m.id, { decision_done: !m.decision_done })

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
  ): Promise<string | null> {
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
    // Best-effort back-link (works for the author / managers per RLS).
    void patchMessage(m.id, { linked_task_id: task.id })
    return task.id
  }

  // ── Huddle: WebRTC audio mesh ───────────────────────────────────────────────
  function sendRtc(to: string, kind: string, data: unknown) {
    void channel?.send({ type: 'broadcast', event: 'rtc', payload: { from: me(), to, kind, data } })
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
    const entry: PeerEntry = { pc, makingOffer: false, ignoreOffer: false, polite: myId > userId }
    peers.set(userId, entry)

    localStream?.getTracks().forEach((t) => pc.addTrack(t, localStream!))
    if (screenStream) {
      const vt = screenStream.getVideoTracks()[0]
      if (vt) {
        entry.screenSender = pc.addTrack(vt, screenStream)
        void tuneScreenSender(entry.screenSender)
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
        remoteScreens.value = { ...remoteScreens.value, [userId]: e.streams[0] }
        e.track.addEventListener('ended', () => removeRemoteScreen(userId))
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
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePeer(userId)
    }
    return entry
  }

  // Open a peer to everyone in the huddle (both sides create one; negotiation
  // bootstraps via onnegotiationneeded). Close peers who left.
  function reconcilePeers() {
    const myId = me()
    if (!inHuddle.value || !myId) return
    const wanted = new Set(huddlePeople.value.map((p) => p.userId).filter((u) => u !== myId))
    for (const uid of wanted) if (!peers.has(uid)) getPeer(uid)
    for (const uid of [...peers.keys()]) if (!wanted.has(uid)) closePeer(uid)
  }

  async function handleSignal(p: any) {
    if (!p || p.to !== me()) return
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
        if (desc.type === 'offer') {
          await pc.setLocalDescription()
          sendRtc(from, 'desc', pc.localDescription)
        }
      } else if (p.kind === 'ice') {
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
    for (const entry of peers.values()) {
      entry.screenSender = entry.pc.addTrack(track, screenStream) // → renegotiation
      void tuneScreenSender(entry.screenSender)
    }
    track.addEventListener('ended', () => stopScreenShare()) // browser "Stop sharing"
    trackPresence()
  }

  function stopScreenShare() {
    if (!sharingScreen.value && !screenStream) return
    for (const entry of peers.values()) {
      if (entry.screenSender) {
        try { entry.pc.removeTrack(entry.screenSender) } catch { /* ignore */ }
        entry.screenSender = undefined
      }
    }
    screenStream?.getTracks().forEach((t) => t.stop())
    screenStream = null
    sharingScreen.value = false
    trackPresence()
  }

  function toggleScreenShare() {
    if (sharingScreen.value) stopScreenShare()
    else void startScreenShare()
  }

  function closePeer(userId: string) {
    const e = peers.get(userId)
    if (!e) return
    try { e.pc.close() } catch { /* ignore */ }
    if (e.audioEl) {
      e.audioEl.srcObject = null
      e.audioEl.remove()
    }
    analysers.delete(userId)
    peers.delete(userId)
  }

  async function startHuddle() {
    huddleError.value = null
    try {
      await ensureLocalStream()
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
    loading,
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
    toggleScreenShare,
    soundMuted,
    toggleSounds,
    registerViewer,
    unregisterViewer,
    noiseSuppression,
    rnnoiseActive,
    toggleNoise,
    reactionList,
    profile,
    send,
    toggleReaction,
    togglePin,
    markDecision,
    toggleDecisionDone,
    createTaskFromMessage,
    projectsForMessage,
    toggleHuddle,
    toggleMute,
  }
}
