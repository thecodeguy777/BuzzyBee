<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import { useRouter } from 'vue-router'
import {
  Hash, Search, Users, Headphones, Mic, MicOff, MonitorUp, PhoneOff,
  Paperclip, Image as ImageIcon, Link2, Smile, AtSign, Send, Sparkles, X, CheckSquare,
  Settings2, Crown, Maximize2, Bell, BellOff, Wand2, Video, Menu, ArrowDown, Loader2, AlertCircle,
  Slash, BarChart3, MessageSquare
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import CommsMessage from '@/components/comms/CommsMessage.vue'
import MicCheck from '@/components/comms/MicCheck.vue'
import MediaPicker from '@/components/comms/MediaPicker.vue'
import CommsChannelList from '@/components/comms/CommsChannelList.vue'
import CommsActivityRail from '@/components/comms/CommsActivityRail.vue'
import CommsTaskComposer from '@/components/comms/CommsTaskComposer.vue'
import { type Gif } from '@/lib/giphy'
import { createMeetingRoom } from '@/lib/meetingRoom'
import { useChannelsStore } from '@/stores/channels'
import { COMMS_STREAM, HUDDLE_PRESENCE } from '@/composables/commsStream'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'
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

const canManage = computed(() => auth.isAdmin || auth.role === 'pm')
const commsError = ref<string | null>(null)
const showMicCheck = ref(false)

// Mobile: channel list lives in a slide-over drawer (the desktop aside is md+).
const mobileNav = ref(false)
// Right-side Activity rail (tasks created from chat). Open by default.
const activityOpen = ref(true)
// Huddle indicators for the channel list — the cross-channel presence map,
// merged with the live count for the channel we're actively bound to (so it
// shows instantly before the presence round-trip).
// Huddle indicator, keyed by channel. Driven purely off the bound channel's
// live presence (stream.huddlePeople — the same source as the huddle bar), and
// rebuilt fresh every time so it lights the channel with an active huddle and
// carries no stale entries: switch channels or leave → the old one clears.
// (The cross-channel presence channel proved unreliable for this.)
const huddleByChannel = computed<Record<string, number>>(() => {
  const cid = currentChannelId.value
  const n = stream.huddlePeople.value.length
  return cid && n > 0 ? { [cid]: n } : {}
})
// Global online roster (everyone connected for this client), with a fallback to
// the current channel's presence if the cross-channel presence isn't available.
const onlineIds = computed(
  () => huddlePresence?.onlineUsers.value ?? stream.online.value.map((p) => p.userId)
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
    if (id) chooseChannel(id)
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
const draft = ref('')
const pending = ref<PendingAtt[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const fileAccept = ref('*/*')
const streamEnd = ref<HTMLElement | null>(null)
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
  nextTick(() => {
    streamEnd.value?.scrollIntoView({ block: 'end' })
    atBottom.value = true
    newCount.value = 0
  })
}
function onStreamScroll() {
  const el = streamScroller.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (atBottom.value) newCount.value = 0
}
watch(
  () => stream.rootMessages.value.length,
  (n, old) => {
    if (atBottom.value) scrollToBottom()
    else if (n > old) newCount.value += n - old
  }
)
watch(currentChannelId, () => {
  pending.value = []
  draft.value = ''
  sendFailed.value = false
  mentionedIds.value = new Set()
  mentionOpen.value = false
  searchQuery.value = ''
  nextTick(autogrow)
  scrollToBottom()
})

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
    draft.value = body
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
// Close the (teleported, fixed-position) mention popover when clicking elsewhere.
function onDocMouseDown(e: MouseEvent) {
  if (!mentionOpen.value) return
  const t = e.target as Node
  if (composerEl.value?.contains(t) || mentionPopover.value?.contains(t)) return
  mentionOpen.value = false
}

// ── Thread panel ──────────────────────────────────────────────────────────────
const threadParentId = ref<string | null>(null)
const threadDraft = ref('')
const threadParent = computed(() =>
  stream.rootMessages.value.find((m) => m.id === threadParentId.value) ?? null
)
const threadReplies = computed(() =>
  threadParentId.value ? stream.repliesByParent.value[threadParentId.value] ?? [] : []
)
async function sendReply() {
  const body = threadDraft.value
  if (!body.trim() || !threadParentId.value) return
  threadDraft.value = ''
  try {
    await stream.send(body, { parentId: threadParentId.value })
  } catch (e) {
    threadDraft.value = body
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
  else { draft.value = ''; fireToast(`${cmd} isn't wired up yet`, 'On the roadmap') }
}
function openSlash() {
  draft.value = '/'
  nextTick(() => composerEl.value?.focus())
}

// ── Task-from-chat ──────────────────────────────────────────────────────────
const taskComposerFor = ref<CommsMsg | null>(null)
const taskComposerStandalone = ref(false)
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
    const id = await stream.createTaskFromMessage(target, payload)
    if (id) {
      activityOpen.value = true
      fireToast('Task created & linked', `Added to the board · #${channels.currentChannel?.name ?? ''}`)
    }
  } catch (e) {
    commsError.value = (e as Error).message
  }
}
// React handler — *adding* a ✅ to a message also spins up a quick linked task.
async function onReact(m: CommsMsg, emoji: string) {
  const hadMine = stream.reactionList(m.id).some((r) => r.emoji === emoji && r.mine)
  stream.toggleReaction(m.id, emoji)
  if (emoji === '✅' && !hadMine && !m.linked_task_id) {
    try {
      const id = await stream.createTaskFromMessage(m)
      if (id) {
        activityOpen.value = true
        fireToast('Quick task created', `From ✅ · #${channels.currentChannel?.name ?? ''}`)
      }
    } catch (e) {
      commsError.value = (e as Error).message
    }
  }
}
function openTask(taskId: string) {
  tasks.selectTask(taskId)
  router.push({ name: 'workstation-tasks' })
}

// ── Decisions ──────────────────────────────────────────────────────────────────
const pinningAll = ref(false)
async function pinAllToTasks() {
  const todo = stream.decisions.value.filter((d) => !d.linked_task_id)
  if (!todo.length || pinningAll.value) return
  pinningAll.value = true
  let created = 0
  for (const d of todo) {
    try {
      const id = await stream.createTaskFromMessage(d)
      if (id) created++
    } catch (e) {
      commsError.value = (e as Error).message
    }
  }
  pinningAll.value = false
  if (created) commsError.value = `Created ${created} task${created === 1 ? '' : 's'} from decisions.`
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
onMounted(() => {
  window.addEventListener('keydown', onHuddleKey)
  window.addEventListener('resize', onReposition)
  window.addEventListener('scroll', onReposition, true)
  window.addEventListener('mousedown', onDocMouseDown)
  // Viewing the full channel = "seen": suppress new-message pings + clear unread.
  stream.registerViewer()
  if (currentChannelId.value) void channels.markRead(currentChannelId.value)
  scrollToBottom()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onHuddleKey)
  window.removeEventListener('resize', onReposition)
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('mousedown', onDocMouseDown)
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
watch(activeScreen, (a) => {
  nextTick(() => {
    if (screenVideo.value) screenVideo.value.srcObject = a?.stream ?? null
  })
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
        :online-ids="onlineIds"
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
        :online-ids="onlineIds"
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

      <!-- screen share viewer -->
      <div v-if="activeScreen || stream.sharingScreen.value" class="mx-4 mt-2 rounded-xl border border-base-300 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-base-200/60 text-xs">
          <MonitorUp class="w-3.5 h-3.5 text-primary" :stroke-width="1.75" />
          <span class="font-medium">
            <template v-if="activeScreen">{{ firstName(activeScreen.name) }} is sharing their screen</template>
            <template v-else>You're sharing your screen</template>
          </span>
          <div class="flex-1" />
          <button v-if="activeScreen" class="inline-flex items-center gap-1 text-base-content/60 hover:text-primary font-medium" title="Fullscreen" @click="fullscreenScreen">
            <Maximize2 class="w-3.5 h-3.5" :stroke-width="1.75" /> Fullscreen
          </button>
          <button v-if="stream.sharingScreen.value" class="text-error font-medium" @click="stream.toggleScreenShare()">Stop sharing</button>
        </div>
        <video v-if="activeScreen" ref="screenVideo" autoplay playsinline muted class="w-full max-h-[65vh] bg-black object-contain" />
        <div v-else class="px-3 py-5 text-center text-xs text-base-content/50">Your screen is visible to everyone in the huddle.</div>
      </div>

      <!-- stream -->
      <div ref="streamScroller" class="relative flex-1 min-h-0 overflow-y-auto py-2" @scroll="onStreamScroll">
        <!-- Decisions & action items -->
        <div v-if="!searching && stream.decisions.value.length" class="mx-4 my-2 rounded-xl border border-primary/30 bg-primary/5 overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-2">
            <Sparkles class="w-4 h-4 text-primary" :stroke-width="1.75" />
            <span class="text-xs font-bold uppercase tracking-wider text-primary">Decisions & action items</span>
            <div class="flex-1" />
            <button class="inline-flex items-center gap-1 text-xs font-medium text-primary disabled:opacity-50" :disabled="pinningAll" @click="pinAllToTasks">
              <Loader2 v-if="pinningAll" class="w-3 h-3 animate-spin" />
              Pin all to Tasks →
            </button>
          </div>
          <div class="flex flex-wrap gap-2 px-3 pb-3">
            <div v-for="d in stream.decisions.value" :key="d.id" class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-1.5 text-xs">
              <button
                class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                :class="d.decision_done ? 'bg-success border-success' : 'border-base-300'"
                :aria-label="d.decision_done ? 'Mark not done' : 'Mark done'"
                @click="stream.toggleDecisionDone(d)"
              >
                <svg v-if="d.decision_done" width="9" height="9" viewBox="0 0 12 12"><path d="M2.5 6.5L5 9l4.5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <span :class="d.decision_done ? 'line-through text-base-content/40' : 'text-base-content'">{{ d.body || 'Decision' }}</span>
            </div>
          </div>
        </div>

        <Transition name="comms-fade" mode="out-in">
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
            <template v-for="(m, i) in displayedMessages" :key="m.id">
              <div v-if="showDayDivider(i)" class="flex items-center gap-3 px-[18px] pt-2.5 pb-1.5">
                <div class="flex-1 h-px bg-base-300/70" />
                <span class="text-[0.7rem] font-bold text-base-content/60 bg-base-100 border border-base-300 rounded-full px-3 py-0.5 whitespace-nowrap">{{ dayLabel(m.created_at) }}</span>
                <div class="flex-1 h-px bg-base-300/70" />
              </div>
              <CommsMessage
                :message="m"
                :continuation="isContinuation(i)"
                :reactions="stream.reactionList(m.id)"
                :reply-count="(stream.repliesByParent.value[m.id] ?? []).length"
                :last-reply-at="(stream.repliesByParent.value[m.id] ?? []).at(-1)?.created_at"
                :linked-task="linkedTaskFor(m.linked_task_id)"
                :can-manage="canManage"
                @react="(e) => onReact(m, e)"
                @open-thread="threadParentId = m.id"
                @make-task="makeTask(m)"
                @toggle-pin="stream.togglePin(m)"
                @mark-decision="stream.markDecision(m)"
                @open-task="openTask"
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
        <div ref="streamEnd" />
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
          @react="(e) => stream.toggleReaction(threadParent!.id, e)"
          @make-task="makeTask(threadParent!)"
          @toggle-pin="stream.togglePin(threadParent!)"
          @open-task="openTask"
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
          @react="(e) => stream.toggleReaction(r.id, e)"
          @make-task="makeTask(r)"
          @toggle-pin="stream.togglePin(r)"
          @open-task="openTask"
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
      @close="activityOpen = false"
      @open="openTask"
    />

    <MicCheck v-if="showMicCheck" @close="showMicCheck = false" />

    <!-- Create-task composer (from a chat line) -->
    <CommsTaskComposer
      v-if="taskComposerFor"
      :message="taskComposerFor"
      @create="onTaskCreate"
      @close="taskComposerFor = null"
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
</style>
