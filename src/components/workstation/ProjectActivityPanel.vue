<script setup lang="ts">
import { computed, watch } from 'vue'
import {
  Activity as ActivityIcon,
  CircleDashed,
  Pause,
  Archive,
  Sparkles,
  CheckCircle2
} from 'lucide-vue-next'
import { useTasksStore, type Task, type TaskActivityEvent } from '@/stores/tasks'
import { useProjectsStore } from '@/stores/projects'
import { useStatusesStore } from '@/stores/statuses'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import HexAvatar from '@/components/shared/HexAvatar.vue'

const tasks = useTasksStore()
const projects = useProjectsStore()
const statusesStore = useStatusesStore()
const team = useTeamStore()
const auth = useAuthStore()

// ─── Project status pill metadata ───────────────────────────────────────────
const statusMeta: Record<
  'active' | 'paused' | 'archived',
  { label: string; icon: any; bg: string; fg: string }
> = {
  active: { label: 'Active',   icon: CircleDashed, bg: 'bg-success/10', fg: 'text-success' },
  paused: { label: 'Paused',   icon: Pause,        bg: 'bg-warning/10', fg: 'text-warning' },
  archived: { label: 'Archived', icon: Archive,    bg: 'bg-base-200',   fg: 'text-base-content/60' }
}

// ─── Activity feed scoped to the current project ────────────────────────────
interface FeedItem {
  task: Task
  ev: TaskActivityEvent
  ts: number
}

const feed = computed<FeedItem[]>(() => {
  const pid = projects.currentProjectId
  if (!pid) return []
  const out: FeedItem[] = []
  for (const t of tasks.tasks) {
    if (t.project_id !== pid) continue
    for (const ev of t.activity_log ?? []) {
      const ts = Date.parse(ev.timestamp)
      if (!Number.isFinite(ts)) continue
      out.push({ task: t, ev, ts })
    }
  }
  out.sort((a, b) => b.ts - a.ts)
  return out.slice(0, 30)
})

// Lazy-fetch missing actor profiles so names render
watch(
  feed,
  (items) => {
    const missing = new Set<string>()
    for (const it of items) {
      const uid = it.ev.user_id
      if (uid && !team.profiles[uid]) missing.add(uid)
    }
    if (missing.size) void team.fetchProfiles([...missing])
  },
  { immediate: true }
)

// ─── Helpers ────────────────────────────────────────────────────────────────
function actorName(uid: string | null) {
  if (!uid) return 'Someone'
  if (uid === auth.user?.id) return 'You'
  const p = team.profiles[uid]
  return p?.full_name || p?.email?.split('@')[0] || 'Someone'
}
function actorInitial(uid: string | null) {
  return (actorName(uid).charAt(0) || '?').toUpperCase()
}
function describe(ev: TaskActivityEvent): string {
  switch (ev.kind) {
    case 'created': return 'created'
    case 'status':
      return statusesStore.isDone(projects.currentProjectId, ev.to as string)
        ? 'completed'
        : `moved to ${String(ev.to).replace('_', ' ')}`
    case 'priority': return `set priority to ${priorityLabel(ev.to)}`
    case 'due':
      return ev.to ? `set due to ${formatDate(String(ev.to))}` : 'cleared due date'
    case 'assignee':
      return ev.to ? `assigned ${ev.to_name || 'someone'}` : 'unassigned'
    case 'title': return 'renamed'
    case 'description': return 'edited description'
    case 'attachment_added': return `attached ${ev.name || 'a file'}`
    case 'attachment_removed': return `removed ${ev.name || 'a file'}`
    case 'custom_field': return `updated ${ev.key || 'a field'}`
    default: return 'updated'
  }
}
function priorityLabel(p: unknown) {
  const n = Number(p)
  return n === 1 ? 'urgent' : n === 2 ? 'high' : n === 3 ? 'normal' : 'low'
}
function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function relTime(ts: number) {
  const diff = Date.now() - ts
  const s = Math.max(0, Math.round(diff / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// HiveMindAI brief — same rule-based recipe as PMHome but project-scoped
const projectTasks = computed(() =>
  tasks.tasks.filter((t) => t.project_id === projects.currentProjectId)
)
const overdueCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return projectTasks.value.filter(
    (t) =>
      t.due_on &&
      statusesStore.isOpen(t.project_id, t.status) &&
      new Date(t.due_on + 'T00:00:00').getTime() < today.getTime()
  ).length
})
const inFlightCount = computed(
  () => projectTasks.value.filter((t) => statusesStore.isOpen(t.project_id, t.status)).length
)
const briefHeadline = computed(() => {
  if (overdueCount.value > 0) {
    return `${overdueCount.value} task${overdueCount.value === 1 ? ' is' : 's are'} overdue`
  }
  if (inFlightCount.value > 0) {
    return `${inFlightCount.value} in flight, on track`
  }
  if (projectTasks.value.length === 0) return 'No tasks yet'
  return 'All clear — nothing overdue'
})
</script>

<template>
  <aside
    class="rounded-2xl border border-base-300 bg-white shadow-hc-1 flex flex-col self-start sticky top-6"
    style="max-height: calc(100vh - 7rem)"
  >
    <!-- Status block -->
    <div class="px-4 py-4 border-b border-base-300/60 shrink-0">
      <div class="text-[0.65rem] uppercase tracking-[0.08em] font-semibold text-base-content/50">
        Project status
      </div>
      <div
        v-if="projects.currentProject"
        class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
        :class="[
          statusMeta[projects.currentProject.status].bg,
          statusMeta[projects.currentProject.status].fg
        ]"
      >
        <component
          :is="statusMeta[projects.currentProject.status].icon"
          class="w-3 h-3"
          :stroke-width="1.75"
        />
        {{ statusMeta[projects.currentProject.status].label }}
      </div>
    </div>

    <!-- HiveMindAI mini brief -->
    <div
      class="px-4 py-3 border-b border-base-300/60 shrink-0"
      style="background: var(--hc-accent-bg)"
    >
      <div class="flex items-center gap-1.5 mb-1">
        <Sparkles class="w-3 h-3" :stroke-width="1.5" style="color: var(--hc-accent)" />
        <span
          class="text-[0.6rem] uppercase tracking-[0.08em] font-semibold"
          style="color: var(--hc-accent)"
        >
          HiveMindAI brief
        </span>
      </div>
      <p class="text-xs leading-snug text-base-content/85">
        {{ briefHeadline }}.
      </p>
    </div>

    <!-- Activity feed -->
    <div class="px-4 pt-3 pb-1 shrink-0">
      <div class="flex items-center gap-1.5">
        <ActivityIcon class="w-3.5 h-3.5 text-base-content/60" :stroke-width="1.75" />
        <h3 class="text-[0.65rem] uppercase tracking-[0.08em] font-semibold text-base-content/55">
          Recent activity
        </h3>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 pb-4">
      <div
        v-if="feed.length === 0"
        class="text-xs text-base-content/50 italic px-1 py-6 text-center"
      >
        <CheckCircle2 class="w-5 h-5 mx-auto text-success/60" :stroke-width="1.5" />
        <p class="mt-2">Nothing happening yet.</p>
        <p class="mt-0.5 text-base-content/40 not-italic">Add a task to get started.</p>
      </div>
      <ul v-else class="space-y-2.5 mt-1">
        <li
          v-for="it in feed"
          :key="`${it.task.id}-${it.ts}-${it.ev.kind}`"
          class="flex items-start gap-2"
        >
          <HexAvatar
            :label="actorInitial(it.ev.user_id)"
            :size="24"
            :font-size="10"
            class="shrink-0"
          />
          <div class="flex-1 min-w-0">
            <p class="text-[0.7rem] text-base-content/80 leading-snug">
              <span class="font-medium text-base-content">{{ actorName(it.ev.user_id) }}</span>
              {{ ' ' }}{{ describe(it.ev) }}{{ ' ' }}
              <span class="font-medium text-base-content">{{ it.task.title }}</span>
            </p>
            <p class="text-[0.6rem] text-base-content/45 mt-0.5">{{ relTime(it.ts) }}</p>
          </div>
        </li>
      </ul>
    </div>
  </aside>
</template>
