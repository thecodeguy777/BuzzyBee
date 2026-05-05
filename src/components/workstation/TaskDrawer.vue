<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  X,
  Trash2,
  CalendarDays,
  Flag,
  CircleDashed,
  Loader2,
  CircleCheck,
  CircleAlert,
  CircleSlash,
  User,
  Hash,
  History,
  MessageSquare
} from 'lucide-vue-next'
import { useTasksStore, type TaskStatus, type TaskActivityEvent } from '@/stores/tasks'
import TaskAttachments from '@/components/workstation/TaskAttachments.vue'
import RichTextEditor from '@/components/workstation/RichTextEditor.vue'

const tasks = useTasksStore()

const open = computed(() => tasks.selectedTask !== null)
const t = computed(() => tasks.selectedTask)

const title = ref('')
const description = ref('')
const status = ref<TaskStatus>('todo')
const priority = ref<1 | 2 | 3 | 4>(3)
const dueOn = ref<string>('')

const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
let savedTimer: ReturnType<typeof setTimeout> | undefined
const confirmDelete = ref(false)
const showHistory = ref(false)

const statuses: {
  value: TaskStatus
  label: string
  icon: any
  badgeClass: string
  dotClass: string
}[] = [
  { value: 'todo', label: 'Todo', icon: CircleDashed, badgeClass: 'bg-base-200 text-base-content', dotClass: 'bg-base-content/40' },
  { value: 'in_progress', label: 'In progress', icon: Loader2, badgeClass: 'bg-info/15 text-info', dotClass: 'bg-info' },
  { value: 'blocked', label: 'Blocked', icon: CircleAlert, badgeClass: 'bg-error/15 text-error', dotClass: 'bg-error' },
  { value: 'done', label: 'Done', icon: CircleCheck, badgeClass: 'bg-success/15 text-success', dotClass: 'bg-success' },
  { value: 'cancelled', label: 'Cancelled', icon: CircleSlash, badgeClass: 'bg-base-200 text-base-content/60', dotClass: 'bg-base-content/30' }
]

const priorities: { value: 1 | 2 | 3 | 4; label: string; color: string }[] = [
  { value: 1, label: 'Urgent', color: 'text-error' },
  { value: 2, label: 'High', color: 'text-warning' },
  { value: 3, label: 'Normal', color: 'text-base-content/60' },
  { value: 4, label: 'Low', color: 'text-base-content/40' }
]

const currentStatus = computed(() => statuses.find((s) => s.value === status.value)!)
const currentPriority = computed(() => priorities.find((p) => p.value === priority.value)!)

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

// Sync local fields from t whenever the selected task changes (open/realtime).
// We re-sync on every t change; if the user is mid-edit on a field, the next
// blur still wins because saveX() runs against the latest local value.
watch(t, () => syncFromTask(), { immediate: true })

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
    // Roll back local fields to whatever the store has now.
    syncFromTask()
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
    if (confirmDelete.value) confirmDelete.value = false
    else close()
  }
}
onMounted(() => document.addEventListener('keydown', onEsc))
onUnmounted(() => document.removeEventListener('keydown', onEsc))

watch(open, (is) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = is ? 'hidden' : ''
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
        'fixed top-0 right-0 z-40 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col',
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
        <div class="flex-1 overflow-y-auto">
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
            <!-- status -->
            <div class="dropdown">
              <div
                tabindex="0"
                role="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors"
                :class="currentStatus.badgeClass"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="currentStatus.dotClass" />
                {{ currentStatus.label }}
              </div>
              <ul
                tabindex="0"
                class="dropdown-content z-10 mt-1 menu p-1 shadow-lg bg-white rounded-lg border border-base-300 w-44 text-sm"
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
                class="dropdown-content z-10 mt-1 menu p-1 shadow-lg bg-white rounded-lg border border-base-300 w-32 text-sm"
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

            <!-- assignee -->
            <div
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-base-content/70"
              :title="t?.assignee_name ?? 'Unassigned'"
            >
              <User class="w-3.5 h-3.5" :stroke-width="1.75" />
              <span class="truncate max-w-[10rem]">{{ t?.assignee_name ?? 'Unassigned' }}</span>
            </div>
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

          <!-- comments placeholder -->
          <div class="px-6 py-4 border-t border-base-300/60">
            <div class="text-xs font-medium text-base-content/60 uppercase tracking-wide flex items-center gap-1.5 mb-2">
              <MessageSquare class="w-3.5 h-3.5" :stroke-width="1.75" />
              Comments
            </div>
            <p class="text-xs text-base-content/40 italic">
              Threading + @mentions land in the next iteration.
            </p>
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
                :key="i"
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
