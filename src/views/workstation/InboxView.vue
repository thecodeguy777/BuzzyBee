<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bell,
  AtSign,
  MessageCircle,
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  UserPlus,
  Inbox as InboxIcon
} from 'lucide-vue-next'
import { useNotifications, type Notification } from '@/composables/useNotifications'
import { useAuthStore } from '@/stores/auth'
import { useTasksStore } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'

const router = useRouter()
const auth = useAuthStore()
const tasks = useTasksStore()
const clients = useClientsStore()
const projects = useProjectsStore()

const { notifications, unreadCount, loading, hasMore, fetchPage, markRead, markAllRead } =
  useNotifications()

type FilterId = 'all' | 'unread' | 'mentions'
const activeFilter = ref<FilterId>('all')

const filtered = computed(() => {
  switch (activeFilter.value) {
    case 'unread':
      return notifications.value.filter((n) => !n.is_read)
    case 'mentions':
      return notifications.value.filter((n) => n.type === 'mention')
    default:
      return notifications.value
  }
})

const filterMeta = computed(() => [
  { id: 'all' as const, label: 'All', count: notifications.value.length },
  { id: 'unread' as const, label: 'Unread', count: unreadCount.value },
  {
    id: 'mentions' as const,
    label: 'Mentions',
    count: notifications.value.filter((n) => n.type === 'mention').length
  }
])

function typeIcon(t: Notification['type']) {
  switch (t) {
    case 'task_assigned':
    case 'project_added':
      return UserPlus
    case 'task_completed':
      return CheckCircle2
    case 'task_status_changed':
      return AlertCircle
    case 'comment':
      return MessageCircle
    case 'mention':
      return AtSign
    default:
      return Bell
  }
}
function typeColor(t: Notification['type']) {
  switch (t) {
    case 'task_assigned':
    case 'project_added':
      return 'text-info'
    case 'task_completed':
      return 'text-success'
    case 'task_status_changed':
      return 'text-warning'
    case 'comment':
      return 'text-info'
    case 'mention':
      return 'text-accent'
    default:
      return 'text-base-content/50'
  }
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

async function activate(n: Notification) {
  await markRead(n.id)
  if (n.source_type === 'task' && n.source_id) {
    const task = tasks.tasks.find((t) => t.id === n.source_id)
    if (task) {
      if (task.client_id !== clients.currentClientId) clients.setCurrentClient(task.client_id)
      if (task.project_id && task.project_id !== projects.currentProjectId) {
        projects.setCurrentProject(task.project_id)
      }
    }
    await router.push({ name: 'workstation-tasks' })
    if (n.source_id) tasks.selectTask(n.source_id)
  } else if (n.source_type === 'project' && n.source_id) {
    const project = projects.projects.find((p) => p.id === n.source_id)
    if (project) {
      if (project.client_id !== clients.currentClientId) clients.setCurrentClient(project.client_id)
      projects.setCurrentProject(project.id)
    }
    await router.push({ name: 'workstation-tasks' })
  } else if (n.link) {
    await router.push(n.link)
  }
}

async function loadMore() {
  if (!loading.value && hasMore.value && auth.user?.id) {
    await fetchPage(auth.user.id)
  }
}

async function onMarkAllRead() {
  if (auth.user?.id) await markAllRead(auth.user.id)
}
</script>

<template>
  <div class="space-y-4">
    <header class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="font-display text-xl font-semibold">Inbox</h1>
        <p class="text-xs text-base-content/60 mt-0.5">
          What's happening across your tasks and projects.
        </p>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-sm gap-2"
        :disabled="unreadCount === 0"
        @click="onMarkAllRead"
      >
        <CheckCheck class="w-4 h-4" :stroke-width="1.75" />
        Mark all read
      </button>
    </header>

    <nav
      class="flex items-center gap-1 border-b border-base-300 -mx-2 px-2"
      aria-label="Inbox filters"
    >
      <button
        v-for="f in filterMeta"
        :key="f.id"
        type="button"
        class="relative px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5"
        :class="
          activeFilter === f.id
            ? 'text-base-content'
            : 'text-base-content/60 hover:text-base-content'
        "
        @click="activeFilter = f.id"
      >
        {{ f.label }}
        <span
          v-if="f.count > 0"
          class="text-[0.65rem] tabular-nums px-1 py-0.5 rounded bg-base-200 text-base-content/70 font-mono"
        >
          {{ f.count }}
        </span>
        <span
          v-if="activeFilter === f.id"
          class="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-t"
        />
      </button>
    </nav>

    <div
      v-if="filtered.length === 0 && !loading"
      class="bg-base-100 rounded-xl border border-base-300 shadow-md px-6 py-12 text-center"
    >
      <InboxIcon class="w-8 h-8 mx-auto text-base-content/30" :stroke-width="1.5" />
      <p class="text-sm text-base-content/60 mt-3">
        <span v-if="activeFilter === 'all'">No notifications yet.</span>
        <span v-else-if="activeFilter === 'unread'">All caught up.</span>
        <span v-else>Nothing here.</span>
      </p>
    </div>

    <ul v-else class="bg-base-100 rounded-xl border border-base-300 shadow-md overflow-hidden divide-y divide-base-300/60">
      <li v-for="n in filtered" :key="n.id">
        <button
          type="button"
          class="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-left hover:bg-base-200/40 transition-colors"
          :class="!n.is_read && 'bg-primary/5'"
          @click="activate(n)"
        >
          <div
            class="w-6 h-6 rounded-full bg-base-200/60 flex items-center justify-center shrink-0"
            :class="typeColor(n.type)"
          >
            <component :is="typeIcon(n.type)" class="w-3.5 h-3.5" :stroke-width="1.75" />
          </div>
          <div class="flex-1 min-w-0 flex items-baseline gap-2">
            <span class="text-[13px] truncate shrink-0 max-w-[55%]" :class="!n.is_read ? 'font-semibold' : 'font-medium'">
              {{ n.title }}
            </span>
            <span v-if="n.source_ref" class="text-[0.65rem] font-mono text-base-content/50 shrink-0">
              {{ n.source_ref }}
            </span>
            <span v-if="n.preview" class="text-xs text-base-content/55 truncate min-w-0">
              {{ n.preview }}
            </span>
            <span class="text-[0.7rem] text-base-content/50 ml-auto shrink-0">
              {{ timeAgo(n.created_at) }}
            </span>
          </div>
          <span
            v-if="!n.is_read"
            class="w-2 h-2 rounded-full bg-primary shrink-0"
            aria-label="Unread"
          />
        </button>
      </li>
    </ul>

    <div class="flex justify-center">
      <button
        v-if="hasMore"
        type="button"
        class="btn btn-ghost btn-sm"
        :disabled="loading"
        @click="loadMore"
      >
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>
