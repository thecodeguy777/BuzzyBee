<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'
import { Clock, LayoutList, MessageCircle, FileText, BookOpen, BarChart3, Search, Bell, Plus, Flag, Paperclip, MessageSquare, CalendarDays, ChevronDown, MousePointerClick } from 'lucide-vue-next'

// Sidebar navigation
const navItems = [
  { name: 'HiveTrack', icon: Clock, count: null, active: false },
  { name: 'HiveFlow', icon: LayoutList, count: 24, active: true },
  { name: 'HiveChat', icon: MessageCircle, count: 3, active: false },
  { name: 'HiveReport', icon: FileText, count: null, active: false },
  { name: 'HiveBook', icon: BookOpen, count: null, active: false },
  { name: 'HiveReview', icon: BarChart3, count: null, active: false },
]

// Realistic real-estate VA tasks per column
type Task = {
  ref: string
  title: string
  priority: 1 | 2 | 3 | 4
  dueLabel: string | null
  assignee: string
  assigneeColor: string
  attachments?: number
  comments?: number
}

const todoTasks: Task[] = [
  { ref: 'TASK-0142', title: 'Send updated CMA to Carter listing', priority: 1, dueLabel: 'Today', assignee: 'M', assigneeColor: 'from-blue-500 to-purple-500', comments: 2 },
  { ref: 'TASK-0143', title: 'Schedule photographer for 412 Oak Ave', priority: 2, dueLabel: 'Tue', assignee: 'A', assigneeColor: 'from-pink-500 to-purple-500' },
  { ref: 'TASK-0144', title: 'Mine database for past expired listings', priority: 3, dueLabel: null, assignee: 'M', assigneeColor: 'from-blue-500 to-purple-500', attachments: 1 },
]

const inProgressTasks: Task[] = [
  { ref: 'TASK-0138', title: 'Follow up on Smith offer, counter expected', priority: 1, dueLabel: 'Today', assignee: 'M', assigneeColor: 'from-blue-500 to-purple-500', comments: 5, attachments: 2 },
  { ref: 'TASK-0139', title: 'Prepare Just Listed campaign for 27 Birch Ln', priority: 2, dueLabel: 'Wed', assignee: 'A', assigneeColor: 'from-pink-500 to-purple-500', attachments: 4 },
  { ref: 'TASK-0140', title: 'Update FollowUpBoss tags for Q2 leads', priority: 3, dueLabel: 'Fri', assignee: 'M', assigneeColor: 'from-blue-500 to-purple-500' },
]

const blockedTasks: Task[] = [
  { ref: 'TASK-0135', title: 'Awaiting lender doc for Greene closing', priority: 1, dueLabel: 'Wed', assignee: 'M', assigneeColor: 'from-blue-500 to-purple-500', comments: 3 },
]

const doneTasks: Task[] = [
  { ref: 'TASK-0131', title: 'Sent Open House feedback emails (12)', priority: 3, dueLabel: 'Mon', assignee: 'A', assigneeColor: 'from-pink-500 to-purple-500' },
  { ref: 'TASK-0132', title: 'Updated MLS for 8 Chestnut Pl', priority: 2, dueLabel: 'Mon', assignee: 'M', assigneeColor: 'from-blue-500 to-purple-500' },
]

function priorityColor(p: number) {
  if (p === 1) return 'text-red-500'      // urgent
  if (p === 2) return 'text-orange-500'   // high
  if (p === 3) return 'text-blue-500'     // normal
  return 'text-base-content/30'
}

const columns = ref([
  { key: 'todo', label: 'Todo', headerBg: 'bg-base-content/55', tasks: todoTasks },
  { key: 'in_progress', label: 'In progress', headerBg: 'bg-primary', tasks: inProgressTasks },
  { key: 'blocked', label: 'Blocked', headerBg: 'bg-red-500', tasks: blockedTasks },
  { key: 'done', label: 'Done', headerBg: 'bg-green-600', tasks: doneTasks },
])

// SortableJS — make the kanban actually interactive
const columnRefs = ref<Record<string, HTMLElement | null>>({})
let sortables: Sortable[] = []
const hasInteracted = ref(false)

function setColumnRef(key: string, el: any) {
  columnRefs.value[key] = (el as HTMLElement) ?? null
}

onMounted(() => {
  for (const col of columns.value) {
    const el = columnRefs.value[col.key]
    if (!el) continue
    const s = Sortable.create(el, {
      group: 'hivemind-platform-mock',
      animation: 200,
      ghostClass: 'opacity-30',
      chosenClass: 'ring-2',
      forceFallback: true,
      onStart: () => { hasInteracted.value = true },
      onEnd: (evt) => {
        // Move the task between in-memory column arrays so the count badges update
        const fromKey = (evt.from as HTMLElement).getAttribute('data-col')
        const toKey = (evt.to as HTMLElement).getAttribute('data-col')
        if (!fromKey || !toKey) return
        const fromCol = columns.value.find(c => c.key === fromKey)
        const toCol = columns.value.find(c => c.key === toKey)
        if (!fromCol || !toCol) return
        const [moved] = fromCol.tasks.splice(evt.oldIndex ?? 0, 1)
        if (moved) toCol.tasks.splice(evt.newIndex ?? 0, 0, moved)
      },
    })
    sortables.push(s)
  }
})

onBeforeUnmount(() => {
  sortables.forEach(s => s.destroy())
  sortables = []
})
</script>

<template>
  <div class="border border-base-300 rounded-xl overflow-hidden bg-base-100 shadow-2xl shadow-primary/10">
    <!-- Browser chrome -->
    <div class="flex items-center gap-2 px-4 py-2.5 bg-base-200 border-b border-base-300">
      <div class="flex gap-1.5">
        <div class="w-2.5 h-2.5 rounded-full bg-red-400"></div>
        <div class="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
        <div class="w-2.5 h-2.5 rounded-full bg-green-400"></div>
      </div>
      <div class="flex-1 mx-4">
        <div class="bg-base-100 border border-base-300 rounded px-3 py-1 text-[10px] text-base-content/40 text-center font-mono">
          app.hivemind.co/app/tasks
        </div>
      </div>
    </div>

    <!-- App body -->
    <div class="grid grid-cols-[180px_1fr] min-h-[480px]">
      <!-- Sidebar -->
      <div class="border-r border-base-300 bg-base-100 flex flex-col">
        <!-- Brand -->
        <div class="px-4 py-3 border-b border-base-300 flex items-center gap-2">
          <div class="w-6 h-6 rounded bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span class="text-xs font-semibold tracking-tight">BuzzyHive</span>
        </div>

        <!-- Workspace switcher -->
        <button class="mx-3 my-3 flex items-center justify-between gap-2 border border-base-300 rounded-md px-2.5 py-1.5 hover:bg-base-200 transition-colors">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-5 h-5 rounded bg-gradient-to-br from-blue-400 to-purple-400 shrink-0"></div>
            <span class="text-[11px] font-medium truncate">Carter Realty</span>
          </div>
          <ChevronDown class="w-3 h-3 text-base-content/40 shrink-0" />
        </button>

        <!-- Nav -->
        <nav class="px-2 space-y-0.5">
          <a
            v-for="item in navItems"
            :key="item.name"
            class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer transition-colors"
            :class="item.active
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-base-content/65 hover:bg-base-200'"
          >
            <div class="flex items-center gap-2">
              <component :is="item.icon" class="w-3.5 h-3.5" :class="item.active ? 'text-primary' : 'text-base-content/45'" />
              <span>{{ item.name }}</span>
            </div>
            <span
              v-if="item.count !== null"
              class="text-[9px] font-semibold rounded px-1.5 py-0.5"
              :class="item.active ? 'bg-primary/15 text-primary' : 'bg-base-200 text-base-content/55'"
            >{{ item.count }}</span>
          </a>
        </nav>

        <div class="mt-auto px-3 py-3 border-t border-base-300 flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px] font-semibold text-white">M</div>
          <div class="min-w-0">
            <div class="text-[10px] font-medium truncate">Mary R.</div>
            <div class="text-[9px] text-base-content/50">VA · Online</div>
          </div>
        </div>
      </div>

      <!-- Main area -->
      <div class="flex flex-col min-w-0">
        <!-- Top bar -->
        <div class="border-b border-base-300 px-5 py-3 flex items-center gap-3 bg-base-100">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-base-content/40">Tasks</div>
            <div class="text-sm font-semibold">All boards</div>
          </div>
          <div class="flex-1 max-w-xs ml-auto">
            <div class="flex items-center gap-2 border border-base-300 rounded-md px-2.5 py-1 bg-base-100">
              <Search class="w-3 h-3 text-base-content/40" />
              <span class="text-[10px] text-base-content/40">Search tasks…</span>
            </div>
          </div>
          <button class="border border-base-300 rounded-md px-2 py-1 text-base-content/50 hover:text-base-content transition-colors">
            <Bell class="w-3.5 h-3.5" />
          </button>
          <button class="bg-primary text-primary-content text-[11px] font-medium px-2.5 py-1 rounded-md flex items-center gap-1 hover:opacity-90 transition-opacity">
            <Plus class="w-3 h-3" />
            New task
          </button>
        </div>

        <!-- Stat cards row -->
        <div class="px-5 py-3 grid grid-cols-4 gap-3 border-b border-base-300 bg-base-200/30">
          <div class="border border-base-300 rounded-md bg-base-100 p-2.5">
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Open</div>
            <div class="text-base font-bold text-base-content mt-0.5">7</div>
          </div>
          <div class="border border-base-300 rounded-md bg-base-100 p-2.5">
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Due today</div>
            <div class="text-base font-bold text-red-500 mt-0.5">3</div>
          </div>
          <div class="border border-base-300 rounded-md bg-base-100 p-2.5">
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Done this week</div>
            <div class="text-base font-bold text-green-600 mt-0.5">18</div>
          </div>
          <div class="border border-base-300 rounded-md bg-base-100 p-2.5">
            <div class="text-[9px] uppercase tracking-wider text-base-content/40">Hours logged</div>
            <div class="text-base font-bold text-primary mt-0.5">32.4h</div>
          </div>
        </div>

        <!-- Kanban board -->
        <div class="flex-1 overflow-x-auto overflow-y-hidden p-4 relative">
          <!-- "Drag me" hint that fades when user interacts -->
          <div
            v-if="!hasInteracted"
            class="absolute top-2 right-4 z-10 inline-flex items-center gap-1.5 bg-gradient-to-r from-primary to-purple-600 text-white text-[10px] font-medium px-2.5 py-1 rounded-full shadow-md animate-pulse pointer-events-none"
          >
            <MousePointerClick class="w-3 h-3" />
            Try dragging a card
          </div>

          <div class="grid grid-cols-4 gap-3 min-w-[640px] h-full">
            <div v-for="col in columns" :key="col.key" class="flex flex-col min-w-0">
              <!-- Column header — count is live -->
              <div class="rounded-t-md px-3 py-1.5 flex items-center justify-between gap-2" :class="col.headerBg">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-white">{{ col.label }}</span>
                <span class="text-[9px] font-semibold bg-white/20 text-white px-1.5 py-0.5 rounded">{{ col.tasks.length }}</span>
              </div>

              <!-- Cards (Sortable target) -->
              <div
                :ref="(el) => setColumnRef(col.key, el)"
                :data-col="col.key"
                class="flex-1 bg-base-200/40 border border-t-0 border-base-300 rounded-b-md p-2 space-y-2 min-h-[120px]"
              >
                <div
                  v-for="task in col.tasks"
                  :key="task.ref"
                  class="bg-base-100 border border-base-300 rounded-md p-2.5 hover:border-primary/30 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
                >
                  <div class="flex items-start gap-1.5 mb-1.5">
                    <Flag class="w-3 h-3 shrink-0 mt-0.5" :class="priorityColor(task.priority)" :fill="task.priority <= 2 ? 'currentColor' : 'none'" />
                    <span class="text-[8.5px] font-mono text-base-content/40">{{ task.ref }}</span>
                  </div>
                  <p class="text-[11px] leading-snug text-base-content/85 mb-2">{{ task.title }}</p>
                  <div class="flex items-center gap-2 text-base-content/40">
                    <span
                      v-if="task.dueLabel"
                      class="flex items-center gap-0.5 text-[9px]"
                      :class="task.dueLabel === 'Today' ? 'text-red-500 font-semibold' : ''"
                    >
                      <CalendarDays class="w-2.5 h-2.5" />
                      {{ task.dueLabel }}
                    </span>
                    <span v-if="task.attachments" class="flex items-center gap-0.5 text-[9px]">
                      <Paperclip class="w-2.5 h-2.5" />
                      {{ task.attachments }}
                    </span>
                    <span v-if="task.comments" class="flex items-center gap-0.5 text-[9px]">
                      <MessageSquare class="w-2.5 h-2.5" />
                      {{ task.comments }}
                    </span>
                    <div class="ml-auto w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
                      :class="`bg-gradient-to-br ${task.assigneeColor}`"
                    >{{ task.assignee }}</div>
                  </div>
                </div>

                <!-- Add card hint -->
                <button class="w-full border border-dashed border-base-300 rounded-md py-1.5 text-[10px] text-base-content/40 hover:text-primary hover:border-primary/40 transition-colors flex items-center justify-center gap-1">
                  <Plus class="w-3 h-3" />
                  Add task
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
