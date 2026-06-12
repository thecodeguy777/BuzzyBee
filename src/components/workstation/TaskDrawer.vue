<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  X,
  Trash2,
  CalendarDays,
  Flag,
  Hash,
  History,
  MessageSquare,
  Search,
  Check,
  UserPlus,
  Send,
  Handshake,
  ArrowUpRight
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useTasksStore, type TaskStatus, type TaskActivityEvent } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { statusClasses } from '@/lib/statusColors'
import { useTaskChat } from '@/composables/useTaskChat'
import { useTeamStore, type MemberProfile } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { useProjectMembersStore } from '@/stores/projectMembers'
import { useProjectsStore } from '@/stores/projects'
import { useClientsStore } from '@/stores/clients'
import { useDealLinksStore, type TaskDealLink } from '@/stores/dealLinks'
import { STAGES, LOST, type StageId } from '@/lib/crmData'
import TaskAttachments from '@/components/workstation/TaskAttachments.vue'
import RichTextEditor from '@/components/workstation/RichTextEditor.vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'

const tasks = useTasksStore()
const statusesStore = useStatusesStore()
const team = useTeamStore()
const auth = useAuthStore()
const members = useProjectMembersStore()
const projects = useProjectsStore()
const clients = useClientsStore()
const dealLinksStore = useDealLinksStore()
const router = useRouter()

const open = computed(() => tasks.selectedTask !== null)
const t = computed(() => tasks.selectedTask)

// ── CRM: deals this task is linked to (crm_deal_tasks, live) ────────────────
const dealLinks = computed(() => dealLinksStore.forTask(t.value?.id))
const STAGE_BY_ID = Object.fromEntries([...STAGES, LOST].map((s) => [s.id, s]))
function stageOf(id: StageId) {
  return STAGE_BY_ID[id] ?? STAGES[0]
}
// The deal lives in a CRM workspace (its client_id); switch to it so the CRM
// view loads the right pipeline, then deep-link the deal panel open.
async function goDeal(link: TaskDealLink) {
  if (link.clientId && link.clientId !== clients.currentClientId) {
    clients.setCurrentClient(link.clientId)
  }
  close()
  await router.push({ name: 'workstation-crm', query: { deal: link.dealId } })
}

// ── Per-task chat (task_comments + Realtime) ───────────────────────────────
const taskId = computed(() => t.value?.id ?? null)
const chat = useTaskChat(taskId)
const draft = ref('')
const bottomRef = ref<HTMLElement | null>(null)
const scrollBodyRef = ref<HTMLElement | null>(null)

// "Near the bottom" within ~120px — used so incoming messages don't yank you
// down while you're scrolled up reading earlier history.
function isNearBottom() {
  const el = scrollBodyRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

// The first message-load for a freshly-opened task should jump to the latest,
// regardless of scroll position.
const pendingInitialScroll = ref(true)
watch(taskId, () => {
  pendingInitialScroll.value = true
  // The composer draft belongs to the previous task's conversation — drop it
  // so it can't be sent into the newly opened task by accident.
  draft.value = ''
})

const typingLabel = computed(() => {
  const names = chat.typingUsers.value.map((x) => x.name.split(' ')[0] || 'Someone')
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return `${names.length} people are typing…`
})

function fmtCommentTime(iso: string) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}

function scrollChatToBottom() {
  nextTick(() => bottomRef.value?.scrollIntoView({ block: 'end' }))
}

async function onSendComment() {
  const text = draft.value
  if (!text.trim() || chat.sending.value) return
  draft.value = ''
  try {
    await chat.sendMessage(text)
    scrollChatToBottom()
  } catch {
    draft.value = text // restore so the user doesn't lose their message
  }
}

// Mark read as the conversation changes while the drawer is open. Auto-scroll
// only when already near the bottom, so incoming messages don't interrupt
// someone reading older history. (A message you *send* force-scrolls via
// onSendComment regardless.)
watch(
  () => chat.messages.value.length,
  (len) => {
    if (!open.value) return
    void chat.markRead()
    if (pendingInitialScroll.value && len > 0) {
      pendingInitialScroll.value = false
      scrollChatToBottom()
    } else if (isNearBottom()) {
      scrollChatToBottom()
    }
  },
)
watch(open, (is) => {
  if (is) {
    void chat.markRead()
    scrollChatToBottom()
  }
})

const title = ref('')
const description = ref('')
const status = ref<TaskStatus>('todo')
const priority = ref<1 | 2 | 3 | 4>(3)
const dueOn = ref<string>('')

const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
let savedTimer: ReturnType<typeof setTimeout> | undefined
const confirmDelete = ref(false)
const showHistory = ref(false)

// Per-project status columns for the open task, mapped to the badge/dropdown
// shape this component renders. Color classes come from the column's color
// token via statusClasses().
const statuses = computed(() =>
  statusesStore.forProject(t.value?.project_id).map((col) => {
    const c = statusClasses(col.color)
    return {
      value: col.key as TaskStatus,
      label: col.label,
      badgeClass: `${c.pillBg} ${c.pillFg}`,
      dotClass: c.dot
    }
  })
)

const priorities: { value: 1 | 2 | 3 | 4; label: string; color: string }[] = [
  { value: 1, label: 'Urgent', color: 'text-error' },
  { value: 2, label: 'High', color: 'text-warning' },
  { value: 3, label: 'Normal', color: 'text-base-content/60' },
  { value: 4, label: 'Low', color: 'text-base-content/40' }
]

// The currently-selected status column (may be undefined if the task's status
// key has no matching column, e.g. mid-migration); the template guards with ?.
const currentStatus = computed(() => {
  const def = statusesStore.get(t.value?.project_id, status.value)
  if (!def) return undefined
  const c = statusClasses(def.color)
  return {
    label: def.label,
    badgeClass: `${c.pillBg} ${c.pillFg}`,
    dotClass: c.dot
  }
})
const currentPriority = computed(() => priorities.find((p) => p.value === priority.value)!)

// Project selector — same-client projects the task can live in. Moving projects
// resets the status to the new project's default column (columns are per-project).
const projectOptions = computed(() => {
  const cid = t.value?.client_id
  if (!cid) return [] as { id: string; name: string }[]
  return (projects.projectsByClient[cid] ?? projects.projects.filter((p) => p.client_id === cid)) as {
    id: string
    name: string
  }[]
})
const currentProjectName = computed(
  () => projectOptions.value.find((p) => p.id === t.value?.project_id)?.name ?? 'Project',
)
async function pickProject(id: string) {
  if (!t.value || id === t.value.project_id) return
  statusesStore.forProject(id) // ensure the new project's columns are loaded
  const def = statusesStore.defaultKey(id) || 'todo'
  await patch({ project_id: id, status: def as TaskStatus })
}

function syncFromTask() {
  if (!t.value) return
  title.value = t.value.title
  description.value = t.value.description ?? ''
  status.value = t.value.status
  priority.value = t.value.priority
  dueOn.value = t.value.due_on ?? ''
  confirmDelete.value = false
  showHistory.value = false
  saveState.value = 'idle'
}

// Full sync when a different task opens. For same-task store updates (our own
// optimistic save, a realtime update from a teammate, or an error rollback),
// merge field-by-field: a field is only refreshed when its local value still
// matches the *previous* store value — if the user has diverged (mid-edit,
// unsaved), their input is kept instead of being clobbered.
watch(
  t,
  (nv, ov) => {
    if (!nv) return
    if (!ov || nv.id !== ov.id) {
      syncFromTask()
      return
    }
    if (title.value === ov.title) title.value = nv.title
    if (description.value === (ov.description ?? '')) description.value = nv.description ?? ''
    if (status.value === ov.status) status.value = nv.status
    if (priority.value === ov.priority) priority.value = nv.priority
    if (dueOn.value === (ov.due_on ?? '')) dueOn.value = nv.due_on ?? ''
  },
  { immediate: true }
)

function close() {
  tasks.selectTask(null)
}

async function patch(patchObj: Record<string, unknown>) {
  if (!t.value) return
  if (savedTimer) clearTimeout(savedTimer)
  saveState.value = 'saving'
  try {
    await tasks.updateTask(t.value.id, patchObj as any)
    saveState.value = 'saved'
    savedTimer = setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
    }, 1500)
  } catch (e) {
    console.warn('[task drawer] save failed:', (e as Error).message)
    saveState.value = 'idle'
    // The store rolls the task back on failure; the merge watch above picks
    // that up per-field without clobbering whatever else the user is typing.
  }
}

async function saveTitle() {
  if (!t.value) return
  const next = title.value.trim()
  if (!next) {
    title.value = t.value.title
    return
  }
  if (next === t.value.title) return
  await patch({ title: next })
}

async function saveDescription() {
  if (!t.value) return
  // Tiptap emits HTML. An empty editor still returns "<p></p>" — treat that
  // (and any all-whitespace HTML) as null so empty descriptions don't churn.
  const html = description.value || ''
  const stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  const next = stripped.length === 0 ? null : html
  if ((t.value.description ?? null) === next) return
  await patch({ description: next })
}

async function saveStatus(value: TaskStatus) {
  if (!t.value || t.value.status === value) {
    status.value = value
    return
  }
  status.value = value
  await patch({ status: value })
}

async function savePriority(value: 1 | 2 | 3 | 4) {
  if (!t.value || t.value.priority === value) {
    priority.value = value
    return
  }
  priority.value = value
  await patch({ priority: value })
}

async function saveDue() {
  if (!t.value) return
  const next = dueOn.value || null
  if ((t.value.due_on ?? null) === next) return
  await patch({ due_on: next })
}

async function destroy() {
  if (!t.value) return
  try {
    await tasks.deleteTask(t.value.id)
  } catch (e) {
    console.warn('[task drawer] delete failed:', (e as Error).message)
  }
}

// ── Assignee picker ─────────────────────────────────────────────────────────
// Single-assignee for now (tasks.assignee_id is a single uuid). Multi-assignee
// would need a task_assignees join-table migration; tracked as follow-up.
//
// Candidate pool: anyone with an active assignment on this task's client,
// plus the current user (so PMs can self-assign even if they have no
// assignments row). Sourced from team.assignments which is RLS-gated so we
// only see members we're allowed to.
const assigneeMenuOpen = ref(false)
const assigneeSearch = ref('')

function toggleAssigneeMenu() {
  assigneeMenuOpen.value = !assigneeMenuOpen.value
  if (assigneeMenuOpen.value) {
    assigneeSearch.value = ''
    // Lazy-fetch any missing profiles so the menu shows names not raw uuids.
    const missing = candidateIds.value.filter((id) => !team.profiles[id])
    if (missing.length) void team.fetchProfiles(missing)
  }
}

// Scope of who can be assigned depends on the viewer's role:
//   - PM/admin/superadmin: anyone with an active assignment on the client
//     (broad — they're managing the account)
//   - VA (handoff mode): only project members (narrow — handoff stays inside
//     the project's working group)
const candidateIds = computed<string[]>(() => {
  if (!t.value) return []
  const ids = new Set<string>()

  if (auth.role === 'va') {
    // Handoff: project members only.
    for (const m of members.currentMembers) {
      if (m.user_id) ids.add(m.user_id)
    }
  } else {
    // Manager: anyone on the client.
    for (const a of team.assignments) {
      if (a.client_id !== t.value.client_id) continue
      if (a.status !== 'active') continue
      if (a.va_id) ids.add(a.va_id)
      if (a.pm_id) ids.add(a.pm_id)
    }
  }

  // Current user is always a valid self-assign target.
  if (auth.user?.id) ids.add(auth.user.id)
  return [...ids]
})

const candidates = computed<MemberProfile[]>(() => {
  const list = candidateIds.value
    .map((id) => team.profiles[id])
    .filter((p): p is MemberProfile => Boolean(p))
    // Multi-assignee (Model C): hide people already on the task.
    .filter((p) => !assigneeIds.value.has(p.id))
  const q = assigneeSearch.value.trim().toLowerCase()
  const filtered = q
    ? list.filter((p) => {
        const hay = `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
    : list
  // Sort: VAs first, then by name.
  return filtered.sort((a, b) => {
    const aIsVa = a.role === 'va' ? 0 : 1
    const bIsVa = b.role === 'va' ? 0 : 1
    if (aIsVa !== bIsVa) return aIsVa - bIsVa
    const an = (a.full_name || a.email || '').toLowerCase()
    const bn = (b.full_name || b.email || '').toLowerCase()
    return an.localeCompare(bn)
  })
})

// ── Multi-assignee (Model C) operations ────────────────────────────────────
const taskAssignees = computed(() =>
  t.value ? tasks.getAssignees(t.value.id) : []
)
const assigneeIds = computed(() => new Set(taskAssignees.value.map((a) => a.user_id)))

// Lazy-fetch profiles for any assignee whose name we don't have yet.
watch(
  taskAssignees,
  (list) => {
    const missing = list
      .map((a) => a.user_id)
      .filter((id) => !team.profiles[id])
    if (missing.length) void team.fetchProfiles(missing)
  },
  { immediate: true }
)

async function addAssigneeFromPicker(profile: MemberProfile) {
  if (!t.value) return
  if (assigneeIds.value.has(profile.id)) {
    assigneeMenuOpen.value = false
    return
  }
  try {
    await tasks.addAssignee(t.value.id, profile.id)
  } catch (e) {
    console.warn('[task drawer] addAssignee:', (e as Error).message)
  }
  assigneeMenuOpen.value = false
}

async function removeAssigneeRow(userId: string) {
  if (!t.value) return
  try {
    await tasks.removeAssignee(t.value.id, userId)
  } catch (e) {
    console.warn('[task drawer] removeAssignee:', (e as Error).message)
  }
}

async function toggleAssigneeDone(userId: string, currentlyDone: boolean) {
  if (!t.value) return
  try {
    await tasks.setAssigneeCompleted(t.value.id, userId, !currentlyDone)
  } catch (e) {
    console.warn('[task drawer] toggleAssigneeDone:', (e as Error).message)
  }
}

function assigneeInitials(p: MemberProfile | null) {
  if (!p) return '?'
  const src = p.full_name || p.email || '?'
  return (
    src
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x.charAt(0).toUpperCase())
      .join('') || '?'
  )
}
const AVATAR_PALETTE = ['#C8741A', '#A8743F', '#7A8A5C', '#8A6B9A', '#B85450', '#5C8A5A', '#C4925E']
function assigneeColor(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

const assigneeWrap = ref<HTMLElement | null>(null)
function onAssigneeDocClick(e: MouseEvent) {
  if (!assigneeWrap.value) return
  if (!assigneeWrap.value.contains(e.target as Node)) assigneeMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', onAssigneeDocClick))
onUnmounted(() => document.removeEventListener('click', onAssigneeDocClick))

function blurActive() {
  if (typeof document === 'undefined') return
  const el = document.activeElement as HTMLElement | null
  el?.blur?.()
}

async function pickStatus(value: TaskStatus) {
  await saveStatus(value)
  blurActive()
}

async function pickPriority(value: 1 | 2 | 3 | 4) {
  await savePriority(value)
  blurActive()
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    // Innermost layer first: open popovers, then armed confirms, then the drawer.
    if (assigneeMenuOpen.value) assigneeMenuOpen.value = false
    else if (confirmDelete.value) confirmDelete.value = false
    else close()
  }
}
onMounted(() => document.addEventListener('keydown', onEsc))
onUnmounted(() => document.removeEventListener('keydown', onEsc))

watch(open, (is) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = is ? 'hidden' : ''
})
// If the drawer unmounts while open (route change), release the scroll lock —
// otherwise the whole app stays unscrollable.
onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})

function fmtTimestamp(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function dueLabel(due: string) {
  const d = new Date(due + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return ''
  const str = String(s)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function v(value: unknown): string {
  if (value === null || value === undefined || value === '') return '<em class="text-base-content/40">empty</em>'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `<span class="font-medium">${escapeHtml(value)}</span>`
}

function statusLabel(s: unknown) {
  const str = String(s ?? '').replace('_', ' ')
  return str ? str[0].toUpperCase() + str.slice(1) : ''
}
function priorityLabel(p: unknown) {
  return ({ 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Low' } as Record<string, string>)[String(p)] ?? String(p)
}
function dateLabel(d: unknown) {
  if (!d) return ''
  try {
    return new Date(String(d) + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return String(d)
  }
}

function describeActivity(h: TaskActivityEvent): string {
  switch (h.kind) {
    case 'created':
      return 'created the task'
    case 'status':
      return h.from
        ? `moved status from ${v(statusLabel(h.from))} to ${v(statusLabel(h.to))}`
        : `set status to ${v(statusLabel(h.to))}`
    case 'priority':
      return h.from
        ? `changed priority from ${v(priorityLabel(h.from))} to ${v(priorityLabel(h.to))}`
        : `set priority to ${v(priorityLabel(h.to))}`
    case 'due':
      if (!h.from && h.to) return `set due date to ${v(dateLabel(h.to))}`
      if (h.from && !h.to) return `cleared due date (was ${v(dateLabel(h.from))})`
      return `changed due date from ${v(dateLabel(h.from))} to ${v(dateLabel(h.to))}`
    case 'assignee':
      if (!h.from && h.to)
        return `assigned to ${v(h.to_name ?? h.to)}`
      if (h.from && !h.to)
        return `unassigned (was ${v(h.from_name ?? h.from)})`
      return `reassigned from ${v(h.from_name ?? h.from)} to ${v(h.to_name ?? h.to)}`
    case 'title':
      return `renamed to ${v(h.to)}`
    case 'description':
      return 'edited the description'
    case 'attachment_added':
      return `attached ${v(h.name)}`
    case 'attachment_removed':
      return `removed ${v(h.name)}`
    case 'custom_field':
      if (h.from === undefined || h.from === null)
        return `set ${v(h.key)} to ${v(JSON.stringify(h.to))}`
      if (h.to === undefined || h.to === null)
        return `cleared ${v(h.key)}`
      return `changed ${v(h.key)} from ${v(JSON.stringify(h.from))} to ${v(JSON.stringify(h.to))}`
    default:
      return `${escapeHtml((h as TaskActivityEvent).kind)} change`
  }
}

// Native date inputs hidden behind a label don't always open their picker on
// click (browser-dependent). Trigger explicitly via showPicker().
function openDuePicker(triggerEl: HTMLElement) {
  const input = triggerEl.parentElement?.querySelector(
    'input[type=date]'
  ) as HTMLInputElement | null
  if (!input) return
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
      return
    } catch {
      /* fall through */
    }
  }
  input.focus()
  input.click()
}
</script>

<template>
  <Teleport to="body">
    <div
      :class="[
        'fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200 ease-out',
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      ]"
      @click="close"
    />

    <aside
      :class="[
        'fixed top-0 right-0 z-40 h-full w-full max-w-xl bg-base-100 shadow-2xl flex flex-col',
        'transition-transform duration-300 ease-out will-change-transform',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      ]"
      role="dialog"
      :aria-hidden="!open"
      aria-modal="true"
    >
        <!-- header -->
        <header
          class="flex items-center justify-between gap-3 px-5 py-3 border-b border-base-300 shrink-0"
        >
          <div class="flex items-center gap-2 text-xs text-base-content/60">
            <Hash class="w-3.5 h-3.5" :stroke-width="1.75" />
            <span class="font-mono">{{ t?.reference_number }}</span>
            <span class="text-base-content/30">·</span>
            <span class="truncate max-w-[14rem]">{{ t?.client_name ?? '—' }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="saveState === 'saving'"
              class="text-[0.7rem] text-base-content/50 italic"
            >
              Saving…
            </span>
            <span
              v-else-if="saveState === 'saved'"
              class="text-[0.7rem] text-success font-medium"
            >
              Saved
            </span>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-circle"
              aria-label="Close"
              @click="close"
            >
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </div>
        </header>

        <!-- body -->
        <div ref="scrollBodyRef" class="flex-1 overflow-y-auto">
          <!-- title -->
          <div class="px-6 pt-6 pb-3">
            <input
              v-model="title"
              type="text"
              class="font-display text-lg font-semibold w-full bg-transparent outline-none px-2 py-1 -ml-2 rounded hover:bg-base-200/60 focus:bg-base-200/80 transition-colors"
              placeholder="Task title"
              @blur="saveTitle"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
          </div>

          <!-- meta row -->
          <div class="px-6 pb-2 flex flex-wrap items-center gap-2">
            <!-- project -->
            <div v-if="projectOptions.length" class="dropdown">
              <div
                tabindex="0"
                role="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-base-200 transition-colors text-base-content/70"
              >
                <Hash class="w-3 h-3" :stroke-width="2.25" />
                {{ currentProjectName }}
              </div>
              <ul
                tabindex="0"
                class="dropdown-content z-10 mt-1 menu p-1 shadow-lg bg-base-100 rounded-lg border border-base-300 w-48 text-sm max-h-64 overflow-y-auto flex-nowrap"
              >
                <li v-for="p in projectOptions" :key="p.id">
                  <a :class="p.id === t?.project_id && 'active'" @click="pickProject(p.id)">{{ p.name }}</a>
                </li>
              </ul>
            </div>

            <!-- status -->
            <div class="dropdown">
              <div
                tabindex="0"
                role="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors"
                :class="currentStatus?.badgeClass ?? 'bg-base-200 text-base-content/60'"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="currentStatus?.dotClass ?? 'bg-base-content/30'" />
                {{ currentStatus?.label ?? status }}
              </div>
              <ul
                tabindex="0"
                class="dropdown-content z-10 mt-1 menu p-1 shadow-lg bg-base-100 rounded-lg border border-base-300 w-44 text-sm"
              >
                <li v-for="s in statuses" :key="s.value">
                  <a
                    class="flex items-center gap-2"
                    :class="s.value === status && 'active'"
                    @click="pickStatus(s.value)"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" :class="s.dotClass" />
                    {{ s.label }}
                  </a>
                </li>
              </ul>
            </div>

            <!-- priority -->
            <div class="dropdown">
              <div
                tabindex="0"
                role="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors hover:bg-base-200"
                :class="currentPriority.color"
              >
                <Flag class="w-3 h-3" :stroke-width="2.25" />
                {{ currentPriority.label }}
              </div>
              <ul
                tabindex="0"
                class="dropdown-content z-10 mt-1 menu p-1 shadow-lg bg-base-100 rounded-lg border border-base-300 w-32 text-sm"
              >
                <li v-for="p in priorities" :key="p.value">
                  <a
                    :class="[p.color, p.value === priority && 'active']"
                    @click="pickPriority(p.value)"
                  >
                    <Flag class="w-3 h-3" :stroke-width="2.25" />
                    {{ p.label }}
                  </a>
                </li>
              </ul>
            </div>

            <!-- due -->
            <div class="relative inline-flex">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer hover:bg-base-200 transition-colors text-base-content/70"
                @click="openDuePicker($event.currentTarget as HTMLElement)"
              >
                <CalendarDays class="w-3.5 h-3.5" :stroke-width="1.75" />
                <span v-if="dueOn">{{ dueLabel(dueOn) }}</span>
                <span v-else class="text-base-content/40">No due date</span>
              </button>
              <input
                v-model="dueOn"
                type="date"
                tabindex="-1"
                class="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                @change="saveDue"
              />
            </div>

            <!--
              Multi-assignee (Model C): stacked avatar list + per-person done
              toggle. Click the avatar circle to mark your own piece done
              (or undo). The X removes someone (manager-only). The + opens
              the picker.
              Permissions:
                - PM/admin/superadmin: can add/remove anyone, can toggle
                  any assignee's done state.
                - VA: can toggle their OWN done state, can't add/remove.
                  RLS enforces this even if the UI is bypassed.
            -->
            <div ref="assigneeWrap" class="relative flex items-center gap-1 flex-wrap">
              <!-- Stacked avatars for current assignees -->
              <div class="flex items-center -space-x-1.5">
                <template v-for="a in taskAssignees" :key="a.user_id">
                  <button
                    type="button"
                    class="group/asg relative w-7 h-7 transition-transform hover:scale-110 hover:z-10"
                    :title="
                      (team.profiles[a.user_id]?.full_name || team.profiles[a.user_id]?.email?.split('@')[0] || 'Loading…')
                      + (a.completed_at ? ' · done' : ' · in progress')
                      + ' · click to toggle'
                    "
                    @click="toggleAssigneeDone(a.user_id, a.completed_at !== null)"
                  >
                    <HexAvatar
                      ring
                      :size="28"
                      :font-size="10"
                      :fill="assigneeColor(a.user_id)"
                      :avatar-url="team.profiles[a.user_id]?.avatar_url"
                      :label="assigneeInitials(team.profiles[a.user_id] ?? null)"
                    >
                      <template #badge>
                        <!-- done check badge -->
                        <span
                          v-if="a.completed_at"
                          class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success ring-2 ring-white flex items-center justify-center"
                        >
                          <Check class="w-2 h-2 text-white" :stroke-width="3" />
                        </span>

                        <!-- remove on hover (manager only) -->
                        <span
                          v-if="auth.role !== 'va' || auth.user?.id === a.user_id"
                          class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-error opacity-0 group-hover/asg:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                          :title="auth.user?.id === a.user_id ? 'Leave this task' : 'Remove from task'"
                          @click.stop="removeAssigneeRow(a.user_id)"
                        >
                          <X class="w-2 h-2 text-white" :stroke-width="3" />
                        </span>
                      </template>
                    </HexAvatar>
                  </button>
                </template>
              </div>

              <!-- Add (managers only — VAs can't expand the assignee list) -->
              <button
                v-if="auth.role !== 'va'"
                type="button"
                class="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                :title="taskAssignees.length === 0 ? 'Add assignee' : 'Add another assignee'"
                @click="toggleAssigneeMenu"
              >
                <UserPlus class="w-3.5 h-3.5" :stroke-width="2" />
              </button>

              <!-- Empty-state hint when no one is assigned -->
              <span
                v-if="taskAssignees.length === 0 && auth.role === 'va'"
                class="text-xs italic text-base-content/40 ml-1"
              >
                Unassigned
              </span>

              <Transition
                enter-active-class="transition-all duration-150 ease-out"
                enter-from-class="opacity-0 -translate-y-1"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition-all duration-100 ease-in"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0"
              >
                <div
                  v-if="assigneeMenuOpen"
                  class="absolute left-0 top-full mt-1 z-30 w-72 rounded-xl bg-base-100 border border-base-300 shadow-hc-2 overflow-hidden"
                >
                  <div class="p-2 border-b border-base-300/60">
                    <label class="flex items-center gap-2 px-2 py-1 rounded-md bg-base-200/50">
                      <Search class="w-3.5 h-3.5 text-base-content/50" :stroke-width="1.75" />
                      <input
                        v-model="assigneeSearch"
                        type="text"
                        placeholder="Search VAs and PMs"
                        class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
                      />
                    </label>
                  </div>

                  <ul class="max-h-64 overflow-y-auto py-1">
                    <li v-for="p in candidates" :key="p.id">
                      <button
                        type="button"
                        class="w-full text-left px-3 py-2 hover:bg-base-200/60 transition-colors flex items-center gap-2"
                        @click="addAssigneeFromPicker(p)"
                      >
                        <HexAvatar
                          :size="28"
                          :font-size="11"
                          :fill="assigneeColor(p.id)"
                          :avatar-url="p.avatar_url"
                          :label="assigneeInitials(p)"
                        />
                        <span class="flex-1 min-w-0">
                          <span class="block text-sm font-medium truncate">{{ p.full_name || p.email || '—' }}</span>
                          <span class="block text-[0.65rem] text-base-content/50 truncate">
                            <span class="uppercase tracking-wider">{{ p.role }}</span>
                            <span v-if="p.email && p.full_name"> · {{ p.email }}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                    <li
                      v-if="candidates.length === 0"
                      class="px-3 py-4 text-xs text-base-content/50 italic text-center"
                    >
                      {{
                        assigneeSearch
                          ? 'No matches'
                          : taskAssignees.length === 0
                            ? 'No teammates on this client yet'
                            : 'Everyone is already on this task'
                      }}
                    </li>
                  </ul>
                </div>
              </Transition>
            </div>
          </div>

          <!-- CRM: deal(s) this task is linked to -->
          <div v-if="dealLinks.length" class="px-6 pt-3 pb-1 space-y-1.5">
            <button
              v-for="l in dealLinks"
              :key="l.dealId"
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-base-300 bg-base-100 hover:border-primary/40 hover:bg-base-200/60 transition-colors text-left"
              :title="'Open ' + l.dealTitle + ' in the CRM'"
              @click="goDeal(l)"
            >
              <span
                class="w-7 h-7 rounded-md grid place-items-center shrink-0"
                :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"
              >
                <Handshake :size="14" />
              </span>
              <span class="flex-1 min-w-0">
                <span class="block text-sm font-medium truncate">{{ l.dealTitle }}</span>
                <span class="block text-[0.65rem] text-base-content/50 truncate">
                  {{ l.companyName || 'CRM deal' }}
                </span>
              </span>
              <span
                class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[0.65rem] font-semibold shrink-0"
                :style="{
                  background: `color-mix(in oklab, ${stageOf(l.stage).dot} 16%, transparent)`,
                  color: stageOf(l.stage).dot
                }"
              >
                <span class="w-1.5 h-1.5 rounded-full" :style="{ background: stageOf(l.stage).dot }" />
                {{ stageOf(l.stage).label }}
              </span>
              <ArrowUpRight class="w-3.5 h-3.5 text-base-content/40 shrink-0" :stroke-width="1.75" />
            </button>
          </div>

          <!-- description -->
          <div class="px-6 py-4 border-t border-base-300/60 mt-2">
            <div class="text-xs font-medium text-base-content/60 uppercase tracking-wide mb-2">
              Description
            </div>
            <RichTextEditor
              v-model="description"
              placeholder="What needs to happen? Bold, italic, lists, links — Google-Docs style."
              @blur="saveDescription"
            />
          </div>

          <!-- attachments -->
          <TaskAttachments :task="t" />

          <!-- conversation (task_comments, live over Realtime) -->
          <div class="px-6 py-4 border-t border-base-300/60">
            <div class="flex items-center gap-1.5 mb-3 text-xs font-medium text-base-content/60 uppercase tracking-wide">
              <MessageSquare class="w-3.5 h-3.5" :stroke-width="1.75" />
              Conversation
              <span v-if="chat.messages.value.length" class="text-base-content/40 normal-case">
                ({{ chat.messages.value.length }})
              </span>
              <span
                v-if="chat.viewers.value.length"
                class="ml-auto inline-flex items-center gap-1 normal-case tracking-normal text-[0.65rem] text-base-content/50"
                :title="chat.viewers.value.map((v) => v.name).join(', ') + ' viewing'"
              >
                <span class="relative flex h-1.5 w-1.5">
                  <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping"></span>
                  <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                </span>
                {{ chat.viewers.value.length }} viewing
              </span>
            </div>

            <!-- message list -->
            <div
              v-if="chat.loading.value"
              class="text-xs text-base-content/40 italic py-2"
            >
              Loading conversation…
            </div>
            <div
              v-else-if="!chat.messages.value.length"
              class="text-xs text-base-content/40 italic py-2"
            >
              No messages yet — start the conversation.
            </div>
            <ul v-else class="space-y-3">
              <li
                v-for="m in chat.messages.value"
                :key="m.id"
                class="flex gap-2.5"
              >
                <HexAvatar
                  :avatar-url="chat.authorProfile(m.user_id)?.avatar_url"
                  :name="m.user_name || chat.authorProfile(m.user_id)?.full_name"
                  :size="28"
                  :font-size="11"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-2">
                    <span class="text-xs font-medium truncate">
                      {{ m.user_name || chat.authorProfile(m.user_id)?.full_name || 'Someone' }}
                    </span>
                    <span class="text-[0.65rem] text-base-content/40 shrink-0">
                      {{ fmtCommentTime(m.created_at) }}
                    </span>
                  </div>
                  <div class="text-sm text-base-content/90 whitespace-pre-wrap break-words">
                    {{ m.message }}
                  </div>
                </div>
              </li>
            </ul>
            <div ref="bottomRef" />

            <!-- typing indicator -->
            <div
              v-if="typingLabel"
              class="text-[0.7rem] text-base-content/50 italic mt-2 h-4"
            >
              {{ typingLabel }}
            </div>

            <!-- composer -->
            <form class="mt-3 flex items-end gap-2" @submit.prevent="onSendComment">
              <textarea
                v-model="draft"
                rows="1"
                placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
                class="textarea textarea-bordered textarea-sm flex-1 resize-none leading-relaxed min-h-0 py-1.5"
                @input="chat.notifyTyping()"
                @keydown.enter.exact.prevent="onSendComment"
              />
              <button
                type="submit"
                class="btn btn-primary btn-sm btn-circle shrink-0"
                :disabled="!draft.trim() || chat.sending.value"
                title="Send"
                aria-label="Send message"
              >
                <Send class="w-4 h-4" :stroke-width="2" />
              </button>
            </form>
          </div>

          <!-- activity log -->
          <div v-if="t?.activity_log?.length" class="px-6 py-4 border-t border-base-300/60">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium text-base-content/60 uppercase tracking-wide hover:text-base-content"
              @click="showHistory = !showHistory"
            >
              <History class="w-3.5 h-3.5" :stroke-width="1.75" />
              Activity
              <span class="text-base-content/40 normal-case">({{ t.activity_log.length }})</span>
            </button>
            <ul v-if="showHistory" class="mt-3 space-y-1 text-xs">
              <li
                v-for="(h, i) in [...t.activity_log].reverse()"
                :key="t.activity_log.length - 1 - i"
                class="flex items-start gap-3 py-0.5"
              >
                <span class="text-base-content/40 tabular-nums shrink-0 w-28 truncate">
                  {{ fmtTimestamp(h.timestamp) }}
                </span>
                <span class="flex-1 min-w-0 text-base-content/80" v-html="describeActivity(h)" />
              </li>
            </ul>
          </div>
        </div>

        <!-- footer (delete only — all field edits autosave) -->
        <footer
          class="flex items-center justify-end gap-2 px-5 py-2.5 border-t border-base-300 bg-base-200/40 shrink-0"
        >
          <button
            v-if="!confirmDelete"
            type="button"
            class="btn btn-ghost btn-sm gap-2 text-error hover:bg-error/10"
            @click="confirmDelete = true"
          >
            <Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" />
            Delete task
          </button>
          <template v-else>
            <span class="text-xs text-base-content/70">Delete this task?</span>
            <button
              type="button"
              class="btn btn-error btn-xs"
              @click="destroy"
            >
              Yes, delete
            </button>
            <button type="button" class="btn btn-ghost btn-xs" @click="confirmDelete = false">
              Cancel
            </button>
          </template>
        </footer>
      </aside>
  </Teleport>
</template>
