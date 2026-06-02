import { ref, computed, onUnmounted } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { iceServers } from '@/lib/iceServers'
import { createNoisePipeline, type NoisePipeline } from '@/lib/noiseSuppressor'

// Gmeet-style guest meeting rooms. WebRTC audio + screen-share mesh signaled
// over a PUBLIC realtime channel `meet:<token>` — the unguessable token in the
// URL is the access key, so guests need no account. Logged-in members/host
// bypass the lobby; guests wait until an admitter lets them in (cooperative —
// the link is the real gate, the lobby is for host awareness/control).

export type Role = 'host' | 'member' | 'guest'
export type RoomStatus = 'idle' | 'joining' | 'lobby' | 'live' | 'denied' | 'ended' | 'error'

export interface RoomMeta {
  id: string
  title: string | null
  host_id: string
  expires_at: string
  ended_at: string | null
  valid: boolean
}
export interface Participant {
  userId: string
  name: string
  role: Role
  admitted: boolean
  muted: boolean
  sharing?: boolean
  since?: number
}

function guestId(): string {
  const KEY = 'buzzybee.meet.guest-id'
  let id = typeof window !== 'undefined' ? window.sessionStorage.getItem(KEY) : null
  if (!id) {
    id = (crypto.randomUUID?.() ?? `guest-${Math.random().toString(36).slice(2)}-${Date.now()}`)
    window.sessionStorage.setItem(KEY, id)
  }
  return id
}

export function useMeetingRoom() {
  const auth = useAuthStore()

  const status = ref<RoomStatus>('idle')
  const error = ref<string | null>(null)
  const room = ref<RoomMeta | null>(null)
  const token = ref('')
  const online = ref<Participant[]>([])

  const muted = ref(false)
  const sharingScreen = ref(false)
  const remoteScreens = ref<Record<string, MediaStream>>({})
  const speaking = ref<Set<string>>(new Set())
  const noiseSuppression = ref(
    typeof window === 'undefined' || window.localStorage.getItem('buzzybee.comms.noise-suppression') !== '0',
  )
  const rnnoiseActive = ref(false)

  const myId = ref('')
  const myName = ref('')
  const myRole = ref<Role>('guest')
  const amAdmitted = ref(false)

  const ICE = iceServers()
  let localStream: MediaStream | null = null
  let rawStream: MediaStream | null = null
  let nsPipeline: NoisePipeline | null = null
  let screenStream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let speakingRaf = 0
  const analysers = new Map<string, AnalyserNode>()

  interface PeerEntry {
    pc: RTCPeerConnection
    audioEl?: HTMLAudioElement
    screenSender?: RTCRtpSender
    makingOffer: boolean
    ignoreOffer: boolean
    polite: boolean
  }
  const peers = new Map<string, PeerEntry>()
  let channel: RealtimeChannel | null = null

  const admittedPeople = computed(() => online.value.filter((p) => p.admitted))
  const waiting = computed(() => online.value.filter((p) => !p.admitted && p.userId !== myId.value))
  const canAdmit = computed(() => myRole.value === 'host' || myRole.value === 'member')
  const isHost = computed(() => myRole.value === 'host')
  const me = () => myId.value

  // ── Resolve + join ──────────────────────────────────────────────────────────
  async function resolve(tk: string): Promise<RoomMeta | null> {
    const { data, error: e } = await supabase.rpc('get_meeting_room', { p_token: tk })
    if (e) {
      error.value = e.message
      return null
    }
    const row = (Array.isArray(data) ? data[0] : data) as RoomMeta | undefined
    return row ?? null
  }

  async function join(tk: string, displayName?: string) {
    token.value = tk
    status.value = 'joining'
    error.value = null
    const meta = await resolve(tk)
    if (!meta) {
      status.value = 'error'
      error.value = error.value || 'Meeting not found.'
      return
    }
    room.value = meta
    if (!meta.valid) {
      status.value = 'ended'
      return
    }

    const user = auth.user
    if (user) {
      myId.value = user.id
      myName.value = auth.fullName || 'Member'
      myRole.value = user.id === meta.host_id ? 'host' : 'member'
      amAdmitted.value = true // logged-in teammates bypass the lobby
    } else {
      myId.value = guestId()
      myName.value = displayName?.trim() || 'Guest'
      myRole.value = 'guest'
      amAdmitted.value = false
    }

    await subscribe(tk)
    if (amAdmitted.value) await goLive()
    else status.value = 'lobby'
  }

  async function subscribe(tk: string) {
    const ch = supabase.channel(`meet:${tk}`, {
      config: { broadcast: { self: false }, presence: { key: myId.value } },
    })
    ch.on('presence', { event: 'sync' }, onPresence)
    ch.on('presence', { event: 'join' }, onPresence)
    ch.on('presence', { event: 'leave' }, onPresence)
    ch.on('broadcast', { event: 'rtc' }, (m: { payload?: any }) => void handleSignal(m.payload))
    ch.on('broadcast', { event: 'ctrl' }, (m: { payload?: any }) => onCtrl(m.payload))
    await ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') trackPresence()
    })
    channel = ch
  }

  function trackPresence() {
    if (!channel) return
    void channel.track({
      userId: myId.value,
      name: myName.value,
      role: myRole.value,
      admitted: amAdmitted.value,
      muted: muted.value,
      sharing: sharingScreen.value,
      since: undefined,
    } satisfies Participant)
  }

  function onPresence() {
    if (!channel) return
    const state = channel.presenceState<Participant>()
    const seen = new Map<string, Participant>()
    for (const metas of Object.values(state)) {
      for (const m of metas as unknown as Participant[]) if (m?.userId) seen.set(m.userId, m)
    }
    online.value = [...seen.values()]
    const sharers = new Set(online.value.filter((p) => p.sharing).map((p) => p.userId))
    for (const uid of Object.keys(remoteScreens.value)) if (!sharers.has(uid)) removeRemoteScreen(uid)
    if (amAdmitted.value) reconcilePeers()
  }

  // ── Lobby control ─────────────────────────────────────────────────────────
  function sendCtrl(type: string, to?: string) {
    void channel?.send({ type: 'broadcast', event: 'ctrl', payload: { type, to, from: myId.value } })
  }
  function onCtrl(p: any) {
    if (!p) return
    if (p.type === 'ended') {
      status.value = 'ended'
      teardownMedia()
      return
    }
    if (p.to !== myId.value) return
    if (p.type === 'admit' && !amAdmitted.value) void goLive()
    else if (p.type === 'deny') {
      status.value = 'denied'
      leave()
    } else if (p.type === 'kick') {
      leave()
      status.value = 'ended'
    }
  }
  function admit(userId: string) {
    if (!canAdmit.value) return
    sendCtrl('admit', userId)
  }
  function deny(userId: string) {
    if (!canAdmit.value) return
    sendCtrl('deny', userId)
  }

  async function goLive() {
    amAdmitted.value = true
    status.value = 'live'
    try {
      await ensureLocalStream()
    } catch {
      error.value = 'Microphone access is needed to join.'
    }
    trackPresence()
    reconcilePeers()
  }

  async function endMeeting() {
    if (myRole.value !== 'host' || !room.value) return
    try {
      await supabase.from('meeting_rooms').update({ ended_at: new Date().toISOString() }).eq('id', room.value.id)
    } catch { /* best effort */ }
    sendCtrl('ended')
    status.value = 'ended'
    teardownMedia()
  }

  // ── Media (mic + RNNoise) ───────────────────────────────────────────────────
  async function ensureLocalStream() {
    if (localStream) return localStream
    const deviceId =
      typeof window !== 'undefined' ? window.localStorage.getItem('buzzybee.comms.mic-device') : null
    const audio: MediaTrackConstraints = { echoCancellation: true, autoGainControl: true, noiseSuppression: false }
    if (deviceId) audio.deviceId = { exact: deviceId }
    try {
      rawStream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    } catch {
      rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    }
    nsPipeline = await createNoisePipeline(rawStream, noiseSuppression.value)
    rnnoiseActive.value = !!nsPipeline
    localStream = nsPipeline ? nsPipeline.stream : rawStream
    rawStream.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    setupAnalyser(myId.value, localStream)
    return localStream
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
    } catch { /* best effort */ }
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
        if (Math.sqrt(sum / buf.length) > 0.045 && !(uid === myId.value && muted.value)) next.add(uid)
      }
      const changed = next.size !== speaking.value.size || [...next].some((u) => !speaking.value.has(u))
      if (changed) speaking.value = next
    }
    speakingRaf = requestAnimationFrame(tick)
  }

  // ── WebRTC mesh (perfect negotiation) ────────────────────────────────────────
  function sendRtc(to: string, kind: string, data: unknown) {
    void channel?.send({ type: 'broadcast', event: 'rtc', payload: { from: myId.value, to, kind, data } })
  }
  function getPeer(userId: string): PeerEntry {
    const existing = peers.get(userId)
    if (existing) return existing
    const pc = new RTCPeerConnection({ iceServers: ICE })
    const entry: PeerEntry = { pc, makingOffer: false, ignoreOffer: false, polite: myId.value > userId }
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
      } catch { /* ignore */ } finally {
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
  function reconcilePeers() {
    if (!amAdmitted.value) return
    const wanted = new Set(admittedPeople.value.map((p) => p.userId).filter((u) => u !== myId.value))
    for (const uid of wanted) if (!peers.has(uid)) getPeer(uid)
    for (const uid of [...peers.keys()]) if (!wanted.has(uid)) closePeer(uid)
  }
  async function handleSignal(p: any) {
    if (!p || p.to !== myId.value || !amAdmitted.value) return
    const entry = getPeer(p.from as string)
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
          sendRtc(p.from, 'desc', pc.localDescription)
        }
      } else if (p.kind === 'ice') {
        try {
          await pc.addIceCandidate(p.data)
        } catch (e) {
          if (!entry.ignoreOffer) throw e
        }
      }
    } catch { /* ignore */ }
  }

  // ── Screen share ──────────────────────────────────────────────────────────
  async function tuneScreenSender(sender: RTCRtpSender) {
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
      params.encodings[0].maxBitrate = 2_500_000
      params.encodings[0].scaleResolutionDownBy = 1
      await sender.setParameters(params)
    } catch { /* unsupported */ }
  }
  function removeRemoteScreen(userId: string) {
    if (!remoteScreens.value[userId]) return
    const next = { ...remoteScreens.value }
    delete next[userId]
    remoteScreens.value = next
  }
  async function startScreenShare() {
    if (!amAdmitted.value || sharingScreen.value) return
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      })
    } catch {
      return
    }
    const track = screenStream.getVideoTracks()[0]
    if (!track) return
    if ('contentHint' in track) (track as any).contentHint = 'detail'
    sharingScreen.value = true
    for (const entry of peers.values()) {
      entry.screenSender = entry.pc.addTrack(track, screenStream)
      void tuneScreenSender(entry.screenSender)
    }
    track.addEventListener('ended', () => stopScreenShare())
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

  // ── Controls ────────────────────────────────────────────────────────────────
  function toggleMute() {
    muted.value = !muted.value
    ;(rawStream ?? localStream)?.getAudioTracks().forEach((t) => (t.enabled = !muted.value))
    trackPresence()
  }
  function toggleNoise() {
    noiseSuppression.value = !noiseSuppression.value
    if (typeof window !== 'undefined')
      window.localStorage.setItem('buzzybee.comms.noise-suppression', noiseSuppression.value ? '1' : '0')
    nsPipeline?.setEnabled(noiseSuppression.value)
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

  function teardownMedia() {
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
  }

  async function leave() {
    teardownMedia()
    if (channel) {
      try {
        await channel.untrack()
        await supabase.removeChannel(channel)
      } catch { /* ignore */ }
      channel = null
    }
  }

  onUnmounted(leave)

  return {
    status,
    error,
    room,
    online,
    admittedPeople,
    waiting,
    canAdmit,
    isHost,
    myId,
    muted,
    sharingScreen,
    remoteScreens,
    speaking,
    noiseSuppression,
    rnnoiseActive,
    me,
    join,
    admit,
    deny,
    endMeeting,
    leave,
    toggleMute,
    toggleScreenShare,
    toggleNoise,
  }
}
