<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Hash, Search, Users, Headphones, Mic, MicOff, MonitorUp, MonitorOff, PictureInPicture2, Monitor, PhoneOff,
  Paperclip, Image as ImageIcon, Link2, Smile, AtSign, Send, X, CheckSquare,
  Settings2, Crown, Maximize2, Bell, BellOff, Wand2, Video, Menu, ArrowDown, Loader2, AlertCircle,
  Slash, BarChart3, MessageSquare, AlarmClock
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import CommsMessage from '@/components/comms/CommsMessage.vue'
import TypingIndicator from '@/components/comms/TypingIndicator.vue'
import MicCheck from '@/components/comms/MicCheck.vue'
import MediaPicker from '@/components/comms/MediaPicker.vue'
import CommsChannelList from '@/components/comms/CommsChannelList.vue'
import CommsActivityRail from '@/components/comms/CommsActivityRail.vue'
import CommsTaskComposer from '@/components/comms/CommsTaskComposer.vue'
import CommsPollComposer from '@/components/comms/CommsPollComposer.vue'
import CommsReminderComposer from '@/components/comms/CommsReminderComposer.vue'
import { type Gif } from '@/lib/giphy'
import { createMeetingRoom } from '@/lib/meetingRoom'
import { useChannelsStore } from '@/stores/channels'
import { COMMS_STREAM, HUDDLE_PRESENCE } from '@/composables/commsStream'
import { screenPoppedOut } from '@/composables/useScreenDock'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'
import { useCrmStore } from '@/stores/crm'
import { useDraftsStore } from '@/stores/drafts'
import { uploadCommsFile, linkAttachment } from '@/lib/commsAttachments'
import { displayName } from '@/lib/format'
import type { Attachment, CommsMessage as CommsMsg } from '@/composables/useChannelStream'

const router = useRouter()
const channels = useChannelsStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const auth = useAuthStore()
const team = useTeamStore()

const currentChannelId = computed(() => channels.currentChannelId)
// Shared with the floating CommsDock + provided by WorkstationLayout so the
// huddle survives navigation.
const injectedStream = inject(COMMS_STREAM)
if (!injectedStream) {
  throw new Error('CommsView must render inside WorkstationLayout — COMMS_STREAM was not provided.')
}
const stream = injectedStream
const huddlePresence = inject(HUDDLE_PRESENCE, null)
const route = useRoute()

// Jump-to-message (from global search ?m=…): scroll the target line into view
// and flash it once, then drop ?m so it doesn't re-trigger on the next visit.
function flashMessage(id: string) {
  let tries = 0
  let requested = false
  const tick = () => {
    const el = document.querySelector(`[data-mid="${id}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('msg-flash')
      window.setTimeout(() => el.classList.remove('msg-flash'), 1800)
      const q = { ...route.query }
      delete q.m
      void router.replace({ query: q })
      return
    }
    // Not in the loaded page yet → pull it in (and everything up to now).
    if (!requested && tries >= 4) {
      requested = true
      void stream.loadAround(id)
    }
    if (tries++ < 60) window.setTimeout(tick, 100)
  }
  nextTick(tick)
}
watch(() => route.query.m, (m) => { if (m) flashMessage(String(m)) }, { immediate: true })

const canManage = computed(() => auth.isAdmin || auth.role === 'pm')
const commsError = ref<string | null>(null)
const showMicCheck = ref(false)

// ── CRM bridge: "Log to CRM" on messages in CRM-linked channels ──────────────
// A channel maps to CRM either through a deal's linked channel or a company's.
const crm = useCrmStore()
const crmTarget = computed(() => {
  const chId = currentChannelId.value
  if (!chId || !crm.loaded) return null
  const deal = crm.deals.find((d) => d.channelId === chId)
  if (deal) return { dealId: deal.id as string | null, companyId: deal.companyId, label: deal.title }
  const co = Object.values(crm.companies).find((c) => c.channelId === chId)
  return co ? { dealId: null as string | null, companyId: co.id, label: co.name } : null
})
async function logMessageToCrm(m: CommsMsg) {
  const t = crmTarget.value
  if (!t) return
  const text = m.body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 280)
  const author = m.user_name || (m.user_id ? team.profiles[m.user_id]?.full_name : null) || 'teammate'
  const body = 'logged from #' + (channels.currentChannel?.name ?? 'chat') + ': “' + text + '” — ' + author
  const ok = t.dealId
    ? await crm.logActivity(t.dealId, { type: 'message', body })
    : await crm.logCompanyActivity(t.companyId, { type: 'message', body })
  if (ok) fireToast('Logged to CRM', t.label)
  else if (crm.error) { commsError.value = crm.error; crm.error = null }
}

// Mobile: channel list lives in a slide-over drawer (the desktop aside is md+).
const mobileNav = ref(false)
// Right-side Activity rail (tasks created from chat). Open by default.
const activityOpen = ref(true)
// Huddle indicators for the channel list: the global cross-channel presence
// map (one topic for the whole workstation — see useHuddlePresence), overlaid
// with the live count for the channel we're actively bound to so our own
// huddle shows instantly, before the presence round-trip.
const huddleByChannel = computed<Record<string, number>>(() => {
  const out: Record<string, number> = { ...(huddlePresence?.byChannel.value ?? {}) }
  const cid = currentChannelId.value
  const n = stream.huddlePeople.value.length
  if (cid && n > 0) out[cid] = Math.max(out[cid] ?? 0, n)
  else if (cid && !stream.inHuddle.value && out[cid]) {
    // We're looking at this channel and the live stream says no huddle —
    // trust the stream over a stale presence echo.
    const live = stream.huddlePeople.value.length
    if (live === 0) delete out[cid]
  }
  return out
})
// Global online roster (everyone connected for this client), with a fallback to
// the current channel's presence if the cross-channel presence isn't available.
const onlineIds = computed(
  () => huddlePresence?.onlineUsers.value ?? stream.online.value.map((p) => p.userId)
)

// Channel occupancy — who (besides you) is sitting in each channel right now,
// resolved to profiles for the mini honeycombs in the channel list.
type ViewerMember = { id: string; name: string; avatarUrl: string | null }
const channelViewers = computed<Record<string, ViewerMember[]>>(() => {
  const src = huddlePresence?.viewersByChannel.value ?? {}
  const out: Record<string, ViewerMember[]> = {}
  for (const [cid, ids] of Object.entries(src)) {
    out[cid] = ids.map((id) => {
      const p = team.profiles[id]
      return { id, name: p?.full_name ?? 'Member', avatarUrl: p?.avatar_url ?? null }
    })
  }
  return out
})
watch(channelViewers, (map) => {
  const missing = Object.values(map).flat().filter((m) => !team.profiles[m.id]).map((m) => m.id)
  if (missing.length) void team.fetchProfiles(missing)
})

// ── Seen-by (read receipts) ───────────────────────────────────────────────────
// Reads ride the stream's private broadcast (same fast path as messages), so the
// honeycomb updates the instant another member catches up.
const reads = stream.reads
type SeenMember = { id: string; name: string; avatarUrl: string | null }
// Everyone (but you) who has caught up to the newest message — rendered as one
// honeycomb at the bottom, instead of scattering a lone avatar per message.
const lastMessageId = computed(() => stream.rootMessages.value.at(-1)?.id ?? null)
const seenMembers = computed<SeenMember[]>(() => {
  const last = stream.rootMessages.value.at(-1)
  if (!last) return []
  const t = new Date(last.created_at).getTime()
  const out: SeenMember[] = []
  for (const r of reads.value) {
    if (r.user_id === auth.user?.id || !r.last_read_at) continue
    if (new Date(r.last_read_at).getTime() >= t) {
      const p = team.profiles[r.user_id]
      out.push({ id: r.user_id, name: p?.full_name ?? 'Member', avatarUrl: p?.avatar_url ?? null })
    }
  }
  return out
})
function seenFor(id: string): SeenMember[] {
  return id === lastMessageId.value ? seenMembers.value : []
}

// Who's currently typing in this channel (self already excluded by the stream).
const typingMembers = computed(() =>
  stream.typing.value.map((t) => ({ id: t.userId, name: t.name, avatarUrl: t.avatarUrl }))
)

// ── Unseen "breathing" highlight ──────────────────────────────────────────────
// Messages newer than what you'd read on entry, plus live arrivals, pulse softly
// to catch your eye — then settle after a few seconds.
const freshIds = ref<Set<string>>(new Set())
const freshTimers = new Map<string, number>()
function markFresh(id: string, ttl = 7000) {
  if (!freshIds.value.has(id)) freshIds.value = new Set(freshIds.value).add(id)
  if (freshTimers.has(id)) window.clearTimeout(freshTimers.get(id))
  freshTimers.set(
    id,
    window.setTimeout(() => {
      const next = new Set(freshIds.value)
      next.delete(id)
      freshIds.value = next
      freshTimers.delete(id)
    }, ttl)
  )
}
function clearFresh() {
  for (const t of freshTimers.values()) window.clearTimeout(t)
  freshTimers.clear()
  freshIds.value = new Set()
}
// A message breathes when it's newer than `breatheBaseline` and not ours. The
// baseline is captured ONCE per channel (not re-derived from Date.now() on each
// arrival — that races the server clock and silently swallows live messages):
//   • returning user → your last_read_at, so everything unread since last visit pulses
//   • first visit    → the newest message at load time, so only genuine new arrivals pulse
// `seenIds` dedupes so pagination prepends (old messages) never breathe.
let breatheChannel: string | null = null
let breatheBaseline = 0
const seenIds = new Set<string>()
function isFresh(m: { id: string; user_id: string | null; created_at: string }) {
  return m.user_id !== auth.user?.id && new Date(m.created_at).getTime() > breatheBaseline
}
function primeBreathing() {
  const cid = currentChannelId.value ?? ''
  const list = stream.rootMessages.value
  breatheChannel = cid
  seenIds.clear()
  for (const m of list) seenIds.add(m.id)
  const entry = channels.entryReadAt[cid]
  const newest = list.length ? new Date(list[list.length - 1].created_at).getTime() : Date.now()
  breatheBaseline = entry ? new Date(entry).getTime() : newest
  if (entry) for (const m of list) if (isFresh(m)) markFresh(m.id) // unread-since-last-visit
}
watch(
  () => stream.rootMessages.value,
  (list) => {
    if ((currentChannelId.value ?? '') !== breatheChannel) return // wait for primeBreathing
    for (const m of list) {
      if (seenIds.has(m.id)) continue
      seenIds.add(m.id)
      if (isFresh(m)) markFresh(m.id)
    }
  }
)

// ── Direct messages ──────────────────────────────────────────────────────────
const isDmChannel = computed(() => !!channels.currentChannel?.is_dm)
const dmPartner = computed(() => {
  const ch = channels.currentChannel
  if (!ch?.is_dm) return null
  const uid = channels.dmOther[ch.id]
  const p = uid ? team.profiles[uid] : null
  return {
    userId: uid ?? null,
    name: displayName(p, 'Direct message'),
    avatarUrl: p?.avatar_url ?? null,
    online: !!uid && onlineIds.value.includes(uid)
  }
})
async function startDm(userId: string) {
  membersOpen.value = false
  if (userId === auth.user?.id) return
  try {
    const id = await channels.openDm(userId)
    // DMs live in their own surface now.
    if (id) {
      chooseChannel(id)
      void router.push({ name: 'workstation-messages' })
    }
  } catch (e) {
    commsError.value = (e as Error).message
  }
}
// Unread in channels other than the one being viewed — surfaced on the mobile
// menu button since the channel list (with its per-channel badges) is hidden.
const otherChannelsUnread = computed(() =>
  Object.entries(channels.unread).reduce(
    (n, [id, c]) => (id !== currentChannelId.value ? n + (c || 0) : n),
    0
  )
)

async function newMeeting() {
  if (!auth.user) return
  try {
    const token = await createMeetingRoom(auth.user.id, `${clients.currentClient?.name ?? 'Team'} meeting`)
    router.push({ name: 'meeting-room', params: { token } })
  } catch (e) {
    commsError.value = (e as Error).message
  }
}

// ── Channel switching ─────────────────────────────────────────────────────────
// Switching the viewed channel re-binds the shared stream, which would drop an
// active huddle (it lives on the channel you joined). Confirm first.
function chooseChannel(id: string) {
  mobileNav.value = false
  if (id === currentChannelId.value) return
  if (stream.inHuddle.value &&
      !window.confirm(`Leave the huddle in #${channels.currentChannel?.name} to open another channel?`)) {
    return
  }
  channels.select(id)
}

// ── Search ────────────────────────────────────────────────────────────────────
const searchOpen = ref(false)
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const searching = computed(() => searchQuery.value.trim().length > 0)
function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) nextTick(() => searchInput.value?.focus())
  else searchQuery.value = ''
}
const displayedMessages = computed(() => {
  if (!searching.value) return stream.rootMessages.value
  const q = searchQuery.value.trim().toLowerCase()
  return stream.rootMessages.value.filter(
    (m) => (m.body || '').toLowerCase().includes(q) || (m.user_name || '').toLowerCase().includes(q)
  )
})

// ── Members ────────────────────────────────────────────────────────────────────
const membersOpen = ref(false)
const memberList = computed(() => {
  const channelOnline = new Set(stream.online.value.map((o) => o.userId))
  const globalOnline = new Set(onlineIds.value)
  const rows = stream.online.value.map((o) => ({
    id: o.userId, name: o.name, avatarUrl: o.avatarUrl, online: true, inHuddle: o.inHuddle
  }))
  for (const id of Object.keys(team.profiles)) {
    if (channelOnline.has(id)) continue
    const p = team.profiles[id]
    if (p) rows.push({ id, name: p.full_name ?? 'Member', avatarUrl: p.avatar_url ?? null, online: globalOnline.has(id), inHuddle: false })
  }
  return rows
})

// ── Composer ────────────────────────────────────────────────────────────────
type PendingAtt = Attachment & { _localId: string; status?: 'uploading' | 'error' }
// Messenger-style draft: every keystroke lands in the per-channel drafts store,
// so switching channels (or reloading) brings the half-typed message back.
const drafts = useDraftsStore()
const draft = computed({
  get: () => drafts.get(currentChannelId.value),
  set: (v) => drafts.set(currentChannelId.value, v)
})
const pending = ref<PendingAtt[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const fileAccept = ref('*/*')
const streamScroller = ref<HTMLElement | null>(null)
const sendFailed = ref(false)
let pendKey = 0

// Varied widths so the loading skeleton reads like real chat, not a table.
const skeletonRows = ['70%', '45%', '85%', '55%', '78%', '40%', '62%']

const uploading = computed(() => pending.value.some((p) => p.status === 'uploading'))
const sendableAttachments = computed(() => pending.value.filter((p) => !p.status))
const canSend = computed(
  () => !stream.sending.value && !uploading.value && (!!draft.value.trim() || sendableAttachments.value.length > 0)
)

// ── Scroll anchoring ──────────────────────────────────────────────────────────
// Only auto-scroll when the reader is already at the bottom; otherwise surface a
// "new messages" pill so reading scrollback isn't yanked away.
const atBottom = ref(true)
const newCount = ref(0)
function scrollToBottom() {
  // Pin to the newest message. Scrolls the container AND scrolls the last line
  // into view (robust to scrollHeight not being final mid-fade/image-load),
  // re-run across the load window.
  const go = () => {
    const el = streamScroller.value
    if (!el) return
    const last = displayedMessages.value.at(-1)
    const node = last ? (el.querySelector(`[data-mid="${last.id}"]`) as HTMLElement | null) : null
    if (node) node.scrollIntoView({ block: 'end' })
    el.scrollTop = el.scrollHeight
    atBottom.value = true
    newCount.value = 0
  }
  nextTick(go)
  requestAnimationFrame(go)
  for (const ms of [80, 300, 600, 1000]) window.setTimeout(go, ms)
}
// Fired when the message list finishes its enter transition — the only moment
// the content is guaranteed mounted + laid out, so scrollHeight is correct.
function onStreamRevealed() {
  if (!stream.loading.value && !route.query.m) scrollToBottom()
}
// Prepend older messages while preserving the visual scroll position.
async function loadOlderAnchored() {
  const el = streamScroller.value
  if (!el || !stream.hasMore.value || stream.loadingOlder.value) return
  const prevH = el.scrollHeight
  const prevTop = el.scrollTop
  await stream.loadOlder()
  await nextTick()
  const el2 = streamScroller.value
  if (el2) el2.scrollTop = prevTop + (el2.scrollHeight - prevH)
}
function onStreamScroll() {
  const el = streamScroller.value
  if (!el) return
  const wasBottom = atBottom.value
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (atBottom.value) {
    newCount.value = 0
    if (!wasBottom) markReadSoon() // scrolled down to catch up → mark seen
  }
  if (el.scrollTop < 160 && stream.hasMore.value && !stream.loadingOlder.value && !searching.value) {
    void loadOlderAnchored()
  }
}
// Advance our own read position when a new message lands while we're watching at
// the bottom — otherwise last_read_at freezes at entry time and other members
// never see us as having "seen" later messages. Debounced to coalesce bursts.
let markReadTimer: ReturnType<typeof setTimeout> | undefined
function markReadSoon() {
  clearTimeout(markReadTimer)
  markReadTimer = setTimeout(() => {
    const id = currentChannelId.value
    if (id && document.visibilityState === 'visible') void channels.markRead(id)
  }, 300)
}
watch(
  () => stream.rootMessages.value.length,
  (n, old) => {
    if (atBottom.value) {
      scrollToBottom()
      if (n > old) markReadSoon()
    } else if (n > old) newCount.value += n - old
  }
)
watch(currentChannelId, () => {
  pending.value = []
  // The draft is per-channel (drafts store) — don't wipe it, just re-fit the
  // composer to whatever draft the new channel has waiting.
  nextTick(autogrow)
  sendFailed.value = false
  mentionedIds.value = new Set()
  mentionOpen.value = false
  searchQuery.value = ''
  clearFresh()
  breatheChannel = null // re-baseline once the new channel's history loads
  atBottom.value = true
  nextTick(autogrow)
  if (!route.query.m) scrollToBottom()
})
// When a channel's history finishes loading, anchor the breathing baseline and
// land at the newest message (unless we're jumping to a specific one from search).
watch(
  () => stream.loading.value,
  (isLoading) => {
    if (isLoading) return
    primeBreathing()
    if (!route.query.m) scrollToBottom()
  },
  { immediate: true }
)

// ── Attachments ────────────────────────────────────────────────────────────────
function pickFiles(accept: string) {
  fileAccept.value = accept
  nextTick(() => fileInput.value?.click())
}
function replacePending(localId: string, next: PendingAtt) {
  pending.value = pending.value.map((p) => (p._localId === localId ? next : p))
}
function markPendingError(localId: string) {
  pending.value = pending.value.map((p) => (p._localId === localId ? { ...p, status: 'error' as const } : p))
}
function removePending(localId: string) {
  pending.value = pending.value.filter((p) => p._localId !== localId)
}
// Upload all files in parallel, each with its own optimistic chip + error state.
async function uploadAll(files: File[], cid: string) {
  const placeholders: PendingAtt[] = files.map((f) => ({
    _localId: `u${++pendKey}`,
    kind: f.type.startsWith('image/') ? 'image' : 'file',
    name: f.name,
    status: 'uploading'
  }))
  pending.value = [...pending.value, ...placeholders]
  await Promise.all(
    files.map(async (f, i) => {
      const ph = placeholders[i]
      try {
        const att = await uploadCommsFile(cid, f)
        replacePending(ph._localId, { ...att, _localId: ph._localId })
      } catch (err) {
        markPendingError(ph._localId)
        commsError.value = (err as Error).message
      }
    })
  )
}
async function onFilesChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const cid = currentChannelId.value
  if (!cid || !files.length) return
  await uploadAll(files, cid)
}
// Paste an image straight from the clipboard (e.g. a screenshot) → attach it.
async function onPaste(e: ClipboardEvent) {
  const items = Array.from(e.clipboardData?.items ?? [])
  const imageFiles = items
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f)
  if (imageFiles.length === 0) return // plain text paste — let it through
  e.preventDefault()
  const cid = currentChannelId.value
  if (!cid) return
  const named = imageFiles.map((f) =>
    f.name && f.name !== 'image.png'
      ? f
      : new File([f], `screenshot-${Date.now()}.png`, { type: f.type || 'image/png' })
  )
  await uploadAll(named, cid)
}

function addLink() {
  const url = window.prompt('Paste a link')
  if (!url) return
  const a = linkAttachment(url)
  if (a) pending.value = [...pending.value, { ...a, _localId: `l${++pendKey}` }]
}
function addEmoji(e: string) {
  const el = composerEl.value
  const caret = el?.selectionStart ?? draft.value.length
  draft.value = draft.value.slice(0, caret) + e + draft.value.slice(caret)
  nextTick(() => {
    el?.focus()
    const pos = caret + e.length
    el?.setSelectionRange(pos, pos)
    autogrow()
  })
}
// Grow the composer with its content (up to a cap) instead of a 1-line box.
function autogrow() {
  const el = composerEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

// ── Emoji / GIF picker (teleported out of the overflow-hidden composer) ────────
const showPicker = ref(false)
const pickerBtn = ref<HTMLElement | null>(null)
const pickerStyle = ref<Record<string, string>>({})
function positionPicker() {
  const el = pickerBtn.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const W = 320
  const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
  pickerStyle.value = { left: `${left}px`, bottom: `${window.innerHeight - r.top + 8}px` }
}
function togglePicker() {
  showPicker.value = !showPicker.value
  if (showPicker.value) nextTick(positionPicker)
}
function onReposition() {
  if (showPicker.value) positionPicker()
  if (mentionOpen.value) positionMention()
}
async function onPickGif(g: Gif) {
  showPicker.value = false
  try {
    await stream.send('', { attachments: [{ kind: 'image', name: 'GIF', url: g.url, mime: 'image/gif' }] })
    scrollToBottom()
  } catch (e) {
    commsError.value = (e as Error).message
  }
}

async function onSend() {
  const cid = currentChannelId.value
  const body = draft.value
  const prevPending = pending.value
  const atts: Attachment[] = sendableAttachments.value.map((p) => ({
    id: p.id, kind: p.kind, name: p.name, url: p.url, size: p.size, mime: p.mime
  }))
  if (!body.trim() && atts.length === 0) return
  const mentions = [...mentionedIds.value]
  draft.value = ''
  pending.value = []
  mentionOpen.value = false
  sendFailed.value = false
  nextTick(autogrow)
  try {
    await stream.send(body, { attachments: atts, mentions })
    mentionedIds.value = new Set()
    scrollToBottom()
  } catch (e) {
    // Restore the draft + attachments so nothing is lost, and flag it inline.
    // Write to the channel it was typed in — it may no longer be current.
    drafts.set(cid, body)
    pending.value = prevPending
    sendFailed.value = true
    commsError.value = (e as Error).message
    nextTick(autogrow)
  }
}

// ── @mention autocomplete ────────────────────────────────────────────────────
const composerEl = ref<HTMLTextAreaElement | null>(null)
const mentionPopover = ref<HTMLElement | null>(null)
const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStart = ref(-1)
const mentionIndex = ref(0)
const mentionStyle = ref<Record<string, string>>({})
const mentionedIds = ref<Set<string>>(new Set())

const mentionCandidates = computed(() => {
  if (!mentionOpen.value) return []
  const map = new Map<string, { id: string; name: string; avatarUrl: string | null }>()
  for (const p of stream.online.value) map.set(p.userId, { id: p.userId, name: p.name, avatarUrl: p.avatarUrl })
  for (const id of Object.keys(team.profiles)) {
    if (map.has(id)) continue
    const pr = team.profiles[id]
    if (pr) map.set(id, { id, name: pr.full_name ?? 'Member', avatarUrl: pr.avatar_url ?? null })
  }
  map.delete(auth.user?.id ?? '')
  return [...map.values()]
})
const mentionMatches = computed(() => {
  const q = mentionQuery.value.toLowerCase()
  const all = mentionCandidates.value
  return (q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all).slice(0, 6)
})

function positionMention() {
  const el = composerEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  mentionStyle.value = { left: `${r.left}px`, bottom: `${window.innerHeight - r.top + 6}px` }
}
function onComposerInput() {
  autogrow()
  if (draft.value.trim()) stream.sendTyping()
  const el = composerEl.value
  if (!el) { mentionOpen.value = false; return }
  const caret = el.selectionStart ?? draft.value.length
  const m = draft.value.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u)
  if (m) {
    mentionStart.value = caret - m[1].length - 1
    mentionQuery.value = m[1]
    mentionIndex.value = 0
    mentionOpen.value = true
    nextTick(positionMention)
  } else {
    mentionOpen.value = false
  }
}
function pickMention(p: { id: string; name: string }) {
  const el = composerEl.value
  const caret = el?.selectionStart ?? draft.value.length
  const before = draft.value.slice(0, mentionStart.value)
  const after = draft.value.slice(caret)
  const insert = `@${p.name} `
  draft.value = before + insert + after
  mentionedIds.value.add(p.id)
  mentionOpen.value = false
  nextTick(() => {
    el?.focus()
    const pos = (before + insert).length
    el?.setSelectionRange(pos, pos)
    autogrow()
  })
}
function onComposerKeydown(e: KeyboardEvent) {
  if (showSlash.value && slashFiltered.value.length) {
    if (e.key === 'Enter') { e.preventDefault(); pickSlash(slashFiltered.value[0].cmd); return }
    if (e.key === 'Escape') { e.preventDefault(); draft.value = ''; return }
  }
  if (mentionOpen.value && mentionMatches.value.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mentionIndex.value = (mentionIndex.value + 1) % mentionMatches.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); mentionIndex.value = (mentionIndex.value - 1 + mentionMatches.value.length) % mentionMatches.value.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionMatches.value[mentionIndex.value]); return }
    if (e.key === 'Escape') { e.preventDefault(); mentionOpen.value = false; return }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend() }
}
function insertMentionTrigger() {
  const el = composerEl.value
  el?.focus()
  const caret = el?.selectionStart ?? draft.value.length
  draft.value = draft.value.slice(0, caret) + '@' + draft.value.slice(caret)
  nextTick(() => {
    el?.setSelectionRange(caret + 1, caret + 1)
    onComposerInput()
  })
}
// Close the mention popover when the composer loses focus (e.g. a mobile soft
// keyboard dismiss, which fires no outside click for onDocMouseDown). Deferred
// so a popover-row mousedown still picks first (its @mousedown.prevent keeps
// focus, but the delay is belt-and-suspenders across browsers).
function onComposerBlur() {
  window.setTimeout(() => { mentionOpen.value = false }, 120)
}
// Close the (teleported, fixed-position) mention popover when clicking elsewhere.
function onDocMouseDown(e: MouseEvent) {
  if (!mentionOpen.value) return
  const t = e.target as Node
  if (composerEl.value?.contains(t) || mentionPopover.value?.contains(t)) return
  mentionOpen.value = false
}

// ── Thread panel ──────────────────────────────────────────────────────────────
const threadParentId = ref<string | null>(null)
// Thread replies get their own draft slot, keyed by the parent message.
const threadDraft = computed({
  get: () => (threadParentId.value ? drafts.get(`thread:${threadParentId.value}`) : ''),
  set: (v) => drafts.set(threadParentId.value ? `thread:${threadParentId.value}` : null, v)
})
const threadParent = computed(() =>
  stream.rootMessages.value.find((m) => m.id === threadParentId.value) ?? null
)
const threadReplies = computed(() =>
  threadParentId.value ? stream.repliesByParent.value[threadParentId.value] ?? [] : []
)
async function sendReply() {
  const pid = threadParentId.value
  const body = threadDraft.value
  if (!body.trim() || !pid) return
  drafts.clear(`thread:${pid}`)
  try {
    await stream.send(body, { parentId: pid })
  } catch (e) {
    drafts.set(`thread:${pid}`, body)
    commsError.value = (e as Error).message
  }
}
watch(currentChannelId, () => { threadParentId.value = null })

// ── Message → task / linked task ───────────────────────────────────────────────
function linkedTaskFor(id: string | null) {
  if (!id) return null
  return tasks.tasks.find((t) => t.id === id) ?? null
}
function dayKey(iso: string) {
  return new Date(iso).toDateString()
}
function showDayDivider(i: number) {
  if (searching.value) return false
  const list = displayedMessages.value
  return i === 0 || dayKey(list[i].created_at) !== dayKey(list[i - 1].created_at)
}
function dayLabel(iso: string) {
  const d = new Date(iso)
  const dd = new Date(d); dd.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yest = new Date(today); yest.setDate(yest.getDate() - 1)
  const md = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
  if (dd.getTime() === today.getTime()) return `Today · ${md}`
  if (dd.getTime() === yest.getTime()) return `Yesterday · ${md}`
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}
function isContinuation(i: number) {
  if (searching.value) return false
  const list = displayedMessages.value
  const m = list[i]
  const prev = list[i - 1]
  if (!prev || !m) return false
  if (m.is_pinned || m.is_decision || prev.is_pinned || prev.is_decision) return false
  if (prev.user_id !== m.user_id) return false
  return new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
}
// ── Slash commands ───────────────────────────────────────────────────────────
const SLASH_CMDS = [
  { cmd: '/task', icon: CheckSquare, label: 'Create a task', desc: 'Turn this into a tracked, linked task', accent: true },
  { cmd: '/huddle', icon: Headphones, label: 'Start a huddle', desc: 'Quick audio room for the channel', accent: false },
  { cmd: '/remind', icon: Bell, label: 'Set a reminder', desc: 'Remind the channel later', accent: false },
  { cmd: '/poll', icon: BarChart3, label: 'Create a poll', desc: 'Gather a quick vote', accent: false }
]
const showSlash = computed(() => draft.value.startsWith('/') && !draft.value.includes(' '))
const slashFiltered = computed(() => SLASH_CMDS.filter((s) => s.cmd.startsWith(draft.value.toLowerCase())))
function pickSlash(cmd: string) {
  if (cmd === '/task') startSlashTask()
  else if (cmd === '/huddle') { draft.value = ''; stream.toggleHuddle() }
  else if (cmd === '/poll') { draft.value = ''; mentionOpen.value = false; pollComposerOpen.value = true }
  else if (cmd === '/remind') { draft.value = ''; mentionOpen.value = false; editingReminder.value = null; reminderComposerOpen.value = true }
  else { draft.value = ''; fireToast(`${cmd} isn't wired up yet`, 'On the roadmap') }
}
function openSlash() {
  draft.value = '/'
  nextTick(() => composerEl.value?.focus())
}

// ── Task-from-chat ──────────────────────────────────────────────────────────
const taskComposerFor = ref<CommsMsg | null>(null)
const taskComposerStandalone = ref(false)
const pollComposerOpen = ref(false)
const reminderComposerOpen = ref(false)
const editingReminder = ref<{ id: string; body: string; remind_at: string } | null>(null)
// Right rail tab — the AlarmClock header button jumps straight to Reminders.
const activityTab = ref<'tasks' | 'reminders'>('tasks')
const upcomingReminderCount = computed(() => stream.reminders.value.filter((r) => !r.done_at).length)
const toast = ref<{ title: string; sub: string } | null>(null)
let toastTimer: number | undefined
function fireToast(title: string, sub: string) {
  toast.value = { title, sub }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = null), 4200)
}

// Hover "Task" (or thread "Task") → open the create-task composer for this line.
function makeTask(m: CommsMsg) {
  taskComposerStandalone.value = false
  taskComposerFor.value = m
}
// /task → open the composer with a synthetic message; on create we post the
// line to the channel and link the task to it (so it shows in chat + the rail).
function startSlashTask() {
  draft.value = ''
  mentionOpen.value = false
  const cid = currentChannelId.value
  if (!cid) return
  taskComposerStandalone.value = true
  taskComposerFor.value = {
    id: '', channel_id: cid, parent_id: null, user_id: auth.user?.id ?? '',
    user_name: auth.fullName || null, body: '', attachments: [], mentioned_user_ids: [],
    is_pinned: false, is_decision: false, decision_done: false, linked_task_id: null,
    edited_at: null, created_at: '', updated_at: ''
  } as CommsMsg
}
async function onTaskCreate(payload: {
  title: string
  projectId?: string
  statusKey?: string
  assignee_id: string | null
  due_on: string | null
  priority: 1 | 2 | 3 | 4
}) {
  const m = taskComposerFor.value
  const standalone = taskComposerStandalone.value
  taskComposerFor.value = null
  taskComposerStandalone.value = false
  if (!m) return
  try {
    let target = m
    if (standalone) {
      const posted = await stream.send(payload.title)
      if (!posted) throw new Error('Could not post the task message.')
      target = posted
      scrollToBottom()
    }
    const res = await stream.createTaskFromMessage(target, payload)
    if (res) {
      activityOpen.value = true
      const where = `#${channels.currentChannel?.name ?? ''}`
      fireToast(
        res.linked ? 'Task created & linked' : 'Task created',
        res.linked ? `Added to the board · ${where}` : `Added to the board · couldn't link it to this message`
      )
    }
  } catch (e) {
    commsError.value = (e as Error).message
  }
}
// React handler — reactions are just reactions. Turning a message into a task
// is the explicit hover "Task" button / "/task" only (a ✅ used to auto-create
// a task, which read as "I approve" and surprised people with board entries).
async function onPollCreate(payload: { question: string; options: string[] }) {
  pollComposerOpen.value = false
  try {
    const posted = await stream.createPoll(payload.question, payload.options)
    if (posted) scrollToBottom()
  } catch (e) {
    commsError.value = (e as Error).message
  }
}
async function onReminderCreate(payload: { remindAt: string; body: string }) {
  reminderComposerOpen.value = false
  const editId = editingReminder.value?.id ?? null
  editingReminder.value = null
  const where = `#${channels.currentChannel?.name ?? ''}`
  try {
    if (editId) {
      const ok = await stream.updateReminder(editId, { body: payload.body, remind_at: payload.remindAt })
      if (ok) fireToast('Reminder updated', `Posts in ${where}`)
    } else {
      await stream.createReminder(payload.remindAt, payload.body)
      fireToast('Reminder set', `BuzzyHive will post it in ${where}`)
    }
  } catch (e) {
    commsError.value = (e as Error).message
  }
}
// AlarmClock button → open the right rail straight to the Reminders tab.
function openReminders() {
  activityOpen.value = true
  activityTab.value = 'reminders'
  void stream.loadReminders()
}
function openNewReminder() {
  editingReminder.value = null
  reminderComposerOpen.value = true
}
function openEditReminder(r: { id: string; body: string; remind_at: string }) {
  editingReminder.value = { id: r.id, body: r.body, remind_at: r.remind_at }
  reminderComposerOpen.value = true
}
function onReact(m: CommsMsg, emoji: string) {
  stream.toggleReaction(m.id, emoji)
}
// The TaskDrawer mounts at the layout level and self-gates on selectedTask,
// so the drawer opens right here over the chat — no jump to the task board.
function openTask(taskId: string) {
  tasks.selectTask(taskId)
}
// Soft-delete a chat line (tombstone). Confirm first — it clears the content.
function confirmDelete(m: CommsMsg) {
  if (window.confirm('Delete this message? This can’t be undone.')) void stream.deleteMessage(m)
}

const headerMembers = computed(() => stream.online.value.slice(0, 6))
const extraMembers = computed(() => Math.max(0, stream.online.value.length - 6))
const firstName = (n: string) => (n || 'Someone').split(' ')[0]
const hostName = computed(() => {
  const h = stream.huddleHost.value
  return h ? stream.huddlePeople.value.find((p) => p.userId === h)?.name?.split(' ')[0] ?? '' : ''
})

// Keyboard shortcut: M toggles mute while in a huddle (ignored while typing).
function onHuddleKey(e: KeyboardEvent) {
  if (!stream.inHuddle.value || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key.toLowerCase() !== 'm') return
  const el = document.activeElement as HTMLElement | null
  const tag = el?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return
  e.preventDefault()
  stream.toggleMute()
}
// Returning to the tab while parked at the bottom = caught up → advance read.
function onVisibility() {
  if (document.visibilityState === 'visible' && atBottom.value) markReadSoon()
}
onMounted(() => {
  window.addEventListener('keydown', onHuddleKey)
  window.addEventListener('resize', onReposition)
  window.addEventListener('scroll', onReposition, true)
  window.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('visibilitychange', onVisibility)
  // Viewing the full channel = "seen": suppress new-message pings + clear unread.
  stream.registerViewer()
  if (currentChannelId.value) void channels.markRead(currentChannelId.value)
  // CRM links power the per-message "Log to CRM" action.
  if (!crm.loaded) void crm.load()
  // A restored draft can be multi-line — fit the composer to it.
  nextTick(autogrow)
  scrollToBottom()
})
// Keep the channel→CRM mapping scoped to the active workspace.
watch(() => clients.currentClientId, () => void crm.load())
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onHuddleKey)
  window.removeEventListener('resize', onReposition)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('visibilitychange', onVisibility)
  stream.unregisterViewer()
})

// Screen share: show the first active remote screen in a video tile.
const screenVideo = ref<HTMLVideoElement | null>(null)
const activeScreen = computed(() => {
  const entries = Object.entries(stream.remoteScreens.value)
  if (!entries.length) return null
  const [userId, ms] = entries[0]
  const p = stream.online.value.find((o) => o.userId === userId)
  return { userId, name: p?.name ?? 'Someone', stream: ms }
})
// The big viewer shows a REMOTE peer's screen; the sharer sees a compact
// "You're presenting" banner with a thumbnail instead (see template).
watch(() => activeScreen.value?.stream ?? null, (s) => {
  nextTick(() => { if (screenVideo.value) screenVideo.value.srcObject = s ?? null })
}, { immediate: true })

// Self-preview thumbnail shown in the "You're presenting" banner.
const selfVideo = ref<HTMLVideoElement | null>(null)
watch(() => stream.localScreen.value, (s) => {
  nextTick(() => { if (selfVideo.value) selfVideo.value.srcObject = s ?? null })
}, { immediate: true })

// What we're sharing (entire screen / window / tab), from the captured track.
const shareSurface = computed(() => {
  const t = stream.localScreen.value?.getVideoTracks?.()[0]
  const ds = (t?.getSettings?.() as { displaySurface?: string } | undefined)?.displaySurface
  return ds === 'monitor' ? 'Entire screen' : ds === 'window' ? 'Window' : ds === 'browser' ? 'Browser tab' : 'Your screen'
})
function fullscreenScreen() {
  screenVideo.value?.requestFullscreen?.()
}
</script>

<template>
  <div class="h-full min-h-0 flex">
    <!-- ── Channel list (desktop) ── -->
    <aside class="hidden md:flex w-60 shrink-0 flex-col border-r border-base-300 bg-base-100 overflow-hidden">
      <CommsChannelList
        :online-count="stream.online.value.length"
        :current-channel-id="currentChannelId"
        :huddle-by-channel="huddleByChannel"
        :viewers-by-channel="channelViewers"
        @choose="chooseChannel"
        @error="commsError = $event"
      />
    </aside>

    <!-- ── Channel list (mobile drawer) ── -->
    <Teleport to="body">
      <div v-if="mobileNav" class="md:hidden fixed inset-0 z-50 flex">
        <div class="absolute inset-0 bg-black/40" @click="mobileNav = false" />
        <div class="relative w-72 max-w-[85%] h-full bg-base-100 shadow-2xl flex flex-col">
          <CommsChannelList
            :online-count="stream.online.value.length"
            :current-channel-id="currentChannelId"
            :huddle-by-channel="huddleByChannel"
            :viewers-by-channel="channelViewers"
            @choose="chooseChannel"
            @error="commsError = $event"
          />
        </div>
      </div>
    </Teleport>

    <!-- ── Message column ── -->
    <main class="flex-1 min-w-0 flex flex-col bg-base-100 overflow-hidden">
      <!-- header -->
      <header class="flex items-center gap-3 px-3 sm:px-5 py-3 border-b border-base-300">
        <button class="md:hidden relative w-8 h-8 -ml-1 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/60" aria-label="Open channels" @click="mobileNav = true">
          <Menu class="w-5 h-5" :stroke-width="1.75" />
          <span v-if="otherChannelsUnread > 0" class="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-error ring-2 ring-base-100" />
        </button>
        <template v-if="isDmChannel && dmPartner">
          <HexAvatar :name="dmPartner.name" :avatar-url="dmPartner.avatarUrl" :color-key="dmPartner.userId ?? ''" :size="26" class="shrink-0" />
          <div class="min-w-0 flex items-baseline gap-2">
            <span class="font-display text-base font-extrabold tracking-tight truncate">{{ dmPartner.name }}</span>
            <span class="text-[0.72rem]" :class="dmPartner.online ? 'text-success' : 'text-base-content/40'">{{ dmPartner.online ? 'Active now' : 'Offline' }}</span>
          </div>
        </template>
        <template v-else>
          <Hash class="hidden sm:block w-[18px] h-[18px] text-base-content/60" :stroke-width="2.2" />
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="font-display text-base font-extrabold tracking-tight truncate">{{ channels.currentChannel?.name ?? 'comms' }}</span>
              <span v-if="channels.currentChannel?.topic" class="hidden sm:inline text-[0.8rem] text-base-content/45 truncate">{{ channels.currentChannel.topic }}</span>
            </div>
          </div>
        </template>
        <div class="flex-1" />
        <div class="hidden sm:flex items-center -space-x-1.5">
          <HexAvatar v-for="p in headerMembers" :key="p.userId" :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.userId" :size="26" ring />
          <button v-if="extraMembers > 0" class="w-[26px] h-[26px] rounded-full bg-base-200 text-[0.6rem] font-semibold text-base-content/60 flex items-center justify-center ring-2 ring-base-100" :title="`${extraMembers} more online`" @click="membersOpen = true">+{{ extraMembers }}</button>
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          :class="stream.inHuddle.value ? 'bg-error/10 text-error' : 'bg-primary text-white'"
          @click="stream.toggleHuddle()"
        >
          <Headphones class="w-4 h-4" :stroke-width="1.75" /> {{ stream.inHuddle.value ? 'Leave' : 'Huddle' }}
        </button>
        <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/60" aria-label="New meeting link (shareable)" title="New meeting link (shareable)" @click="newMeeting"><Video class="w-4 h-4" :stroke-width="1.75" /></button>
        <button class="hidden sm:flex w-8 h-8 rounded-lg hover:bg-base-200 items-center justify-center text-base-content/60" aria-label="Mic & sound check" title="Mic &amp; sound check" @click="showMicCheck = true"><Settings2 class="w-4 h-4" :stroke-width="1.75" /></button>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-base-content/60" :class="searchOpen ? 'bg-base-200 text-primary' : 'hover:bg-base-200'" aria-label="Search messages" title="Search messages" @click="toggleSearch"><Search class="w-4 h-4" :stroke-width="1.75" /></button>
        <button class="relative hidden xl:flex w-8 h-8 rounded-lg items-center justify-center" :class="activityOpen && activityTab === 'reminders' ? 'bg-base-200 text-primary' : 'text-base-content/60 hover:bg-base-200'" aria-label="Reminders" title="Reminders" @click="openReminders">
          <AlarmClock class="w-4 h-4" :stroke-width="1.75" />
          <span v-if="upcomingReminderCount" class="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-white text-[0.58rem] font-bold flex items-center justify-center ring-2 ring-base-100">{{ upcomingReminderCount }}</span>
        </button>
        <button class="w-8 h-8 rounded-lg flex items-center justify-center text-base-content/60" :class="membersOpen ? 'bg-base-200 text-primary' : 'hover:bg-base-200'" aria-label="Members" title="Members" @click="membersOpen = !membersOpen"><Users class="w-4 h-4" :stroke-width="1.75" /></button>
        <button class="hidden xl:flex w-8 h-8 rounded-lg items-center justify-center" :class="activityOpen ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'" aria-label="Activity & tasks" title="Activity & tasks from chat" @click="activityOpen = !activityOpen"><CheckSquare class="w-4 h-4" :stroke-width="1.75" /></button>
      </header>

      <!-- search bar -->
      <div v-if="searchOpen" class="flex items-center gap-2 px-4 py-2 border-b border-base-300 bg-base-200/40">
        <Search class="w-4 h-4 text-base-content/40 shrink-0" :stroke-width="1.75" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          placeholder="Search this channel…"
          class="flex-1 bg-transparent text-sm outline-none"
          @keydown.esc="toggleSearch"
        />
        <span v-if="searching" class="text-xs text-base-content/40">{{ displayedMessages.length }} match{{ displayedMessages.length === 1 ? '' : 'es' }}</span>
        <button class="w-6 h-6 rounded hover:bg-base-300 flex items-center justify-center text-base-content/50" aria-label="Close search" @click="toggleSearch"><X class="w-3.5 h-3.5" /></button>
      </div>

      <p v-if="commsError || stream.huddleError.value" class="px-5 py-1.5 text-xs text-error flex items-center gap-2">
        {{ commsError || stream.huddleError.value }}
        <button class="underline" @click="commsError = null; stream.huddleError.value = null">dismiss</button>
      </p>

      <!-- remote peer's screen (big inline viewer) -->
      <div v-if="activeScreen && !screenPoppedOut" class="mx-4 mt-2 rounded-xl border border-base-300 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-base-200/60 text-xs">
          <MonitorUp class="w-3.5 h-3.5 text-primary" :stroke-width="1.75" />
          <span class="font-medium">{{ firstName(activeScreen.name) }} is sharing their screen</span>
          <div class="flex-1" />
          <button
            class="inline-flex items-center gap-1 text-base-content/60 hover:text-primary font-medium"
            title="Pop out to a floating window so you can keep chatting"
            @click="screenPoppedOut = true"
          >
            <PictureInPicture2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Pop out
          </button>
          <button class="inline-flex items-center gap-1 text-base-content/60 hover:text-primary font-medium" title="Fullscreen" @click="fullscreenScreen">
            <Maximize2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Fullscreen
          </button>
        </div>
        <video ref="screenVideo" autoplay playsinline muted class="w-full max-h-[65vh] bg-black object-contain" />
      </div>

      <!-- remote screen popped out to the floating dock (chat stays roomy) -->
      <div
        v-else-if="activeScreen && screenPoppedOut"
        class="mx-4 mt-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2 flex items-center gap-2 text-xs"
      >
        <Monitor class="w-3.5 h-3.5 text-primary shrink-0" :stroke-width="1.75" />
        <span class="font-medium truncate">{{ firstName(activeScreen.name) }}'s screen is in a floating window</span>
        <div class="flex-1" />
        <button class="text-primary font-semibold hover:underline shrink-0" @click="screenPoppedOut = false">Bring back</button>
      </div>

      <!-- you're presenting (compact banner with live self-preview) -->
      <div
        v-else-if="stream.sharingScreen.value"
        class="mx-4 mt-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 flex items-center gap-3"
      >
        <div class="w-[52px] h-9 rounded-md overflow-hidden bg-base-300 ring-1 ring-success/30 shrink-0">
          <video ref="selfVideo" autoplay playsinline muted class="w-full h-full object-cover" />
        </div>
        <div class="min-w-0 leading-tight">
          <div class="flex items-center gap-1.5 text-sm font-semibold">
            <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0" /> You're presenting
          </div>
          <div class="text-[0.7rem] text-base-content/55 truncate">{{ shareSurface }}</div>
        </div>
        <div class="flex-1" />
        <button
          class="text-primary text-xs font-semibold hover:underline shrink-0"
          title="Switch what you're sharing"
          @click="stream.switchScreenShare()"
        >Switch</button>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error/10 text-error text-xs font-semibold hover:bg-error/15 shrink-0"
          @click="stream.toggleScreenShare()"
        >
          <MonitorOff class="w-3.5 h-3.5" :stroke-width="1.75" /> Stop
        </button>
      </div>

      <!-- stream -->
      <div ref="streamScroller" class="relative flex-1 min-h-0 overflow-y-auto py-2" @scroll="onStreamScroll">
        <Transition name="comms-fade" mode="out-in" @after-enter="onStreamRevealed">
          <!-- skeleton: hold until the whole channel's history has landed -->
          <div v-if="stream.loading.value" key="sk" class="pt-1">
            <div v-for="(w, n) in skeletonRows" :key="n" class="px-4 py-2.5 flex gap-3">
              <div class="w-9 h-9 rounded-xl bg-base-200 animate-pulse shrink-0" />
              <div class="flex-1 min-w-0 space-y-2 py-0.5">
                <div class="h-3 w-28 rounded bg-base-200 animate-pulse" />
                <div class="h-3 rounded bg-base-200 animate-pulse" :style="{ width: w }" />
              </div>
            </div>
          </div>

          <!-- loaded: the whole stream appears at once -->
          <div v-else key="content">
            <div v-if="stream.loadingOlder.value" class="py-2 flex justify-center">
              <Loader2 class="w-4 h-4 animate-spin text-base-content/40" />
            </div>
            <div v-else-if="!stream.hasMore.value && !searching" class="py-3 text-center text-[0.68rem] text-base-content/35">
              Beginning of the conversation
            </div>
            <template v-for="(m, i) in displayedMessages" :key="m.id">
              <div v-if="showDayDivider(i)" class="flex items-center gap-3 px-[18px] pt-2.5 pb-1.5">
                <div class="flex-1 h-px bg-base-300/70" />
                <span class="text-[0.7rem] font-bold text-base-content/60 bg-base-100 border border-base-300 rounded-full px-3 py-0.5 whitespace-nowrap">{{ dayLabel(m.created_at) }}</span>
                <div class="flex-1 h-px bg-base-300/70" />
              </div>
              <CommsMessage
                :message="m"
                :data-mid="m.id"
                :data-tour="i === 0 ? 'comms-message' : undefined"
                :continuation="isContinuation(i)"
                :seen="seenFor(m.id)"
                :unseen="freshIds.has(m.id)"
                :reactions="stream.reactionList(m.id)"
                :reply-count="(stream.repliesByParent.value[m.id] ?? []).length"
                :last-reply-at="(stream.repliesByParent.value[m.id] ?? []).at(-1)?.created_at"
                :linked-task="linkedTaskFor(m.linked_task_id)"
                :can-manage="canManage"
                :is-own="m.user_id === auth.user?.id"
                :poll-tally="m.poll ? stream.pollTally(m.id) : null"
                :can-log-crm="!!crmTarget"
                @log-crm="logMessageToCrm(m)"
                @react="(e) => onReact(m, e)"
                @open-thread="threadParentId = m.id"
                @make-task="makeTask(m)"
                @toggle-pin="stream.togglePin(m)"
                @mark-decision="stream.markDecision(m)"
                @edit="(body) => stream.editMessage(m.id, body)"
                @delete="confirmDelete(m)"
                @vote="(opt) => stream.votePoll(m.id, opt)"
                @open-task="openTask"
                @open-dm="startDm"
              />
            </template>
            <div v-if="searching && displayedMessages.length === 0" class="px-5 py-10 text-center text-sm text-base-content/40">
              No messages match “{{ searchQuery }}”.
            </div>
            <div v-else-if="displayedMessages.length === 0" class="px-5 py-10 text-center text-sm text-base-content/40">
              No messages yet — say hello 🐝
            </div>
          </div>
        </Transition>
        <div />
      </div>

      <!-- new-messages pill -->
      <div v-if="!atBottom && newCount > 0" class="relative">
        <button
          class="absolute left-1/2 -translate-x-1/2 -top-12 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-semibold shadow-lg hover:bg-primary/90"
          @click="scrollToBottom"
        >
          <ArrowDown class="w-3.5 h-3.5" :stroke-width="2" />
          {{ newCount }} new message{{ newCount === 1 ? '' : 's' }}
        </button>
      </div>

      <!-- huddle bar -->
      <div
        v-if="stream.inHuddle.value || stream.huddlePeople.value.length"
        class="mx-4 mb-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
      >
        <div class="flex items-center gap-3">
          <span class="relative flex h-2.5 w-2.5 shrink-0">
            <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <div class="leading-tight shrink-0">
            <div class="text-xs font-semibold">Huddle</div>
            <div class="text-[0.65rem] text-base-content/50">
              in #{{ channels.currentChannel?.name }}<template v-if="hostName"> · hosted by {{ hostName }}</template>
            </div>
          </div>

          <!-- participants -->
          <div class="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 py-0.5">
            <span
              v-for="p in stream.huddlePeople.value"
              :key="p.userId"
              class="inline-flex items-center gap-1.5 rounded-full border bg-base-100 pl-0.5 pr-2 py-0.5 shrink-0 transition-colors"
              :class="stream.speaking.value.has(p.userId) ? 'border-success ring-1 ring-success/40' : 'border-base-300'"
              :title="p.name + (p.muted ? ' (muted)' : '')"
            >
              <span class="relative inline-flex">
                <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.userId" :size="22" />
                <span v-if="p.muted" class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-error flex items-center justify-center ring-1 ring-base-100">
                  <MicOff class="w-2 h-2 text-white" :stroke-width="2.5" />
                </span>
              </span>
              <span class="text-xs font-medium">{{ firstName(p.name) }}</span>
              <Crown v-if="p.userId === stream.huddleHost.value" class="w-3 h-3 text-warning shrink-0" :stroke-width="2" />
            </span>
          </div>

          <!-- controls -->
          <template v-if="stream.inHuddle.value">
            <button class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="stream.muted.value ? 'bg-error/15 text-error' : 'bg-base-200 text-base-content/70'" :title="stream.muted.value ? 'Unmute (M)' : 'Mute (M)'" :aria-label="stream.muted.value ? 'Unmute' : 'Mute'" @click="stream.toggleMute()">
              <component :is="stream.muted.value ? MicOff : Mic" class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="stream.noiseSuppression.value ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/70'"
              :title="stream.noiseSuppression.value
                ? (stream.rnnoiseActive.value ? 'AI noise cancellation: on' : 'Noise cancellation: on')
                : 'Noise cancellation: off'"
              aria-label="Toggle noise cancellation"
              @click="stream.toggleNoise()"
            ><Wand2 class="w-4 h-4" :stroke-width="1.75" /></button>
            <button
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="stream.soundMuted.value ? 'bg-base-200 text-base-content/40' : 'bg-base-200 text-base-content/70'"
              :title="stream.soundMuted.value ? 'Sounds off — join/share chimes muted' : 'Sounds on — join/share chimes'"
              aria-label="Toggle sounds"
              @click="stream.toggleSounds()"
            ><component :is="stream.soundMuted.value ? BellOff : Bell" class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-9 h-9 rounded-lg bg-base-200 text-base-content/70 flex items-center justify-center shrink-0" title="Mic &amp; sound" aria-label="Mic and sound check" @click="showMicCheck = true"><Settings2 class="w-4 h-4" :stroke-width="1.75" /></button>
            <button
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              :class="stream.sharingScreen.value ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/70'"
              :title="stream.sharingScreen.value ? 'Stop sharing screen' : 'Share screen'"
              aria-label="Share screen"
              @click="stream.toggleScreenShare()"
            ><MonitorUp class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-9 h-9 rounded-lg bg-error text-white flex items-center justify-center shrink-0" title="Leave" aria-label="Leave huddle" @click="stream.toggleHuddle()"><PhoneOff class="w-4 h-4" :stroke-width="1.75" /></button>
          </template>
          <button v-else class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold shrink-0" @click="stream.toggleHuddle()">Join</button>
        </div>

        <!-- shortcut hint -->
        <div v-if="stream.inHuddle.value" class="mt-1.5 pl-6 flex items-center gap-2 text-[0.65rem] text-base-content/40">
          <span>Press <kbd class="px-1 py-px rounded bg-base-200 font-mono text-base-content/60">M</kbd> to {{ stream.muted.value ? 'unmute' : 'mute' }}</span>
          <span v-if="stream.noiseSuppression.value" class="inline-flex items-center gap-1 text-primary/70 font-medium">
            <Wand2 class="w-3 h-3" :stroke-width="2" /> {{ stream.rnnoiseActive.value ? 'AI noise cancellation on' : 'Noise cancellation on' }}
          </span>
        </div>
      </div>

      <!-- composer -->
      <div class="px-4 pb-4">
        <!-- typing indicator -->
        <TypingIndicator :members="typingMembers" class="mb-1" />

        <!-- inline send-failure -->
        <div v-if="sendFailed" class="mb-2 flex items-center gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-1.5 text-xs text-error">
          <AlertCircle class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
          <span class="flex-1">Message didn't send.</span>
          <button class="font-semibold underline" @click="onSend">Retry</button>
          <button class="text-error/60 hover:text-error" @click="sendFailed = false">Dismiss</button>
        </div>

        <div class="relative">
          <!-- slash command menu -->
          <div v-if="showSlash && slashFiltered.length" class="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30 rounded-xl border border-base-300 bg-base-100 shadow-lg overflow-hidden">
            <div class="px-3 py-2 text-[0.62rem] font-bold uppercase tracking-wider text-base-content/40 border-b border-base-200">Commands</div>
            <button
              v-for="(s, i) in slashFiltered"
              :key="s.cmd"
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
              :class="i === 0 ? 'bg-base-200/60' : 'hover:bg-base-200'"
              @click="pickSlash(s.cmd)"
            >
              <span class="w-7 h-7 rounded-lg grid place-items-center shrink-0" :class="s.accent ? 'text-primary' : 'text-base-content/60 bg-base-200'" :style="s.accent ? 'background: var(--accent-soft)' : ''">
                <component :is="s.icon" class="w-4 h-4" :stroke-width="1.75" />
              </span>
              <span class="flex-1 min-w-0">
                <span class="block text-[0.8rem] font-bold"><span class="font-mono">{{ s.cmd }}</span> · {{ s.label }}</span>
                <span class="block text-[0.68rem] text-base-content/50">{{ s.desc }}</span>
              </span>
              <span v-if="s.accent" class="text-[0.62rem] font-bold text-primary px-1.5 py-0.5 rounded shrink-0" style="background: var(--accent-soft)">↵</span>
            </button>
          </div>

          <div class="rounded-2xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
          <div v-if="pending.length" class="flex flex-wrap gap-2 px-3 pt-3">
            <span
              v-for="a in pending"
              :key="a._localId"
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
              :class="a.status === 'error' ? 'bg-error/10 text-error' : 'bg-base-200'"
            >
              <Loader2 v-if="a.status === 'uploading'" class="w-3.5 h-3.5 animate-spin text-base-content/60" />
              <AlertCircle v-else-if="a.status === 'error'" class="w-3.5 h-3.5" :stroke-width="2" />
              <component v-else :is="a.kind === 'image' ? ImageIcon : a.kind === 'link' ? Link2 : Paperclip" class="w-3.5 h-3.5 text-base-content/60" />
              <span class="max-w-[10rem] truncate">{{ a.name }}</span>
              <button class="text-base-content/40 hover:text-error" aria-label="Remove attachment" @click="removePending(a._localId)"><X class="w-3 h-3" /></button>
            </span>
          </div>
          <textarea
            ref="composerEl"
            v-model="draft"
            rows="1"
            :placeholder="isDmChannel ? `Message ${dmPartner?.name ?? ''}` : `Message #${channels.currentChannel?.name ?? ''}  —  type / for commands`"
            class="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none leading-relaxed min-h-0 max-h-[200px]"
            @keydown="onComposerKeydown"
            @input="onComposerInput"
            @paste="onPaste"
            @blur="onComposerBlur"
          />
          <div class="flex items-center gap-1 px-2 pb-2">
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" aria-label="Attach file" title="Attach file" @click="pickFiles('*/*')"><Paperclip class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" aria-label="Attach image" title="Image" @click="pickFiles('image/*')"><ImageIcon class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" aria-label="Add link" title="Link" @click="addLink"><Link2 class="w-4 h-4" :stroke-width="1.75" /></button>
            <button ref="pickerBtn" class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center" :class="showPicker ? 'bg-base-200 text-primary' : 'text-base-content/50'" aria-label="Emoji and GIFs" title="Emoji & GIFs" @click="togglePicker"><Smile class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" aria-label="Mention someone" title="Mention someone" @click="insertMentionTrigger"><AtSign class="w-4 h-4" :stroke-width="1.75" /></button>
            <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="showSlash ? 'bg-base-200 text-primary' : 'hover:bg-base-200 text-base-content/50'" aria-label="Slash commands" title="Slash commands" @click="openSlash"><Slash class="w-4 h-4" :stroke-width="1.75" /></button>
            <div class="flex-1" />
            <span class="hidden sm:block text-[0.65rem] text-base-content/30 mr-1 select-none"><kbd class="font-mono">↵</kbd> to send · <kbd class="font-mono">⇧↵</kbd> newline</span>
            <button
              class="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40"
              :disabled="!canSend"
              aria-label="Send message"
              @click="onSend"
            >
              <Loader2 v-if="stream.sending.value || uploading" class="w-4 h-4 animate-spin" />
              <Send v-else class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
        </div>
        </div>
      </div>

      <input ref="fileInput" type="file" multiple :accept="fileAccept" class="hidden" @change="onFilesChosen" />
    </main>

    <!-- ── Thread panel (side on lg, full-screen overlay below) ── -->
    <Transition name="thread">
    <aside
      v-if="threadParent"
      class="fixed inset-0 z-40 flex flex-col bg-base-100 lg:static lg:inset-auto lg:z-auto lg:w-80 lg:shrink-0 lg:border-l lg:border-base-300 overflow-hidden"
    >
      <div class="flex items-center gap-2 px-4 py-3 border-b border-base-300">
        <CheckSquare class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
        <span class="text-sm font-semibold">Thread</span>
        <span class="text-xs text-base-content/40">· #{{ channels.currentChannel?.name }}</span>
        <div class="flex-1" />
        <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" aria-label="Close thread" @click="threadParentId = null"><X class="w-4 h-4" :stroke-width="1.75" /></button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto py-2">
        <CommsMessage
          :message="threadParent!"
          :reactions="stream.reactionList(threadParent!.id)"
          :reply-count="0"
          :linked-task="linkedTaskFor(threadParent!.linked_task_id)"
          :can-log-crm="!!crmTarget"
          :is-own="threadParent!.user_id === auth.user?.id"
          :can-manage="canManage"
          :poll-tally="threadParent!.poll ? stream.pollTally(threadParent!.id) : null"
          @log-crm="logMessageToCrm(threadParent!)"
          @react="(e) => stream.toggleReaction(threadParent!.id, e)"
          @make-task="makeTask(threadParent!)"
          @toggle-pin="stream.togglePin(threadParent!)"
          @edit="(body) => stream.editMessage(threadParent!.id, body)"
          @delete="confirmDelete(threadParent!)"
          @vote="(opt) => stream.votePoll(threadParent!.id, opt)"
          @open-task="openTask"
          @open-dm="startDm"
        />
        <div class="flex items-center gap-3 px-4 py-1 text-[0.7rem] text-base-content/40">
          <span class="flex-1 h-px bg-base-300" />{{ threadReplies.length }} {{ threadReplies.length === 1 ? 'reply' : 'replies' }}<span class="flex-1 h-px bg-base-300" />
        </div>
        <CommsMessage
          v-for="r in threadReplies"
          :key="r.id"
          :message="r"
          :reactions="stream.reactionList(r.id)"
          :reply-count="0"
          :is-own="r.user_id === auth.user?.id"
          :can-manage="canManage"
          @react="(e) => stream.toggleReaction(r.id, e)"
          @make-task="makeTask(r)"
          @toggle-pin="stream.togglePin(r)"
          @edit="(body) => stream.editMessage(r.id, body)"
          @delete="confirmDelete(r)"
          @open-task="openTask"
          @open-dm="startDm"
        />
      </div>
      <div class="px-3 pb-3">
        <div class="flex items-center gap-2 rounded-xl border border-base-300 px-3 py-2">
          <input
            v-model="threadDraft"
            placeholder="Reply…"
            class="flex-1 bg-transparent text-sm outline-none"
            @keydown.enter.prevent="sendReply"
          />
          <button class="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center" aria-label="Send reply" @click="sendReply"><Send class="w-3.5 h-3.5" :stroke-width="2" /></button>
        </div>
      </div>
    </aside>
    </Transition>

    <!-- ── Activity rail (tasks created from chat) ── -->
    <CommsActivityRail
      v-if="activityOpen && !threadParent"
      :tab="activityTab"
      @update:tab="activityTab = $event"
      @close="activityOpen = false"
      @open="openTask"
      @new-reminder="openNewReminder"
      @edit-reminder="openEditReminder"
    />

    <MicCheck v-if="showMicCheck" @close="showMicCheck = false" />

    <!-- Create-task composer (from a chat line) -->
    <CommsTaskComposer
      v-if="taskComposerFor"
      :message="taskComposerFor"
      @create="onTaskCreate"
      @close="taskComposerFor = null"
    />

    <!-- /poll composer -->
    <CommsPollComposer
      v-if="pollComposerOpen && currentChannelId"
      :channel-id="currentChannelId"
      @create="onPollCreate"
      @close="pollComposerOpen = false"
    />

    <!-- /remind composer (create or edit) -->
    <CommsReminderComposer
      v-if="reminderComposerOpen && currentChannelId"
      :channel-id="currentChannelId"
      :reminder="editingReminder"
      @create="onReminderCreate"
      @close="reminderComposerOpen = false; editingReminder = null"
    />

    <!-- Task-created toast -->
    <Teleport to="body">
      <Transition name="comms-toast">
        <div
          v-if="toast"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl text-white shadow-2xl"
          style="background: #211c24"
        >
          <span class="w-6 h-6 rounded-lg grid place-items-center" style="background: rgba(255,255,255,.14)">
            <CheckSquare class="w-4 h-4" :stroke-width="2.4" />
          </span>
          <div>
            <div class="text-[0.8rem] font-bold leading-tight">{{ toast.title }}</div>
            <div class="text-[0.7rem] text-white/60">{{ toast.sub }}</div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Members panel -->
    <Teleport to="body">
      <template v-if="membersOpen">
        <div class="fixed inset-0 z-[55]" @click="membersOpen = false" />
        <div class="fixed right-4 top-16 z-[60] w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-base-300 bg-base-100 shadow-2xl py-1">
          <div class="flex items-center gap-2 px-3 pt-2 pb-1">
            <Users class="w-3.5 h-3.5 text-base-content/50" :stroke-width="1.75" />
            <span class="text-[0.65rem] font-semibold uppercase tracking-wider text-base-content/50">Members · {{ stream.online.value.length }} online</span>
          </div>
          <button
            v-for="p in memberList"
            :key="p.id"
            class="group/mem w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-base-200"
            @click="p.id !== auth.user?.id && startDm(p.id)"
          >
            <span class="relative">
              <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.id" :size="26" />
              <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-base-100" :class="p.online ? 'bg-success' : 'bg-base-300'" />
            </span>
            <span class="flex-1 min-w-0">
              <span class="block text-sm truncate" :class="p.online ? '' : 'text-base-content/50'">
                {{ p.name }}<span v-if="p.id === auth.user?.id" class="text-base-content/40"> (you)</span>
              </span>
              <span v-if="p.inHuddle" class="block text-[0.65rem] text-primary font-medium">In huddle</span>
            </span>
            <span v-if="p.id !== auth.user?.id" class="shrink-0 text-base-content/30 group-hover/mem:text-primary" title="Message">
              <MessageSquare class="w-4 h-4" :stroke-width="1.75" />
            </span>
          </button>
          <p v-if="!memberList.length" class="px-3 py-2 text-xs text-base-content/40">No members loaded yet.</p>
        </div>
      </template>
    </Teleport>

    <!-- @mention autocomplete -->
    <Teleport to="body">
      <div v-if="mentionOpen && mentionMatches.length" ref="mentionPopover" role="listbox" class="fixed z-[60] w-56 rounded-xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden py-1" :style="mentionStyle">
        <button
          v-for="(p, i) in mentionMatches"
          :key="p.id"
          role="option"
          :aria-selected="i === mentionIndex"
          class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm"
          :class="i === mentionIndex ? 'bg-primary/10' : 'hover:bg-base-200'"
          @mousedown.prevent="pickMention(p)"
        >
          <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.id" :size="22" />
          <span class="truncate">{{ p.name }}</span>
        </button>
      </div>
    </Teleport>

    <!-- Emoji/GIF picker -->
    <Teleport to="body">
      <template v-if="showPicker">
        <div class="fixed inset-0 z-[55]" @click="showPicker = false" />
        <div class="fixed z-[60]" :style="pickerStyle">
          <MediaPicker @emoji="addEmoji" @gif="onPickGif" @close="showPicker = false" />
        </div>
      </template>
    </Teleport>
  </div>
</template>

<style scoped>
.comms-fade-enter-active,
.comms-fade-leave-active {
  transition: opacity 0.3s ease;
}
.comms-fade-enter-from,
.comms-fade-leave-to {
  opacity: 0;
}

/* Thread panel entrance — slide+fade in from the right (subtle on mobile too). */
.thread-enter-active,
.thread-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.thread-enter-from,
.thread-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

/* Task-created toast */
.comms-toast-enter-active {
  transition: opacity 0.26s ease, transform 0.26s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.comms-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.comms-toast-enter-from,
.comms-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}

/* Jump-to-message flash (child component root → :deep). */
@keyframes msg-flash {
  0% { background-color: color-mix(in oklab, var(--accent) 22%, transparent); }
  100% { background-color: transparent; }
}
:deep(.msg-flash) {
  animation: msg-flash 1.8s ease-out;
}
</style>
