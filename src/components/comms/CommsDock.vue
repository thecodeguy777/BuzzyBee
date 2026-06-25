<script setup lang="ts">
import { ref, computed, inject, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MessagesSquare, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Wand2,
  Send, ChevronDown, Maximize2, Crown, Hash, Bell, BellOff, Users,
  Pencil, Trash2, AlarmClock, CheckSquare, BarChart3,
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { HEX_CLIP_ID } from '@/lib/hexPath'
import HexClipDef from '@/components/shared/HexClipDef.vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import SeenCluster from '@/components/comms/SeenCluster.vue'
import CommsAttachments from '@/components/comms/CommsAttachments.vue'
import TypingIndicator from '@/components/comms/TypingIndicator.vue'
import CommsProfilePopover from '@/components/comms/CommsProfilePopover.vue'
import CommsPoll from '@/components/comms/CommsPoll.vue'
import CommsPollComposer from '@/components/comms/CommsPollComposer.vue'
import CommsReminderComposer from '@/components/comms/CommsReminderComposer.vue'
import CommsTaskComposer from '@/components/comms/CommsTaskComposer.vue'
import type { CommsMessage } from '@/composables/useChannelStream'
import { userColor } from '@/lib/userColor'
import { useProfileHover } from '@/composables/useProfileHover'
import { COMMS_STREAM, HUDDLE_PRESENCE } from '@/composables/commsStream'
import { useChannelsStore } from '@/stores/channels'
import { useDraftsStore } from '@/stores/drafts'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'

const stream = inject(COMMS_STREAM)!
const huddlePresence = inject(HUDDLE_PRESENCE, null)
const channels = useChannelsStore()
const team = useTeamStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const expanded = ref(false)
// Same per-channel draft slot as the full Comms page — start typing in the
// dock, finish on /app/comms (or vice versa), nothing lost on the way.
const drafts = useDraftsStore()
const draft = computed({
  get: () => drafts.get(channels.currentChannelId),
  set: (v) => drafts.set(channels.currentChannelId, v),
})
const channelMenuOpen = ref(false)
const listEl = ref<HTMLElement | null>(null)

// Don't shadow the full Comms page — the dock is for *everywhere else*.
const onCommsPage = computed(() => route.name === 'workstation-comms')
// Show whenever there's something to act on: a live call, or any thread to chat in.
const visible = computed(
  () => !onCommsPage.value && (stream.inHuddle.value || channels.channels.length > 0 || channels.dms.length > 0),
)

const firstName = (n: string | null | undefined) => (n || 'Someone').split(' ')[0]
// Display name for any thread: channels by name, 1:1 DMs by partner, groups by
// their name or member first-names.
function threadName(c: { id: string; name: string; is_dm: boolean; is_group: boolean } | null) {
  if (!c) return 'comms'
  if (!c.is_dm) return c.name
  if (c.is_group && c.name) return c.name
  const members = (channels.dmMembers[c.id] ?? [])
    .map((id) => firstName(team.profiles[id]?.full_name))
  return members.join(', ') || 'Direct message'
}
const channelName = computed(() => threadName(channels.currentChannel))
const currentIsDm = computed(() => !!channels.currentChannel?.is_dm)
// Launcher badge: everything you can reply to from the dock — channels + DMs.
const dockUnread = computed(() => channels.totalUnread + channels.dmUnreadTotal)
// DM threads for the switcher, busiest first.
const dmThreads = computed(() =>
  [...channels.dms].sort((a, b) =>
    (channels.lastMessageAt[b.id] ?? '').localeCompare(channels.lastMessageAt[a.id] ?? ''),
  ),
)
// Channel occupancy (same clusters as the Comms sidebar) for the switcher.
function viewerCluster(id: string) {
  return (huddlePresence?.viewersByChannel.value[id] ?? []).map((uid) => ({
    id: uid,
    name: team.profiles[uid]?.full_name ?? 'Member',
    avatarUrl: team.profiles[uid]?.avatar_url ?? null,
  }))
}
const hostName = computed(() => {
  const h = stream.huddleHost.value
  return h ? firstName(stream.huddlePeople.value.find((p) => p.userId === h)?.name) : ''
})
const speakingNow = computed(() => stream.speaking.value.size > 0)

// Last slice of the channel for the compact view (full history lives in Comms).
const messages = computed(() => stream.rootMessages.value.slice(-50))
function nameFor(m: { user_id: string | null; user_name: string | null }) {
  return m.user_name || (m.user_id ? team.profiles[m.user_id]?.full_name : null) || 'Someone'
}
function avatarFor(userId: string | null) {
  return userId ? team.profiles[userId]?.avatar_url ?? null : null
}
function timeFor(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
// Hide the avatar/name header on consecutive messages from the same author.
function isContinuation(i: number) {
  const m = messages.value[i]
  const prev = messages.value[i - 1]
  return !!prev && !!m && prev.user_id === m.user_id &&
    new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
}

// ── Hover profile (shared with the full Comms stream) ────────────────────────
const hover = useProfileHover()
async function startDm(userId: string) {
  hover.close()
  if (userId === auth.user?.id) return
  try {
    const id = await channels.openDm(userId)
    if (id) { channels.select(id); scrollToBottom() }
  } catch { /* ignore */ }
}

// ── Typing indicator ─────────────────────────────────────────────────────────
const typingMembers = computed(() =>
  stream.typing.value.map((t) => ({ id: t.userId, name: t.name, avatarUrl: t.avatarUrl }))
)
function onInput() {
  if (draft.value.trim()) stream.sendTyping()
}

// ── Seen-by (read receipts) ──────────────────────────────────────────────────
const lastMsg = computed(() => messages.value.at(-1) ?? null)
const seenMembers = computed(() => {
  const last = lastMsg.value
  if (!last) return []
  const t = new Date(last.created_at).getTime()
  const out: { id: string; name: string; avatarUrl: string | null }[] = []
  for (const r of stream.reads.value) {
    if (r.user_id === auth.user?.id || !r.last_read_at) continue
    if (new Date(r.last_read_at).getTime() >= t) {
      const p = team.profiles[r.user_id]
      out.push({ id: r.user_id, name: p?.full_name ?? 'Member', avatarUrl: p?.avatar_url ?? null })
    }
  }
  return out
})

// ── Unseen "breathing" highlight ─────────────────────────────────────────────
const freshIds = ref<Set<string>>(new Set())
const freshTimers = new Map<string, number>()
function markFresh(id: string, ttl = 7000) {
  if (!freshIds.value.has(id)) freshIds.value = new Set(freshIds.value).add(id)
  if (freshTimers.has(id)) window.clearTimeout(freshTimers.get(id))
  freshTimers.set(id, window.setTimeout(() => {
    const next = new Set(freshIds.value)
    next.delete(id)
    freshIds.value = next
    freshTimers.delete(id)
  }, ttl))
}
function clearFresh() {
  for (const t of freshTimers.values()) window.clearTimeout(t)
  freshTimers.clear()
  freshIds.value = new Set()
}
// Stable per-channel baseline (mirrors the full Comms view) so live messages
// don't race the server clock and get swallowed.
let breatheChannel: string | null = null
let breatheBaseline = 0
const breatheSeen = new Set<string>()
function isFresh(m: { user_id: string | null; created_at: string }) {
  return m.user_id !== auth.user?.id && new Date(m.created_at).getTime() > breatheBaseline
}
function primeBreathing() {
  const cid = channels.currentChannelId ?? ''
  const list = messages.value
  breatheChannel = cid
  clearFresh()
  breatheSeen.clear()
  for (const m of list) breatheSeen.add(m.id)
  const entry = channels.entryReadAt[cid]
  const newest = list.length ? new Date(list[list.length - 1].created_at).getTime() : Date.now()
  breatheBaseline = entry ? new Date(entry).getTime() : newest
  if (entry) for (const m of list) if (isFresh(m)) markFresh(m.id)
}
watch(() => messages.value, (list) => {
  if ((channels.currentChannelId ?? '') !== breatheChannel) { primeBreathing(); return }
  for (const m of list) {
    if (breatheSeen.has(m.id)) continue
    breatheSeen.add(m.id)
    if (isFresh(m)) markFresh(m.id)
  }
})

// Advance our read position when a message lands while the dock is open at the
// bottom — same fix as the full Comms view, so others see us catch up.
let markReadTimer: ReturnType<typeof setTimeout> | undefined
function markReadSoon() {
  clearTimeout(markReadTimer)
  markReadTimer = setTimeout(() => {
    const id = channels.currentChannelId
    if (id && expanded.value && document.visibilityState === 'visible') void channels.markRead(id)
  }, 300)
}

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}
async function send() {
  const cid = channels.currentChannelId
  const body = draft.value
  if (!body.trim()) return
  drafts.clear(cid)
  try {
    await stream.send(body)
    scrollToBottom()
  } catch {
    // Restore to the channel it was typed in — it may no longer be current.
    drafts.set(cid, body)
  }
}
const canManage = computed(() => auth.isAdmin || auth.role === 'pm')

// ── Message edit / delete (inline) ───────────────────────────────────────────
const editingId = ref<string | null>(null)
const editDraft = ref('')
function startEdit(m: CommsMessage) {
  editingId.value = m.id
  editDraft.value = m.body
}
function cancelEdit() { editingId.value = null }
async function saveEdit(m: CommsMessage) {
  const next = editDraft.value.trim()
  editingId.value = null
  if (!next || next === m.body) return
  await stream.editMessage(m.id, next)
}
async function confirmDelete(m: CommsMessage) {
  if (window.confirm('Delete this message? This can’t be undone.')) await stream.deleteMessage(m)
}

// ── Slash commands (mirror the full Comms composer, minus @mentions) ──────────
const pollComposerOpen = ref(false)
const reminderComposerOpen = ref(false)
const taskComposerFor = ref<CommsMessage | null>(null)
const taskComposerStandalone = ref(false)
const editingReminder = ref<{ id: string; body: string; remind_at: string } | null>(null)
const SLASH_CMDS = [
  { cmd: '/task', icon: CheckSquare, label: 'Create a task' },
  { cmd: '/huddle', icon: Headphones, label: 'Start a huddle' },
  { cmd: '/poll', icon: BarChart3, label: 'Create a poll' },
  { cmd: '/remind', icon: Bell, label: 'Set a reminder' },
]
const showSlash = computed(() => draft.value.startsWith('/') && !draft.value.includes(' '))
const slashFiltered = computed(() => SLASH_CMDS.filter((s) => s.cmd.startsWith(draft.value.toLowerCase())))
function pickSlash(cmd: string) {
  if (cmd === '/task') startSlashTask()
  else if (cmd === '/huddle') { draft.value = ''; stream.toggleHuddle() }
  else if (cmd === '/poll') { draft.value = ''; pollComposerOpen.value = true }
  else if (cmd === '/remind') { draft.value = ''; editingReminder.value = null; reminderComposerOpen.value = true }
}
function onComposerKeydown(e: KeyboardEvent) {
  if (showSlash.value && slashFiltered.value.length) {
    if (e.key === 'Enter') { e.preventDefault(); pickSlash(slashFiltered.value[0].cmd); return }
    if (e.key === 'Escape') { e.preventDefault(); draft.value = ''; return }
  }
  if (e.key === 'Enter') { e.preventDefault(); void send() }
}
async function onPollCreate(payload: { question: string; options: string[] }) {
  pollComposerOpen.value = false
  try { if (await stream.createPoll(payload.question, payload.options)) scrollToBottom() } catch { /* ignore */ }
}
function startSlashTask() {
  draft.value = ''
  const cid = channels.currentChannelId
  if (!cid) return
  taskComposerStandalone.value = true
  taskComposerFor.value = {
    id: '', channel_id: cid, parent_id: null, user_id: auth.user?.id ?? '',
    user_name: auth.fullName || null, body: '', attachments: [], mentioned_user_ids: [],
    is_pinned: false, is_decision: false, decision_done: false, linked_task_id: null,
    edited_at: null, created_at: '', updated_at: '',
  } as CommsMessage
}
async function onTaskCreate(payload: { title: string; projectId?: string; statusKey?: string; assignee_id: string | null; due_on: string | null; priority: 1 | 2 | 3 | 4 }) {
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
    await stream.createTaskFromMessage(target, payload)
  } catch { /* ignore */ }
}

// ── Reminders (list / edit / delete) ─────────────────────────────────────────
const remindersOpen = ref(false)
const pendingReminders = computed(() => stream.reminders.value.filter((r) => !r.done_at))
function toggleReminders() {
  remindersOpen.value = !remindersOpen.value
  if (remindersOpen.value) void stream.loadReminders()
}
async function onReminderCreate(payload: { remindAt: string; body: string }) {
  reminderComposerOpen.value = false
  const editId = editingReminder.value?.id ?? null
  editingReminder.value = null
  try {
    if (editId) await stream.updateReminder(editId, { body: payload.body, remind_at: payload.remindAt })
    else await stream.createReminder(payload.remindAt, payload.body)
  } catch { /* ignore */ }
}
function editReminder(r: { id: string; body: string; remind_at: string }) {
  remindersOpen.value = false
  editingReminder.value = { id: r.id, body: r.body, remind_at: r.remind_at }
  reminderComposerOpen.value = true
}
async function removeReminder(r: { id: string }) {
  await stream.deleteReminder(r.id)
}
function reminderWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function open() {
  expanded.value = true
  channelMenuOpen.value = false
  const id = channels.currentChannelId
  if (id) void channels.markRead(id)
  scrollToBottom()
}
function pickChannel(id: string) {
  channels.select(id)
  channelMenuOpen.value = false
  scrollToBottom()
}
function jumpToComms() {
  router.push({ name: 'workstation-comms' })
}

// ── Hive launcher ────────────────────────────────────────────────────────────
// The collapsed dock blooms its UNREAD threads (DM faces + channel hexes) around
// a center message hexagon. Hover (tap on touch) reveals them; click opens one.
type HiveKind = 'channel' | 'dm' | 'group'
interface HiveSource {
  id: string; kind: HiveKind; name: string
  avatarUrl: string | null; colorKey: string | null
  unread: number; at: string
}
const unreadSources = computed<HiveSource[]>(() => {
  const all = [...channels.channels, ...channels.dms]
  return all
    .filter((c) => channels.isUnread(c.id))
    .map((c): HiveSource => {
      const kind: HiveKind = !c.is_dm ? 'channel' : c.is_group ? 'group' : 'dm'
      const partnerId = kind === 'dm' ? (channels.dmMembers[c.id]?.[0] ?? null) : null
      const prof = partnerId ? team.profiles[partnerId] : undefined
      return {
        id: c.id,
        kind,
        name: threadName(c),
        avatarUrl: kind === 'dm' ? (prof?.avatar_url ?? null) : null,
        colorKey: kind === 'dm' ? partnerId : null,
        unread: channels.unread[c.id] ?? 0,
        at: channels.lastMessageAt[c.id] ?? '',
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at)) // newest first (ISO comparable)
})
const HIVE_CAP = 4
const hiveSources = computed(() => unreadSources.value.slice(0, HIVE_CAP))
const hiveOverflow = computed(() => Math.max(0, unreadSources.value.length - HIVE_CAP))
const hiveEmpty = computed(() => unreadSources.value.length === 0)

// Fan geometry — tiles fan up-and-left from the bottom-right anchor; index 0
// (newest) sits nearest the center. Down-right stays empty (it's the corner).
const HEX = 56
const TILE = 44
const FAN = [
  { x: -52, y: -30 }, { x: -34, y: -72 }, { x: -78, y: -68 }, { x: -62, y: -112 },
]
const FAN_OVERFLOW = { x: -102, y: -108 }
function tileStyle(i: number) {
  const f = FAN[i] ?? FAN[FAN.length - 1]
  return { left: f.x + 'px', top: f.y + 'px', zIndex: String(10 - i) }
}
function overflowStyle() {
  return { left: FAN_OVERFLOW.x + 'px', top: FAN_OVERFLOW.y + 'px', zIndex: '5' }
}
const hexClip = `url(#${HEX_CLIP_ID})`

// ── Last-message snippet (lazy fetch for the ≤4 shown, on bloom) ──────────────
function stripHtmlLocal(s: string) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}
interface Snippet { text: string; sender: string; at: string }
const snippetCache = ref<Record<string, Snippet>>({})
async function loadSnippets() {
  const need = hiveSources.value.filter((s) => {
    const c = snippetCache.value[s.id]
    return !c || c.at !== s.at // missing or stale (timestamp advanced)
  })
  if (!need.length) return
  // One latest-root-message query per needed thread (≤4) so a single busy
  // channel can't starve the others' snippets.
  const rows = await Promise.all(
    need.map((s) =>
      supabase
        .from('messages')
        .select('channel_id, body, user_name, created_at')
        .eq('channel_id', s.id)
        .is('parent_id', null) // root messages only
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  )
  const next = { ...snippetCache.value }
  for (const r of rows) {
    const row = r.data as any
    if (!row) continue
    next[row.channel_id] = { text: stripHtmlLocal(row.body ?? ''), sender: row.user_name ?? '', at: row.created_at }
  }
  snippetCache.value = next
}
function snippetFor(id: string): string {
  const s = snippetCache.value[id]
  if (!s || !s.text) return 'New message'
  return s.sender ? `${firstName(s.sender)}: ${s.text}` : s.text
}
function snippetTime(id: string): string {
  const at = snippetCache.value[id]?.at ?? channels.lastMessageAt[id]
  return at ? timeFor(at) : ''
}

// ── Bloom open/close (hover bridge + grace), touch, and the preview pill ──────
const hiveOpen = ref(false)
const hiveRoot = ref<HTMLElement | null>(null)
const isTouch = ref(false)
let hiveCloseTimer: ReturnType<typeof setTimeout> | null = null
const previewId = ref<string | null>(null)
const previewStyle = ref<Record<string, string>>({})
const previewName = computed(() => hiveSources.value.find((s) => s.id === previewId.value)?.name ?? '')
// Render tiles only while open, but keep the TransitionGroup itself mounted so
// the children actually enter/leave-animate — a v-if'd group skips its
// children's transitions (and never plays the leave at all).
const bloomTiles = computed(() => (hiveOpen.value ? hiveSources.value : []))

function openHive() {
  if (hiveCloseTimer) { clearTimeout(hiveCloseTimer); hiveCloseTimer = null }
  if (hiveEmpty.value) return // 0 unread → plain center hex, no bloom
  hiveOpen.value = true
  void loadSnippets()
}
function closeHiveSoon() {
  if (hiveCloseTimer) clearTimeout(hiveCloseTimer)
  hiveCloseTimer = setTimeout(() => { hiveOpen.value = false; previewId.value = null }, 180)
}
function closeHiveNow() {
  if (hiveCloseTimer) { clearTimeout(hiveCloseTimer); hiveCloseTimer = null }
  hiveOpen.value = false
  previewId.value = null
}
function onHiveEnter() { if (!isTouch.value) openHive() }
function onHiveLeave() { if (!isTouch.value) closeHiveSoon() }
function markTouch() { isTouch.value = true }
function onTileEnter(id: string, ev: MouseEvent) {
  if (isTouch.value) return
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  const W = 240
  // Prefer left of the tile; if there's no room (narrow viewport) flip right so
  // the pill never covers the tile it's previewing.
  const leftSlot = r.left - W - 8
  const left = leftSlot >= 8 ? leftSlot : Math.min(r.right + 8, window.innerWidth - W - 8)
  previewStyle.value = {
    left: left + 'px',
    top: Math.max(8, r.top + r.height / 2 - 18) + 'px',
    width: W + 'px',
  }
  previewId.value = id
}
function onTileLeave() { previewId.value = null }

function mostRecentUnreadId(): string | null {
  return unreadSources.value[0]?.id ?? null
}
// Center click: jump to the most-recent unread thread (the fix for "always lands
// on #general"), then open the panel. On touch, the first tap blooms instead.
function openLatestUnread() {
  const target = mostRecentUnreadId()
  if (target && target !== channels.currentChannelId) channels.select(target)
  open()
}
function onCenterClick() {
  if (isTouch.value) {
    if (hiveOpen.value) { closeHiveNow(); return }  // second tap dismisses the bloom
    if (!hiveEmpty.value) { openHive(); return }     // first tap blooms
  }
  openLatestUnread()
}
// Click a bloom tile → straight into that thread (its own expand, so it can't be
// re-routed by the latest-unread jump after markRead clears it).
function openThread(id: string) {
  channels.select(id)
  expanded.value = true
  channelMenuOpen.value = false
  void channels.markRead(id)
  scrollToBottom()
  closeHiveNow()
}
function openOverflow() {
  // Just reveal the full thread switcher — don't consume/mark-read the newest
  // unread (the "+N" button is "show me the list", not "open one").
  expanded.value = true
  channelMenuOpen.value = true
  closeHiveNow()
}
function onDocPointerDown(e: PointerEvent) {
  if (!hiveOpen.value) return
  if (hiveRoot.value && !hiveRoot.value.contains(e.target as Node)) closeHiveNow()
}
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  if (hiveCloseTimer) clearTimeout(hiveCloseTimer)
})

watch(() => messages.value.length, () => { if (expanded.value) { scrollToBottom(); markReadSoon() } })

// While expanded, the dock counts as actively viewing the channel — suppress
// new-message pings and keep it marked read.
let viewing = false
watch(expanded, (v) => {
  if (v) {
    scrollToBottom()
    if (!viewing) { viewing = true; stream.registerViewer() }
  } else if (viewing) {
    viewing = false; stream.unregisterViewer()
  }
})
onBeforeUnmount(() => { if (viewing) stream.unregisterViewer() })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      <!-- ── Expanded panel ── -->
      <div
        v-if="expanded"
        class="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden flex flex-col"
        style="height: min(32rem, calc(100vh - 6rem))"
      >
        <!-- header -->
        <header class="relative flex items-center gap-2 px-3 py-2.5 border-b border-base-300 bg-base-100">
          <button class="flex items-center gap-1.5 min-w-0 rounded-md hover:bg-base-200 px-1.5 py-1 -ml-1" @click="channelMenuOpen = !channelMenuOpen">
            <component :is="currentIsDm ? MessagesSquare : Hash" class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="2" />
            <span class="font-display font-semibold truncate">{{ channelName }}</span>
            <ChevronDown class="w-3.5 h-3.5 text-base-content/40 shrink-0" :stroke-width="2" />
          </button>
          <span v-if="stream.inHuddle.value && hostName" class="text-[0.65rem] text-base-content/40 truncate">· {{ hostName }} 👑</span>
          <div class="flex-1" />
          <button
            class="relative w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center"
            :class="remindersOpen ? 'text-primary' : 'text-base-content/50'"
            title="Reminders"
            @click="toggleReminders"
          >
            <AlarmClock class="w-4 h-4" :stroke-width="1.75" />
            <span v-if="pendingReminders.length" class="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-white text-[0.55rem] font-bold flex items-center justify-center">{{ pendingReminders.length }}</span>
          </button>
          <button
            class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center"
            :class="stream.soundMuted.value ? 'text-base-content/40' : 'text-base-content/60'"
            :title="stream.soundMuted.value ? 'Comms sounds off' : 'Comms sounds on'"
            @click="stream.toggleSounds()"
          >
            <component :is="stream.soundMuted.value ? BellOff : Bell" class="w-4 h-4" :stroke-width="1.75" />
          </button>
          <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Open full Comms" @click="jumpToComms">
            <Maximize2 class="w-4 h-4" :stroke-width="1.75" />
          </button>
          <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Minimize" @click="expanded = false">
            <ChevronDown class="w-4 h-4" :stroke-width="2" />
          </button>

          <!-- thread switcher: channels + DMs -->
          <div v-if="channelMenuOpen" class="absolute left-2 top-full mt-1 z-10 w-56 max-h-64 overflow-y-auto rounded-xl border border-base-300 bg-base-100 shadow-lg p-1" @mouseleave="channelMenuOpen = false">
            <button
              v-for="c in channels.sorted"
              :key="c.id"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left"
              :class="c.id === channels.currentChannelId ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-base-200'"
              @click="pickChannel(c.id)"
            >
              <Hash class="w-3.5 h-3.5 shrink-0" :stroke-width="2" />
              <span class="flex-1 truncate">{{ c.name }}</span>
              <SeenCluster v-if="viewerCluster(c.id).length" :members="viewerCluster(c.id)" :size="12" :max="3" />
              <span v-if="channels.unread[c.id]" class="min-w-[1rem] h-4 px-1 rounded-full bg-error text-white text-[0.6rem] font-bold flex items-center justify-center">{{ channels.unread[c.id] }}</span>
            </button>
            <template v-if="dmThreads.length">
              <div class="px-2 pt-2 pb-1 text-[0.6rem] font-semibold uppercase tracking-wider text-base-content/40">Messages</div>
              <button
                v-for="c in dmThreads"
                :key="c.id"
                class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left"
                :class="c.id === channels.currentChannelId ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-base-200'"
                @click="pickChannel(c.id)"
              >
                <MessagesSquare class="w-3.5 h-3.5 shrink-0 text-base-content/50" :stroke-width="2" />
                <span class="flex-1 truncate">{{ threadName(c) }}</span>
                <span v-if="channels.unread[c.id]" class="min-w-[1rem] h-4 px-1 rounded-full bg-error text-white text-[0.6rem] font-bold flex items-center justify-center">{{ channels.unread[c.id] }}</span>
              </button>
            </template>
          </div>

          <!-- reminders dropdown -->
          <div v-if="remindersOpen" class="absolute right-2 top-full mt-1 z-20 w-64 max-h-72 overflow-y-auto rounded-xl border border-base-300 bg-base-100 shadow-lg p-1" @mouseleave="remindersOpen = false">
            <div class="px-2 pt-1 pb-1.5 text-[0.6rem] font-semibold uppercase tracking-wider text-base-content/40 truncate">Reminders · #{{ channelName }}</div>
            <p v-if="!pendingReminders.length" class="px-2 py-2 text-xs text-base-content/40">None set. Type <span class="font-mono text-base-content/60">/remind</span>.</p>
            <div v-for="r in pendingReminders" :key="r.id" class="flex items-start gap-1.5 px-2 py-1.5 rounded-md hover:bg-base-200">
              <div class="min-w-0 flex-1">
                <div class="text-[0.8rem] text-base-content/90 break-words">{{ r.body }}</div>
                <div class="text-[0.65rem] text-base-content/45 mt-0.5">{{ reminderWhen(r.remind_at) }}</div>
              </div>
              <button class="w-5 h-5 rounded hover:bg-base-300 flex items-center justify-center text-base-content/50 hover:text-base-content shrink-0" title="Edit" @click="editReminder(r)"><Pencil class="w-3 h-3" :stroke-width="2" /></button>
              <button class="w-5 h-5 rounded hover:bg-error/10 flex items-center justify-center text-base-content/50 hover:text-error shrink-0" title="Delete" @click="removeReminder(r)"><Trash2 class="w-3 h-3" :stroke-width="2" /></button>
            </div>
          </div>
        </header>

        <!-- participants (in a call) -->
        <div v-if="stream.huddlePeople.value.length" class="flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b border-base-300 bg-primary/5">
          <span
            v-for="p in stream.huddlePeople.value"
            :key="p.userId"
            class="inline-flex items-center gap-1 rounded-full border bg-base-100 pl-0.5 pr-2 py-0.5 shrink-0"
            :class="stream.speaking.value.has(p.userId) ? 'border-success ring-1 ring-success/40' : 'border-base-300'"
            :title="p.name + (p.muted ? ' (muted)' : '')"
          >
            <span class="relative inline-flex">
              <HexAvatar :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.userId" :size="18" />
              <span v-if="p.muted" class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-error flex items-center justify-center ring-1 ring-base-100">
                <MicOff class="w-1.5 h-1.5 text-white" :stroke-width="3" />
              </span>
            </span>
            <span class="text-[0.7rem] font-medium">{{ firstName(p.name) }}</span>
            <Crown v-if="p.userId === stream.huddleHost.value" class="w-2.5 h-2.5 text-warning shrink-0" :stroke-width="2.5" />
          </span>
        </div>

        <!-- messages -->
        <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto py-2">
          <div v-if="messages.length === 0" class="px-4 py-8 text-center text-xs text-base-content/40">
            No messages yet — say hello 🐝
          </div>
          <div
            v-for="(m, i) in messages"
            :key="m.id"
            class="group/dmsg relative flex gap-2 px-3"
            :class="[isContinuation(i) ? 'py-0.5' : 'py-1 mt-1', freshIds.has(m.id) ? 'dock-unseen' : '']"
          >
            <!-- hover edit/delete (own messages, or manager delete) -->
            <div
              v-if="!m.deleted_at && editingId !== m.id && (m.user_id === auth.user?.id || canManage)"
              class="absolute top-0 right-2 z-10 hidden group-hover/dmsg:flex items-center gap-0.5 rounded-md border border-base-300 bg-base-100 shadow-sm p-0.5"
            >
              <button v-if="m.user_id === auth.user?.id && !m.poll" class="w-5 h-5 rounded hover:bg-base-200 flex items-center justify-center text-base-content/60" title="Edit" @click="startEdit(m)"><Pencil class="w-3 h-3" :stroke-width="2" /></button>
              <button class="w-5 h-5 rounded hover:bg-error/10 flex items-center justify-center text-base-content/60 hover:text-error" title="Delete" @click="confirmDelete(m)"><Trash2 class="w-3 h-3" :stroke-width="2" /></button>
            </div>
            <div class="w-6 shrink-0 flex justify-center">
              <button
                v-if="!isContinuation(i)"
                type="button"
                class="rounded-md transition hover:opacity-90 focus:outline-none"
                @mouseenter="m.user_id && hover.open(m.user_id, $event)"
                @mouseleave="hover.scheduleClose"
                @click="m.user_id && hover.open(m.user_id, $event)"
              >
                <HexAvatar :name="nameFor(m)" :avatar-url="avatarFor(m.user_id)" :color-key="m.user_id ?? nameFor(m)" :size="24" />
              </button>
            </div>
            <div class="flex-1 min-w-0">
              <div v-if="!isContinuation(i)" class="flex items-baseline gap-1.5">
                <button
                  type="button"
                  class="text-xs font-semibold truncate hover:underline focus:outline-none"
                  :style="{ color: userColor(m.user_id) }"
                  @mouseenter="m.user_id && hover.open(m.user_id, $event)"
                  @mouseleave="hover.scheduleClose"
                  @click="m.user_id && hover.open(m.user_id, $event)"
                >{{ nameFor(m) }}</button>
                <span class="text-[0.6rem] text-base-content/40 shrink-0">{{ timeFor(m.created_at) }}</span>
              </div>
              <!-- deleted tombstone -->
              <div v-if="m.deleted_at" class="text-[0.78rem] italic text-base-content/40 flex items-center gap-1">
                <Trash2 class="w-3 h-3 shrink-0" :stroke-width="1.75" /> This message was deleted
              </div>
              <!-- poll card -->
              <CommsPoll v-else-if="m.poll" :poll="m.poll" :tally="stream.pollTally(m.id)" @vote="stream.votePoll(m.id, $event)" />
              <!-- inline editor -->
              <div v-else-if="editingId === m.id" class="mt-0.5">
                <input
                  v-model="editDraft"
                  class="w-full rounded-lg border border-base-300 bg-base-100 px-2 py-1 text-[0.8rem] outline-none focus:border-primary"
                  @keydown.enter.prevent="saveEdit(m)"
                  @keydown.esc.prevent="cancelEdit"
                />
                <div class="mt-1 flex items-center gap-2 text-[0.65rem]">
                  <button class="px-2 py-0.5 rounded bg-primary text-white font-semibold" @click="saveEdit(m)">Save</button>
                  <button class="px-1.5 py-0.5 rounded hover:bg-base-200 text-base-content/60" @click="cancelEdit">Cancel</button>
                </div>
              </div>
              <!-- body -->
              <template v-else>
                <div v-if="m.body" class="text-[0.8rem] text-base-content/90 whitespace-pre-wrap break-words leading-snug">{{ m.body }}<span v-if="m.edited_at" class="ml-1 text-[0.6rem] text-base-content/35">(edited)</span></div>
                <CommsAttachments v-if="m.attachments?.length" :attachments="m.attachments" compact />
              </template>
            </div>
          </div>

          <!-- seen-by honeycomb -->
          <div v-if="seenMembers.length" class="flex items-center justify-end gap-1.5 px-3 pt-1 pb-0.5">
            <span class="text-[0.55rem] font-medium text-base-content/40">Seen</span>
            <SeenCluster :members="seenMembers" :size="14" :max="4" appear />
          </div>
        </div>

        <!-- typing indicator -->
        <TypingIndicator :members="typingMembers" class="px-3 pt-1" />

        <!-- composer -->
        <div class="relative px-2 py-2 border-t border-base-300">
          <!-- slash command menu -->
          <div v-if="showSlash && slashFiltered.length" class="absolute bottom-[calc(100%-0.25rem)] left-2 right-2 z-10 rounded-xl border border-base-300 bg-base-100 shadow-lg overflow-hidden">
            <button
              v-for="(s, i) in slashFiltered"
              :key="s.cmd"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2 text-left"
              :class="i === 0 ? 'bg-base-200/60' : 'hover:bg-base-200'"
              @click="pickSlash(s.cmd)"
            >
              <component :is="s.icon" class="w-3.5 h-3.5 text-base-content/60 shrink-0" :stroke-width="1.75" />
              <span class="text-[0.8rem]"><span class="font-mono font-semibold">{{ s.cmd }}</span> · {{ s.label }}</span>
            </button>
          </div>
          <div class="flex items-center gap-1.5 rounded-xl border border-base-300 bg-base-100 pl-3 pr-1.5 py-1">
            <input
              v-model="draft"
              :placeholder="currentIsDm ? `Message ${channelName}` : `Message #${channelName} — / for commands`"
              class="flex-1 bg-transparent text-sm outline-none min-w-0"
              @input="onInput"
              @keydown="onComposerKeydown"
            />
            <button class="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-40" :disabled="!draft.trim()" @click="send">
              <Send class="w-3.5 h-3.5" :stroke-width="2" />
            </button>
          </div>
        </div>

        <!-- call controls -->
        <div class="flex items-center gap-1.5 px-2 py-2 border-t border-base-300 bg-base-200/50">
          <template v-if="stream.inHuddle.value">
            <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="stream.muted.value ? 'bg-error/15 text-error' : 'bg-base-100 text-base-content/70'" :title="stream.muted.value ? 'Unmute' : 'Mute'" @click="stream.toggleMute()">
              <component :is="stream.muted.value ? MicOff : Mic" class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="stream.noiseSuppression.value ? 'bg-primary/15 text-primary' : 'bg-base-100 text-base-content/70'" :title="stream.rnnoiseActive.value ? 'AI noise cancellation' : 'Noise cancellation'" @click="stream.toggleNoise()">
              <Wand2 class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button class="w-8 h-8 rounded-lg flex items-center justify-center" :class="stream.sharingScreen.value ? 'bg-primary/15 text-primary' : 'bg-base-100 text-base-content/70'" title="Share screen" @click="stream.toggleScreenShare()">
              <MonitorUp class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <div class="flex-1" />
            <button class="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-error text-white text-xs font-semibold" @click="stream.toggleHuddle()">
              <PhoneOff class="w-3.5 h-3.5" :stroke-width="1.75" /> Leave
            </button>
          </template>
          <button v-else class="inline-flex items-center justify-center gap-2 h-8 w-full rounded-lg bg-primary text-white text-xs font-semibold" @click="stream.toggleHuddle()">
            <Headphones class="w-4 h-4" :stroke-width="1.75" /> Start huddle {{ currentIsDm ? 'with ' + channelName : 'in #' + channelName }}
          </button>
        </div>
      </div>

      <!-- ── Collapsed: in a call ── -->
      <div
        v-if="!expanded && stream.inHuddle.value"
        class="flex items-center gap-2 rounded-full border border-primary/30 bg-base-100 shadow-xl pl-3 pr-1.5 py-1.5"
      >
        <button class="flex items-center gap-2 min-w-0" @click="open" title="Open huddle">
          <span class="relative flex h-2.5 w-2.5 shrink-0">
            <span v-if="speakingNow" class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <span class="text-xs font-semibold truncate max-w-[7rem]">#{{ channelName }}</span>
          <span class="flex -space-x-1.5">
            <HexAvatar v-for="p in stream.huddlePeople.value.slice(0, 3)" :key="p.userId" :name="p.name" :avatar-url="p.avatarUrl" :color-key="p.userId" :size="22" ring />
          </span>
        </button>
        <button class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" :class="stream.muted.value ? 'bg-error/15 text-error' : 'bg-base-200 text-base-content/70'" :title="stream.muted.value ? 'Unmute' : 'Mute'" @click="stream.toggleMute()">
          <component :is="stream.muted.value ? MicOff : Mic" class="w-4 h-4" :stroke-width="1.75" />
        </button>
        <button class="w-8 h-8 rounded-full bg-error text-white flex items-center justify-center shrink-0" title="Leave" @click="stream.toggleHuddle()">
          <PhoneOff class="w-4 h-4" :stroke-width="1.75" />
        </button>
      </div>

      <!-- ── Collapsed: hive launcher ── -->
      <div
        v-else-if="!expanded"
        ref="hiveRoot"
        class="relative"
        :style="{ width: HEX + 'px', height: HEX + 'px' }"
        @mouseenter="onHiveEnter"
        @mouseleave="onHiveLeave"
        @focusin="onHiveEnter"
        @focusout="onHiveLeave"
        @keydown.esc="closeHiveNow"
        @touchstart.passive="markTouch"
      >
        <!-- clip def so the center hexagon is shaped even with no bloom tiles -->
        <HexClipDef />

        <!-- bloom: unread threads fan up-and-left, newest nearest the center -->
        <TransitionGroup name="bloom" tag="div">
          <button
            v-for="(s, i) in bloomTiles"
            :key="s.id"
            type="button"
            class="absolute transition-transform hover:scale-110"
            :style="{ ...tileStyle(i), transitionDelay: (i * 40) + 'ms' }"
            :title="s.name"
            :aria-label="`Open ${s.name}${s.unread > 1 ? `, ${s.unread} unread` : ''}`"
            @mouseenter="onTileEnter(s.id, $event)"
            @mouseleave="onTileLeave"
            @click.stop="openThread(s.id)"
          >
            <HexAvatar
              v-if="s.kind === 'dm'"
              :name="s.name" :avatar-url="s.avatarUrl" :color-key="s.colorKey"
              :size="TILE" ring class="dock-glow"
            />
            <HexAvatar
              v-else-if="s.kind === 'group'"
              :name="s.name" label=" " :fill="userColor(s.id)"
              :size="TILE" ring class="dock-glow"
            >
              <template #badge>
                <span class="absolute inset-0 flex items-center justify-center text-white">
                  <Users class="w-4 h-4" :stroke-width="2" />
                </span>
              </template>
            </HexAvatar>
            <HexAvatar
              v-else
              label="#" :fill="userColor(s.id)" :size="TILE" :font-size="20" ring class="dock-glow"
            />
            <span
              v-if="s.unread > 1"
              class="absolute -top-1 -right-1 min-w-[1.05rem] h-[1.05rem] px-1 rounded-full bg-error text-white text-[0.6rem] font-bold flex items-center justify-center ring-2 ring-base-100"
            >{{ s.unread > 9 ? '9+' : s.unread }}</span>
          </button>

          <!-- "+N" overflow → opens the full thread switcher -->
          <button
            v-if="hiveOpen && hiveOverflow > 0"
            key="__overflow"
            type="button"
            class="absolute transition-transform hover:scale-110"
            :style="{ ...overflowStyle(), transitionDelay: (HIVE_CAP * 40) + 'ms' }"
            title="More conversations"
            :aria-label="`${hiveOverflow} more conversations`"
            @click.stop="openOverflow"
          >
            <HexAvatar :label="`+${hiveOverflow}`" placeholder :size="TILE" :font-size="15" ring />
          </button>
        </TransitionGroup>

        <!-- center hexagon: the launcher -->
        <button
          type="button"
          class="absolute inset-0 transition-transform hover:scale-105"
          title="Open chat"
          :aria-label="dockUnread > 0 ? `Open chat, ${dockUnread} unread` : 'Open chat'"
          @click="onCenterClick"
        >
          <span
            class="absolute inset-0 flex items-center justify-center bg-primary text-white shadow-xl"
            :class="dockUnread > 0 ? 'hive-breathe' : ''"
            :style="{ clipPath: hexClip, WebkitClipPath: hexClip }"
          >
            <MessagesSquare class="w-6 h-6" :stroke-width="1.75" />
          </span>
          <span
            v-if="dockUnread > 0"
            class="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center ring-2 ring-base-100"
          >{{ dockUnread > 99 ? '99+' : dockUnread }}</span>
        </button>

        <!-- hover preview pill (name + last-message snippet), slides left of the tile -->
        <Teleport to="body">
          <div v-if="previewId" class="fixed z-[60] pointer-events-none" :style="previewStyle">
            <div class="bloom-pill rounded-xl bg-base-100 shadow-xl border border-base-300/60 px-3 py-2">
              <div class="flex items-baseline gap-2">
                <span class="text-xs font-semibold truncate">{{ previewName }}</span>
                <span class="text-[0.6rem] text-base-content/50 shrink-0">{{ snippetTime(previewId) }}</span>
              </div>
              <span class="block text-[0.7rem] text-base-content/70 truncate">{{ snippetFor(previewId) }}</span>
            </div>
          </div>
        </Teleport>
      </div>

      <!-- /poll, /remind, /task composers (teleported modals) -->
      <CommsPollComposer v-if="pollComposerOpen && channels.currentChannelId" :channel-id="channels.currentChannelId" @create="onPollCreate" @close="pollComposerOpen = false" />
      <CommsReminderComposer v-if="reminderComposerOpen && channels.currentChannelId" :channel-id="channels.currentChannelId" :reminder="editingReminder" @create="onReminderCreate" @close="reminderComposerOpen = false; editingReminder = null" />
      <CommsTaskComposer v-if="taskComposerFor" :message="taskComposerFor" @create="onTaskCreate" @close="taskComposerFor = null" />

      <!-- Hover profile card (shared with the full Comms stream) -->
      <CommsProfilePopover
        :user-id="hover.userId.value"
        :card-style="hover.style.value"
        @start-dm="startDm"
        @hover="hover.cancelClose"
        @leave="hover.scheduleClose"
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* Unseen "breathing" highlight — matches the full Comms stream, trimmed for the dock. */
@keyframes dock-breathe {
  0%, 100% { background-color: color-mix(in oklab, var(--accent) 4%, transparent); }
  50% { background-color: color-mix(in oklab, var(--accent) 14%, transparent); }
}
.dock-unseen {
  animation: dock-breathe 2.2s ease-in-out infinite;
}
.dock-unseen::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2.5px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
  opacity: 0.7;
}
@media (prefers-reduced-motion: reduce) {
  .dock-unseen { animation: none; background-color: color-mix(in oklab, var(--accent) 10%, transparent); }
  .dock-unseen::before { opacity: 0.8; }
}

/* ── Hive launcher — breathing center, tile glow, bloom stagger, preview pill.
   drop-shadow (not box-shadow) so the glow follows the hexagon's clip-path. ── */
@keyframes hive-pulse {
  0%, 100% { filter: drop-shadow(0 0 0 transparent); transform: scale(1); }
  50% { filter: drop-shadow(0 0 7px color-mix(in oklab, var(--accent) 70%, transparent)); transform: scale(1.04); }
}
.hive-breathe { animation: hive-pulse 2.4s ease-in-out infinite; }
.dock-glow { filter: drop-shadow(0 0 5px color-mix(in oklab, var(--accent) 45%, transparent)); }
.bloom-enter-active, .bloom-leave-active { transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1.2), opacity 0.18s ease; }
.bloom-enter-from, .bloom-leave-to { opacity: 0; transform: translate(26px, 26px) scale(0.5); }
.bloom-move { transition: transform 0.22s ease; }
.bloom-pill { animation: pill-in 0.14s ease both; }
@keyframes pill-in { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) {
  .hive-breathe { animation: none; }
  .dock-glow { filter: none; }
  .bloom-enter-active, .bloom-leave-active, .bloom-move { transition: opacity 0.12s ease; }
  .bloom-enter-from, .bloom-leave-to { transform: none; opacity: 0; }
  .bloom-pill { animation: none; }
}
</style>
