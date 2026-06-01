<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, ChevronLeft, Activity } from 'lucide-vue-next'
import { useTasksStore, type Task, type TaskActivityEvent } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import HexAvatar from '@/components/shared/HexAvatar.vue'

// -----------------------------------------------------------------------------
// State / persistence
// -----------------------------------------------------------------------------
const COLLAPSE_KEY = 'buzzybee.workstation.activity-rail-collapsed'
const SCOPE_KEY = 'buzzybee.workstation.activity-rail-scope'

const collapsed = ref(
  typeof window === 'undefined' ? false : window.localStorage.getItem(COLLAPSE_KEY) === '1'
)
watch(collapsed, (v) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
  }
})

// scope override: 'auto' | 'workspace' | 'client'
type Scope = 'auto' | 'workspace' | 'client'
const scopeOverride = ref<Scope>(
  typeof window === 'undefined'
    ? 'auto'
    : (window.localStorage.getItem(SCOPE_KEY) as Scope) || 'auto'
)
watch(scopeOverride, (v) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(SCOPE_KEY, v)
})

// -----------------------------------------------------------------------------
// Smart default: client-scoped on Tasks pages, workspace on everything else.
// -----------------------------------------------------------------------------
const route = useRoute()
const router = useRouter()
const tasks = useTasksStore()
const clients = useClientsStore()
const projects = useProjectsStore()
const team = useTeamStore()
const auth = useAuthStore()

const autoScope = computed<'workspace' | 'client'>(() => {
  const name = String(route.name || '')
  if (name.startsWith('workstation-tasks')) return 'client'
  return 'workspace'
})
const effectiveScope = computed<'workspace' | 'client'>(() =>
  scopeOverride.value === 'auto' ? autoScope.value : scopeOverride.value
)
// The chip that gives a meaningfully different feed than Smart.
const oppositeScope = computed<'workspace' | 'client'>(() =>
  autoScope.value === 'client' ? 'workspace' : 'client'
)

// Guard against stale localStorage: if a user previously selected a chip
// that's now redundant with Smart on this route (e.g. picked 'client' on
// Tasks before this fix shipped), treat it as Smart.
watch(
  [scopeOverride, autoScope],
  ([s, a]) => {
    if (s !== 'auto' && s === a) {
      scopeOverride.value = 'auto'
    }
  },
  { immediate: true }
)

// -----------------------------------------------------------------------------
// Flatten task.activity_log into a feed.
// -----------------------------------------------------------------------------
interface FeedItem {
  task: Task
  ev: TaskActivityEvent
  ts: number
}

const feed = computed<FeedItem[]>(() => {
  const out: FeedItem[] = []
  const cid = clients.currentClientId
  for (const t of tasks.tasks) {
    if (effectiveScope.value === 'client' && cid && t.client_id !== cid) continue
    for (const ev of t.activity_log ?? []) {
      const ts = Date.parse(ev.timestamp)
      if (!Number.isFinite(ts)) continue
      out.push({ task: t, ev, ts })
    }
  }
  out.sort((a, b) => b.ts - a.ts)
  return out.slice(0, 50)
})

// Lazily fetch profiles for any user_ids we don't yet know.
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

// -----------------------------------------------------------------------------
// Rendering helpers
// -----------------------------------------------------------------------------
function actorName(uid: string | null) {
  if (!uid) return 'Someone'
  if (uid === auth.user?.id) return 'You'
  const p = team.profiles[uid]
  return p?.full_name || p?.email?.split('@')[0] || 'Someone'
}
function actorInitial(uid: string | null) {
  const n = actorName(uid)
  return (n.charAt(0) || '?').toUpperCase()
}
function clientName(t: Task) {
  return t.client_name || clients.clients.find((c) => c.id === t.client_id)?.name || ''
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

function describe(ev: TaskActivityEvent): string {
  switch (ev.kind) {
    case 'created':
      return 'created'
    case 'status':
      return ev.to === 'done' ? 'completed' : `moved to ${String(ev.to).replace('_', ' ')}`
    case 'priority':
      return `set priority to ${priorityLabel(ev.to)}`
    case 'due':
      return ev.to ? `set due to ${formatDate(String(ev.to))}` : 'cleared due date'
    case 'assignee':
      return ev.to ? `assigned ${ev.to_name || 'someone'}` : 'unassigned'
    case 'title':
      return 'renamed'
    case 'description':
      return 'edited description'
    case 'attachment_added':
      return `attached ${ev.name || 'a file'}`
    case 'attachment_removed':
      return `removed ${ev.name || 'a file'}`
    case 'custom_field':
      return `updated ${ev.key || 'a field'}`
    default:
      return 'updated'
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

async function openTask(it: FeedItem) {
  // Sync client + project, then route to Tasks and open the drawer.
  if (clients.currentClientId !== it.task.client_id) {
    clients.setCurrentClient(it.task.client_id)
  }
  if (it.task.project_id && projects.currentProjectId !== it.task.project_id) {
    projects.setCurrentProject(it.task.project_id)
  }
  if (route.name !== 'workstation-tasks') {
    await router.push({ name: 'workstation-tasks' })
  }
  tasks.selectTask(it.task.id)
}
</script>

<template>
  <aside
    :class="[
      'hidden xl:flex shrink-0 border-l border-base-300 bg-base-100 flex-col',
      'sticky top-0 h-screen overflow-hidden',
      'transition-[width] duration-200 ease-in-out',
      collapsed ? 'w-10' : 'w-80'
    ]"
  >
    <!-- Collapsed strip -->
    <button
      v-if="collapsed"
      type="button"
      class="h-full w-full flex flex-col items-center pt-3 gap-3 hover:bg-base-200 transition-colors"
      :aria-label="'Show activity'"
      @click="collapsed = false"
    >
      <ChevronLeft class="w-4 h-4 text-base-content/50" :stroke-width="1.75" />
      <Activity class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
      <span
        class="text-[0.65rem] uppercase tracking-wider text-base-content/40 font-semibold"
        style="writing-mode: vertical-rl; transform: rotate(180deg)"
      >
        Activity
      </span>
    </button>

    <!-- Expanded -->
    <template v-else>
      <header
        class="h-14 px-4 flex items-center justify-between border-b border-base-300 shrink-0"
      >
        <div class="flex items-center gap-2">
          <Activity class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
          <h3 class="text-sm font-semibold tracking-wide">Recent activity</h3>
        </div>
        <button
          type="button"
          class="w-7 h-7 rounded-md flex items-center justify-center hover:bg-base-200 text-base-content/60"
          aria-label="Collapse activity"
          @click="collapsed = true"
        >
          <ChevronRight class="w-4 h-4" :stroke-width="1.75" />
        </button>
      </header>

      <!--
        Scope chips. Only two are shown:
          1. Smart — follows the page's default (client on /app/tasks, workspace elsewhere)
          2. The OPPOSITE of what Smart resolves to — the only manual override
             that produces a different feed than Smart.
        TKT-0003 fix: the previous third chip duplicated whichever option
        Smart was already resolving to, so they produced identical output.
      -->
      <div class="px-3 py-2 border-b border-base-300 flex items-center gap-1 shrink-0 text-xs">
        <button
          type="button"
          class="px-2 py-1 rounded-md transition-colors flex items-center gap-1.5"
          :class="
            scopeOverride === 'auto'
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-base-content/60 hover:bg-base-200'
          "
          @click="scopeOverride = 'auto'"
        >
          Smart
          <span
            class="text-[0.6rem] uppercase tracking-wider"
            :class="scopeOverride === 'auto' ? 'text-primary/60' : 'text-base-content/35'"
          >
            · {{ autoScope === 'client' ? 'client' : 'workspace' }}
          </span>
        </button>
        <button
          type="button"
          class="px-2 py-1 rounded-md transition-colors"
          :class="
            scopeOverride === oppositeScope
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-base-content/60 hover:bg-base-200'
          "
          @click="scopeOverride = oppositeScope"
        >
          {{ oppositeScope === 'client' ? 'This client' : 'Workspace' }}
        </button>
      </div>

      <!-- Feed -->
      <div class="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          v-if="feed.length === 0"
          class="px-4 py-8 text-center text-xs text-base-content/50"
        >
          Nothing yet. As tasks move, comments land, and files get attached, you'll
          see them stream here.
        </div>
        <ul v-else class="py-1">
          <li
            v-for="it in feed"
            :key="`${it.task.id}-${it.ts}-${it.ev.kind}`"
            class="group px-3 py-2 hover:bg-base-200/60 cursor-pointer transition-colors border-b border-base-200/50 last:border-b-0"
            @click="openTask(it)"
          >
            <div class="flex items-start gap-2.5">
              <HexAvatar :label="actorInitial(it.ev.user_id)" :size="28" :font-size="11" />
              <div class="flex-1 min-w-0">
                <p class="text-xs text-base-content/80 leading-snug">
                  <span class="font-medium text-base-content">{{ actorName(it.ev.user_id) }}</span>
                  {{ ' ' }}{{ describe(it.ev) }}{{ ' ' }}
                  <span class="font-medium text-base-content">{{ it.task.title }}</span>
                  <template v-if="clientName(it.task)">
                    {{ ' in ' }}
                    <span class="text-base-content/70">{{ clientName(it.task) }}</span>
                  </template>
                </p>
                <p class="text-[0.65rem] text-base-content/50 mt-0.5">
                  {{ relTime(it.ts) }}
                </p>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </aside>
</template>
