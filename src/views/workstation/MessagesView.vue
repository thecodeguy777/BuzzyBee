<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, inject } from 'vue'
import {
  Send, Paperclip, Plus, Search, X, Check, Users, LogOut, ArrowLeft, MessagesSquare, Loader2, Smile, Zap,
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import SeenCluster from '@/components/comms/SeenCluster.vue'
import CommsMessage from '@/components/comms/CommsMessage.vue'
import TypingIndicator from '@/components/comms/TypingIndicator.vue'
import MediaPicker from '@/components/comms/MediaPicker.vue'
import MentionPopover from '@/components/shared/MentionPopover.vue'
import { useMentionAutocomplete, type MentionCandidate } from '@/composables/useMentionAutocomplete'
import { COMMS_STREAM, HUDDLE_PRESENCE } from '@/composables/commsStream'
import { useBuzz, type BuzzResult } from '@/composables/useBuzz'
import { AVAILABILITY, availabilityOf } from '@/lib/availability'
import { useChannelsStore, type Channel } from '@/stores/channels'
import { useDraftsStore } from '@/stores/drafts'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { uploadCommsFile } from '@/lib/commsAttachments'
import { displayName } from '@/lib/format'
import { type Gif } from '@/lib/giphy'
import type { Attachment, CommsMessage as CommsMsg } from '@/composables/useChannelStream'

// Messages — DMs in their own surface. 1:1 and group threads on the left,
// the conversation on the right, riding the same shared stream (and therefore
// the same realtime pipeline, typing, receipts and huddle continuity) as Comms.

const injectedStream = inject(COMMS_STREAM)
if (!injectedStream) throw new Error('MessagesView must render inside WorkstationLayout — COMMS_STREAM was not provided.')
const stream = injectedStream
const huddlePresence = inject(HUDDLE_PRESENCE, null)

const channels = useChannelsStore()
const team = useTeamStore()
const auth = useAuthStore()
const drafts = useDraftsStore()

const currentId = computed(() => channels.currentChannelId)
const current = computed(() => channels.dms.find((d) => d.id === currentId.value) ?? null)
const error = ref<string | null>(null)

// ── Thread list ───────────────────────────────────────────────────────────────
const firstName = (n: string | null | undefined) => (n || 'Someone').split(' ')[0]
function threadName(c: Channel) {
  if (c.is_group && c.name) return c.name
  const members = (channels.dmMembers[c.id] ?? []).map((id) =>
    c.is_group ? firstName(team.profiles[id]?.full_name) : displayName(team.profiles[id], 'Member'),
  )
  return members.join(', ') || 'Direct message'
}
const threads = computed(() =>
  [...channels.dms].sort((a, b) =>
    (channels.lastMessageAt[b.id] ?? '').localeCompare(channels.lastMessageAt[a.id] ?? ''),
  ),
)
const partnerId = (c: Channel) => channels.dmMembers[c.id]?.[0] ?? null
const isOnline = (id: string | null) => !!id && (huddlePresence?.onlineUsers.value ?? []).includes(id)
// "Online · Away — back at 3pm" — presence answers "app open?", availability
// answers "expect a reply?"; show both when they disagree.
function presenceLine(id: string | null) {
  const base = isOnline(id) ? 'Online' : 'Offline'
  const p = id ? team.profiles[id] : null
  const a = availabilityOf(p?.availability)
  if (a === 'active') return base
  const note = p?.status_note ? ` — ${p.status_note}` : ''
  return `${base} · ${AVAILABILITY[a].label}${note}`
}

// Buzz — ring the 1:1 partner's screen; feedback flashes in the header subtitle.
const { buzz } = useBuzz()
const buzzNote = ref('')
const BUZZ_NOTES: Record<BuzzResult, string> = {
  sent: 'Buzzing their screen now',
  away: 'Away — they will see your note',
  cooldown: 'Buzzed just now — give it a minute',
  failed: 'Could not buzz right now',
}
let buzzNoteTimer: ReturnType<typeof setTimeout> | undefined
async function buzzPartner() {
  const to = current.value && !current.value.is_group ? partnerId(current.value) : null
  if (!to) return
  buzzNote.value = BUZZ_NOTES[await buzz(to)]
  clearTimeout(buzzNoteTimer)
  buzzNoteTimer = setTimeout(() => (buzzNote.value = ''), 4000)
}
function memberAvatars(c: Channel) {
  return (channels.dmMembers[c.id] ?? []).slice(0, 4).map((id) => ({
    id,
    name: team.profiles[id]?.full_name ?? 'Member',
    avatarUrl: team.profiles[id]?.avatar_url ?? null,
  }))
}
function previewFor(c: Channel) {
  const at = channels.lastMessageAt[c.id]
  if (!at) return ''
  const d = new Date(at)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function pick(id: string) {
  channels.select(id)
  threadParentId.value = null
  mobileList.value = false
  scrollToBottom()
}

// Default selection: most recent DM when arriving without one.
onMounted(() => {
  void channels.loadDms().then(() => {
    if (!current.value && threads.value.length) channels.select(threads.value[0].id)
  })
  stream.registerViewer()
  if (currentId.value && current.value) void channels.markRead(currentId.value)
  scrollToBottom()
})
onBeforeUnmount(() => stream.unregisterViewer())

// ── New message / group composer ─────────────────────────────────────────────
const composeOpen = ref(false)
const composeQuery = ref('')
const composeName = ref('')
const composeSelected = ref<string[]>([])
const composing = ref(false)
const candidates = computed(() => {
  const me = auth.user?.id
  const q = composeQuery.value.trim().toLowerCase()
  return Object.values(team.profiles)
    .filter((p) => p.id !== me)
    .filter((p) => !q || (p.full_name ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q))
    .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
})
function toggleCandidate(id: string) {
  composeSelected.value = composeSelected.value.includes(id)
    ? composeSelected.value.filter((x) => x !== id)
    : [...composeSelected.value, id]
}
async function startCompose() {
  if (!composeSelected.value.length || composing.value) return
  composing.value = true
  error.value = null
  try {
    const id =
      composeSelected.value.length === 1
        ? await channels.openDm(composeSelected.value[0])
        : await channels.createGroupDm(composeSelected.value, composeName.value)
    if (id) {
      composeOpen.value = false
      composeSelected.value = []
      composeName.value = ''
      composeQuery.value = ''
      pick(id)
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    composing.value = false
  }
}

async function leaveGroup() {
  if (!current.value?.is_group) return
  if (!window.confirm(`Leave "${threadName(current.value)}"? You'll lose access to this thread.`)) return
  try {
    await channels.leaveDm(current.value.id)
    if (threads.value.length) channels.select(threads.value[0].id)
  } catch (e) {
    error.value = (e as Error).message
  }
}

// Profile popover "Message" inside a DM → jump to that person's thread.
async function startDm(userId: string) {
  if (userId === auth.user?.id) return
  try {
    const id = await channels.openDm(userId)
    if (id) pick(id)
  } catch (e) {
    error.value = (e as Error).message
  }
}

// ── Conversation ──────────────────────────────────────────────────────────────
const listEl = ref<HTMLElement | null>(null)
function scrollToBottom() {
  void nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}
watch(() => stream.rootMessages.value.length, () => {
  scrollToBottom()
  const id = currentId.value
  if (id && current.value && document.visibilityState === 'visible') void channels.markRead(id)
})
watch(currentId, () => {
  scrollToBottom()
  // Picked mention ids belong to the previous thread — drop them so they can't
  // leak into a message sent in the newly opened conversation.
  mention.reset()
})

// Same-author grouping: hide the avatar/name header on quick follow-ups.
function isContinuation(i: number) {
  const m = stream.rootMessages.value[i]
  const prev = stream.rootMessages.value[i - 1]
  if (!prev || !m) return false
  if (m.is_pinned || m.is_decision || prev.is_pinned || prev.is_decision) return false
  if (prev.user_id !== m.user_id) return false
  return new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
}

// Unseen "breathing" highlight — same baseline logic as the Comms surface.
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
let breatheChannel: string | null = null
let breatheBaseline = 0
const breatheSeen = new Set<string>()
function isFresh(m: { user_id: string | null; created_at: string }) {
  return m.user_id !== auth.user?.id && new Date(m.created_at).getTime() > breatheBaseline
}
function primeBreathing() {
  const cid = currentId.value ?? ''
  const list = stream.rootMessages.value
  breatheChannel = cid
  for (const t of freshTimers.values()) window.clearTimeout(t)
  freshTimers.clear()
  freshIds.value = new Set()
  breatheSeen.clear()
  for (const m of list) breatheSeen.add(m.id)
  const entry = channels.entryReadAt[cid]
  const newest = list.length ? new Date(list[list.length - 1].created_at).getTime() : Date.now()
  breatheBaseline = entry ? new Date(entry).getTime() : newest
  if (entry) for (const m of list) if (isFresh(m)) markFresh(m.id)
}
watch(() => stream.rootMessages.value, (list) => {
  if ((currentId.value ?? '') !== breatheChannel) { primeBreathing(); return }
  for (const m of list) {
    if (breatheSeen.has(m.id)) continue
    breatheSeen.add(m.id)
    if (isFresh(m)) markFresh(m.id)
  }
})

const typingMembers = computed(() =>
  stream.typing.value.map((t) => ({ id: t.userId, name: t.name, avatarUrl: t.avatarUrl })),
)
const seenMembers = computed(() => {
  const last = stream.rootMessages.value.at(-1)
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

// ── Thread replies ───────────────────────────────────────────────────────────
const threadParentId = ref<string | null>(null)
const threadParent = computed(() =>
  threadParentId.value ? stream.rootMessages.value.find((m) => m.id === threadParentId.value) ?? null : null,
)
const threadReplies = computed(() =>
  threadParentId.value ? stream.repliesByParent.value[threadParentId.value] ?? [] : [],
)
// Thread replies get their own draft slot, keyed by the parent message.
const replyDraft = computed({
  get: () => (threadParentId.value ? drafts.get(`thread:${threadParentId.value}`) : ''),
  set: (v) => drafts.set(threadParentId.value ? `thread:${threadParentId.value}` : null, v),
})
async function sendReply() {
  const pid = threadParentId.value
  const body = replyDraft.value
  if (!body.trim() || !pid) return
  drafts.clear(`thread:${pid}`)
  try {
    await stream.send(body, { parentId: pid })
  } catch {
    drafts.set(`thread:${pid}`, body)
  }
}

// ── Composer ──────────────────────────────────────────────────────────────────
// Messenger-style draft: persisted per conversation, restored on switch/reload.
const draft = computed({
  get: () => drafts.get(currentId.value),
  set: (v) => drafts.set(currentId.value, v),
})

// @mention autocomplete — candidates are the other members of this DM thread.
const composerEl = ref<HTMLTextAreaElement | HTMLInputElement | null>(null)
function mentionPool(): MentionCandidate[] {
  const ids = channels.dmMembers[currentId.value ?? ''] ?? []
  return ids
    .filter((id) => id !== auth.user?.id)
    .map((id) => {
      const p = team.profiles[id]
      return { id, name: p?.full_name ?? 'Member', avatarUrl: p?.avatar_url ?? null }
    })
}
const mention = useMentionAutocomplete({ el: composerEl, text: draft, candidates: mentionPool })
const {
  open: mentionOpen,
  matches: mentionMatches,
  activeIndex: mentionActiveIndex,
  style: mentionStyle
} = mention

const sending = ref(false)
const pendingAtts = ref<Attachment[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const showPicker = ref(false)
function onInput() {
  if (draft.value.trim()) stream.sendTyping()
  mention.onInput()
  if (mention.open.value) {
    const missing = (channels.dmMembers[currentId.value ?? ''] ?? []).filter(
      (id) => !team.profiles[id]
    )
    if (missing.length) void team.fetchProfiles(missing)
  }
}
function onComposerKeydown(e: KeyboardEvent) {
  if (mention.onKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void send()
  }
}
function addEmoji(e: string) {
  draft.value += e
}
async function onPickGif(g: Gif) {
  showPicker.value = false
  try {
    await stream.send('', { attachments: [{ kind: 'image', name: 'GIF', url: g.url, mime: 'image/gif' }] })
    scrollToBottom()
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function onFiles(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  ;(e.target as HTMLInputElement).value = ''
  const cid = currentId.value
  if (!cid) return
  for (const f of files) {
    try {
      pendingAtts.value = [...pendingAtts.value, await uploadCommsFile(cid, f)]
    } catch (err) {
      error.value = (err as Error).message
    }
  }
}
function removeAtt(i: number) {
  pendingAtts.value = pendingAtts.value.filter((_, idx) => idx !== i)
}
async function send() {
  const cid = currentId.value
  const body = draft.value
  const atts = pendingAtts.value
  if (!body.trim() && !atts.length) return
  const mentions = mention.resolveMentions(body)
  drafts.clear(cid)
  pendingAtts.value = []
  sending.value = true
  try {
    await stream.send(body, { attachments: atts, mentions })
    mention.reset() // only after success — a failed send keeps picks for retry
    scrollToBottom()
  } catch {
    // Restore to the thread it was typed in — it may no longer be current.
    drafts.set(cid, body)
    pendingAtts.value = atts
  } finally {
    sending.value = false
  }
}

// Mobile: list ↔ thread toggle.
const mobileList = ref(true)

function replyCountFor(m: CommsMsg) {
  return (stream.repliesByParent.value[m.id] ?? []).length
}
function lastReplyAtFor(m: CommsMsg) {
  return (stream.repliesByParent.value[m.id] ?? []).at(-1)?.created_at ?? null
}
</script>

<template>
  <div class="h-full min-h-0 flex bg-base-100 text-base-content">
    <!-- ── Thread list ── -->
    <aside
      class="w-full md:w-72 shrink-0 flex-col border-r border-base-300 overflow-hidden"
      :class="mobileList ? 'flex' : 'hidden md:flex'"
    >
      <div class="flex items-center gap-2 px-4 py-3 border-b border-base-300">
        <MessagesSquare class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
        <h1 class="font-display text-base font-semibold flex-1">Messages</h1>
        <button
          type="button"
          class="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center hover:opacity-90"
          title="New message"
          @click="composeOpen = !composeOpen"
        >
          <Plus class="w-4 h-4" :stroke-width="2" />
        </button>
      </div>

      <!-- new message composer -->
      <div v-if="composeOpen" class="border-b border-base-300 p-3 space-y-2">
        <div class="flex items-center gap-2 rounded-lg bg-base-200 px-2.5 py-1.5">
          <Search class="w-3.5 h-3.5 text-base-content/40 shrink-0" :stroke-width="2" />
          <input v-model="composeQuery" placeholder="Search people…" class="flex-1 bg-transparent text-sm outline-none min-w-0" />
        </div>
        <div class="max-h-44 overflow-y-auto space-y-0.5">
          <button
            v-for="p in candidates"
            :key="p.id"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-base-200"
            @click="toggleCandidate(p.id)"
          >
            <HexAvatar :name="p.full_name ?? ''" :avatar-url="p.avatar_url" :color-key="p.id" :size="22" />
            <span class="flex-1 truncate">{{ p.full_name ?? p.email }}</span>
            <span
              class="w-4 h-4 rounded border flex items-center justify-center shrink-0"
              :class="composeSelected.includes(p.id) ? 'bg-primary border-primary text-white' : 'border-base-300'"
            >
              <Check v-if="composeSelected.includes(p.id)" class="w-3 h-3" :stroke-width="3" />
            </span>
          </button>
          <p v-if="!candidates.length" class="px-2 py-2 text-xs text-base-content/40">No people found.</p>
        </div>
        <input
          v-if="composeSelected.length > 1"
          v-model="composeName"
          placeholder="Group name (optional)"
          class="w-full rounded-lg bg-base-200 px-2.5 py-1.5 text-sm outline-none"
        />
        <button
          type="button"
          class="btn btn-primary btn-sm w-full"
          :disabled="!composeSelected.length || composing"
          @click="startCompose"
        >
          {{ composing ? 'Starting…' : composeSelected.length > 1 ? `Start group (${composeSelected.length})` : 'Start conversation' }}
        </button>
      </div>

      <!-- threads -->
      <div class="flex-1 overflow-y-auto py-1.5">
        <button
          v-for="c in threads"
          :key="c.id"
          type="button"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-base-200/60"
          :class="c.id === currentId ? 'bg-primary/10' : ''"
          @click="pick(c.id)"
        >
          <span v-if="!c.is_group" class="relative shrink-0">
            <HexAvatar
              :name="team.profiles[partnerId(c) ?? '']?.full_name ?? 'M'"
              :avatar-url="team.profiles[partnerId(c) ?? '']?.avatar_url"
              :color-key="partnerId(c) ?? c.id"
              :size="30"
            />
            <span class="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full ring-2 ring-base-100" :class="isOnline(partnerId(c)) ? 'bg-success' : 'bg-base-content/25'" />
          </span>
          <span v-else class="shrink-0">
            <SeenCluster :members="memberAvatars(c)" :size="16" :max="3" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm truncate" :class="channels.isUnread(c.id) ? 'font-semibold text-base-content' : 'font-medium text-base-content/80'">{{ threadName(c) }}</span>
            <span class="block text-[0.7rem] text-base-content/40 truncate">
              <!-- Messenger-style: an unsent draft beats the last-activity line. -->
              <template v-if="c.id !== currentId && drafts.has(c.id)">
                <span class="text-error/90 font-semibold">Draft:</span> {{ drafts.get(c.id) }}
              </template>
              <template v-else>
                <template v-if="c.is_group">{{ (channels.dmMembers[c.id] ?? []).length + 1 }} people · </template>{{ previewFor(c) || 'No messages yet' }}
              </template>
            </span>
          </span>
          <span v-if="channels.mentions[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-error text-white text-[0.65rem] font-bold flex items-center justify-center shrink-0">@{{ channels.mentions[c.id] }}</span>
          <span v-else-if="channels.unread[c.id]" class="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-primary-content text-[0.65rem] font-bold flex items-center justify-center shrink-0">{{ channels.unread[c.id] }}</span>
        </button>
        <p v-if="!threads.length" class="px-4 py-6 text-center text-xs text-base-content/40">
          No conversations yet — hit + to message a teammate.
        </p>
      </div>
    </aside>

    <!-- ── Conversation ── -->
    <section class="flex-1 min-w-0 flex-col relative" :class="mobileList ? 'hidden md:flex' : 'flex'">
      <template v-if="current">
        <header class="flex items-center gap-2.5 px-4 py-2.5 border-b border-base-300 shrink-0">
          <button type="button" class="md:hidden w-8 h-8 -ml-1 rounded-lg hover:bg-base-200 flex items-center justify-center" @click="mobileList = true">
            <ArrowLeft class="w-4 h-4" :stroke-width="2" />
          </button>
          <span v-if="!current.is_group" class="relative shrink-0">
            <HexAvatar
              :name="team.profiles[partnerId(current) ?? '']?.full_name ?? 'M'"
              :avatar-url="team.profiles[partnerId(current) ?? '']?.avatar_url"
              :color-key="partnerId(current) ?? current.id"
              :size="30"
            />
            <span class="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full ring-2 ring-base-100" :class="isOnline(partnerId(current)) ? 'bg-success' : 'bg-base-content/25'" />
          </span>
          <SeenCluster v-else :members="memberAvatars(current)" :size="16" :max="3" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold truncate">{{ threadName(current) }}</div>
            <div class="text-[0.7rem] text-base-content/40 flex items-center gap-1">
              <template v-if="current.is_group">
                <Users class="w-3 h-3" :stroke-width="2" /> {{ (channels.dmMembers[current.id] ?? []).length + 1 }} people
              </template>
              <template v-else>{{ buzzNote || presenceLine(partnerId(current)) }}</template>
            </div>
          </div>
          <button
            v-if="!current.is_group"
            type="button"
            class="w-8 h-8 rounded-lg grid place-items-center text-base-content/50 hover:bg-base-200 hover:text-warning"
            title="Buzz — ring their screen"
            @click="buzzPartner"
          >
            <Zap class="w-4 h-4" :stroke-width="2" />
          </button>
          <button
            v-if="current.is_group"
            type="button"
            class="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-semibold text-base-content/50 hover:bg-base-200 hover:text-error"
            title="Leave this group"
            @click="leaveGroup"
          >
            <LogOut class="w-3.5 h-3.5" :stroke-width="2" /> Leave
          </button>
        </header>

        <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto py-2">
          <div v-if="stream.loading.value" class="flex justify-center py-10">
            <Loader2 class="w-5 h-5 animate-spin text-base-content/30" />
          </div>
          <div v-else-if="!stream.rootMessages.value.length" class="px-6 py-12 text-center text-sm text-base-content/40">
            Say hello to {{ threadName(current) }} 🐝
          </div>
          <CommsMessage
            v-for="(m, i) in stream.rootMessages.value"
            :key="m.id"
            :message="m"
            :reactions="stream.reactionList(m.id)"
            :reply-count="replyCountFor(m)"
            :last-reply-at="lastReplyAtFor(m)"
            :continuation="isContinuation(i)"
            :unseen="freshIds.has(m.id)"
            :can-task="false"
            @react="(e) => stream.toggleReaction(m.id, e)"
            @open-thread="threadParentId = m.id"
            @toggle-pin="stream.togglePin(m)"
            @mark-decision="stream.markDecision(m)"
            @open-task="() => {}"
            @open-dm="startDm"
          />
          <div v-if="seenMembers.length" class="flex items-center justify-end gap-1.5 px-4 pt-1">
            <span class="text-[0.6rem] font-medium text-base-content/40">Seen</span>
            <SeenCluster :members="seenMembers" :size="16" :max="4" />
          </div>
        </div>

        <TypingIndicator :members="typingMembers" class="px-4 pt-1" />

        <div class="px-3 py-2.5 border-t border-base-300 shrink-0">
          <p v-if="error" class="text-xs text-error mb-1.5">{{ error }}</p>
          <div v-if="pendingAtts.length" class="flex flex-wrap gap-1.5 mb-1.5">
            <span v-for="(a, i) in pendingAtts" :key="a.id ?? i" class="inline-flex items-center gap-1.5 rounded-lg bg-base-200 px-2 py-1 text-xs">
              <Paperclip class="w-3 h-3 text-base-content/50" :stroke-width="2" />
              <span class="max-w-[10rem] truncate">{{ a.name }}</span>
              <button type="button" class="text-base-content/40 hover:text-error" @click="removeAtt(i)"><X class="w-3 h-3" :stroke-width="2.5" /></button>
            </span>
          </div>
          <div class="relative flex items-center gap-1 rounded-xl border border-base-300 bg-base-100 pl-1.5 pr-1.5 py-1">
            <button type="button" class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center text-base-content/50" title="Attach a file" @click="fileInput?.click()">
              <Paperclip class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button type="button" class="w-8 h-8 rounded-lg hover:bg-base-200 flex items-center justify-center" :class="showPicker ? 'bg-base-200 text-primary' : 'text-base-content/50'" title="Emoji & GIFs" @click="showPicker = !showPicker">
              <Smile class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <input ref="fileInput" type="file" multiple class="hidden" @change="onFiles" />
            <input
              ref="composerEl"
              v-model="draft"
              :placeholder="`Message ${threadName(current)}`"
              class="flex-1 bg-transparent text-sm outline-none min-w-0"
              @input="onInput"
              @keydown="onComposerKeydown"
            />
            <MentionPopover
              :open="mentionOpen"
              :matches="mentionMatches"
              :active-index="mentionActiveIndex"
              :style="mentionStyle"
              @pick="mention.pick"
            />
            <button type="button" class="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-40" :disabled="sending || (!draft.trim() && !pendingAtts.length)" @click="send">
              <Send class="w-3.5 h-3.5" :stroke-width="2" />
            </button>
            <div v-if="showPicker" class="absolute bottom-full right-0 mb-2 z-30">
              <MediaPicker @emoji="addEmoji" @gif="onPickGif" @close="showPicker = false" />
            </div>
          </div>
        </div>

        <!-- ── Thread panel (replies) ── -->
        <div v-if="threadParent" class="absolute inset-y-0 right-0 z-20 w-full sm:w-96 bg-base-100 border-l border-base-300 shadow-2xl flex flex-col">
          <header class="flex items-center gap-2 px-4 py-2.5 border-b border-base-300 shrink-0">
            <span class="text-sm font-semibold flex-1">Thread</span>
            <button type="button" class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/60" @click="threadParentId = null">
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </header>
          <div class="flex-1 min-h-0 overflow-y-auto py-2">
            <CommsMessage
              :message="threadParent"
              :reactions="stream.reactionList(threadParent.id)"
              :reply-count="0"
              :can-task="false"
              @react="(e) => stream.toggleReaction(threadParent!.id, e)"
              @open-thread="() => {}"
              @toggle-pin="stream.togglePin(threadParent!)"
              @mark-decision="stream.markDecision(threadParent!)"
              @open-task="() => {}"
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
              :can-task="false"
              @react="(e) => stream.toggleReaction(r.id, e)"
              @open-thread="() => {}"
              @toggle-pin="stream.togglePin(r)"
              @mark-decision="stream.markDecision(r)"
              @open-task="() => {}"
              @open-dm="startDm"
            />
          </div>
          <div class="px-3 py-2.5 border-t border-base-300 shrink-0">
            <div class="flex items-center gap-1.5 rounded-xl border border-base-300 bg-base-100 pl-3 pr-1.5 py-1">
              <input
                v-model="replyDraft"
                placeholder="Reply in thread…"
                class="flex-1 bg-transparent text-sm outline-none min-w-0"
                @keydown.enter.prevent="sendReply"
              />
              <button type="button" class="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-40" :disabled="!replyDraft.trim()" @click="sendReply">
                <Send class="w-3 h-3" :stroke-width="2" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="flex-1 grid place-items-center text-center px-6">
        <div>
          <MessagesSquare class="w-8 h-8 mx-auto text-base-content/20" :stroke-width="1.5" />
          <p class="text-sm text-base-content/50 mt-3">Pick a conversation, or hit <span class="font-semibold">+</span> to start one.</p>
        </div>
      </div>
    </section>
  </div>
</template>
