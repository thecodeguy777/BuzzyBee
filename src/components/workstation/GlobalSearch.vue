<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  ListTodo,
  Users,
  Paperclip,
  Hash,
  Loader,
  CornerDownLeft
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useTasksStore } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'

const router = useRouter()
const tasksStore = useTasksStore()
const clients = useClientsStore()

const query = ref('')
const open = ref(false)
const loading = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const focusedIndex = ref(0)

interface ResultBase {
  id: string
  type: 'task' | 'attachment' | 'client'
  label: string
  sub: string
}
interface TaskResult extends ResultBase {
  type: 'task'
  taskId: string
  clientId: string | null
}
interface AttachmentResult extends ResultBase {
  type: 'attachment'
  taskId: string
  clientId: string | null
}
interface ClientResult extends ResultBase {
  type: 'client'
  clientId: string
}
type Result = TaskResult | AttachmentResult | ClientResult

const results = ref<Result[]>([])
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPad|iPhone|iPod/.test(navigator.platform || navigator.userAgent || '')
const shortcutKey = computed(() => (isMac ? '⌘K' : 'Ctrl+K'))

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const q = val.trim()
  if (q.length < 2) {
    results.value = []
    open.value = q.length > 0
    return
  }
  open.value = true
  debounceTimer = setTimeout(() => runSearch(q), 250)
})

async function runSearch(q: string) {
  loading.value = true
  focusedIndex.value = 0
  try {
    const pattern = `%${q.split(/\s+/).filter(Boolean).join('%')}%`

    // Tasks: title / description / reference_number
    const tasksReq = supabase
      .from('tasks')
      .select('id, title, description, reference_number, status, client_id, client_name, attachments')
      .or(
        [
          `title.ilike.${pattern}`,
          `description.ilike.${pattern}`,
          `reference_number.ilike.${pattern}`
        ].join(',')
      )
      .order('updated_at', { ascending: false })
      .limit(10)

    // Clients: name / notes
    const clientsReq = supabase
      .from('clients')
      .select('id, name, notes, status')
      .or([`name.ilike.${pattern}`, `notes.ilike.${pattern}`].join(','))
      .limit(5)

    const [tasksRes, clientsRes] = await Promise.all([tasksReq, clientsReq])

    const out: Result[] = []

    for (const c of clientsRes.data ?? []) {
      out.push({
        id: `c:${c.id}`,
        type: 'client',
        clientId: c.id,
        label: c.name,
        sub: c.status === 'active' ? 'Client' : `Client · ${c.status}`
      })
    }

    for (const t of tasksRes.data ?? []) {
      out.push({
        id: `t:${t.id}`,
        type: 'task',
        taskId: t.id,
        clientId: t.client_id,
        label: t.title,
        sub: `${t.reference_number} · ${t.client_name ?? 'No client'} · ${t.status.replace('_', ' ')}`
      })
    }

    // Attachment search: tasks whose attachments JSONB array contains a file
    // whose name matches the query. We over-fetch and filter client-side.
    const ql = q.toLowerCase()
    const attachReq = await supabase
      .from('tasks')
      .select('id, reference_number, client_name, client_id, attachments')
      .not('attachments', 'eq', '[]')
      .limit(50)

    for (const t of attachReq.data ?? []) {
      const atts = (t.attachments ?? []) as Array<{
        id?: string
        name?: string
        mime_type?: string
      }>
      for (const a of atts) {
        if (!a.name) continue
        if (a.name.toLowerCase().includes(ql)) {
          out.push({
            id: `a:${t.id}:${a.id ?? a.name}`,
            type: 'attachment',
            taskId: t.id,
            clientId: t.client_id,
            label: a.name,
            sub: `${t.reference_number} · ${t.client_name ?? 'No client'}`
          })
        }
      }
    }

    results.value = out.slice(0, 20)
    focusedIndex.value = 0
  } catch (e) {
    console.warn('[search] failed:', (e as Error).message)
    results.value = []
  } finally {
    loading.value = false
  }
}

const grouped = computed(() => {
  const g: { type: Result['type']; label: string; items: Result[] }[] = [
    { type: 'task', label: 'Tasks', items: [] },
    { type: 'attachment', label: 'Files', items: [] },
    { type: 'client', label: 'Clients', items: [] }
  ]
  for (const r of results.value) {
    g.find((x) => x.type === r.type)?.items.push(r)
  }
  return g.filter((x) => x.items.length > 0)
})

const flatResults = computed(() => grouped.value.flatMap((g) => g.items))

async function activate(r: Result) {
  open.value = false
  query.value = ''
  if (r.type === 'task' || r.type === 'attachment') {
    if (r.clientId && r.clientId !== clients.currentClientId) {
      clients.setCurrentClient(r.clientId)
    }
    await router.push({ name: 'workstation-tasks' })
    tasksStore.selectTask(r.taskId)
  } else if (r.type === 'client') {
    clients.setCurrentClient(r.clientId)
    await router.push({ name: 'workstation-tasks' })
  }
}

function focus() {
  inputEl.value?.focus()
}
function close() {
  open.value = false
}

function onKeyDown(e: KeyboardEvent) {
  // ⌘K / Ctrl+K to focus search anywhere in the app.
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    focus()
    inputEl.value?.select()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    inputEl.value?.blur()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusedIndex.value = Math.min(focusedIndex.value + 1, flatResults.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    focusedIndex.value = Math.max(focusedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    const r = flatResults.value[focusedIndex.value]
    if (r) {
      e.preventDefault()
      void activate(r)
    }
  }
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('click', onDocClick)
})

const iconFor = (type: Result['type']) =>
  type === 'task' ? ListTodo : type === 'attachment' ? Paperclip : Users
</script>

<template>
  <div ref="rootEl" class="relative w-full max-w-md">
    <label
      class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200/40 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/40 transition-colors"
    >
      <Search class="w-4 h-4 text-base-content/50" :stroke-width="1.75" />
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        placeholder="Search tasks, files, clients…"
        class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
        @focus="open = query.length > 0 || flatResults.length > 0"
      />
      <kbd
        class="text-[0.65rem] text-base-content/50 border border-base-300 rounded px-1 py-0.5 font-sans hidden sm:inline-flex"
      >
        {{ shortcutKey }}
      </kbd>
    </label>

    <div
      v-if="open"
      class="absolute left-0 right-0 mt-1 rounded-lg border border-base-300 bg-white shadow-xl overflow-hidden z-30 max-h-[60vh] overflow-y-auto"
      role="listbox"
    >
      <div v-if="loading" class="px-4 py-3 flex items-center gap-2 text-sm text-base-content/60">
        <Loader class="w-3.5 h-3.5 animate-spin" :stroke-width="1.75" />
        Searching…
      </div>
      <div
        v-else-if="query.trim().length < 2"
        class="px-4 py-3 text-xs text-base-content/50"
      >
        Keep typing… (min 2 characters)
      </div>
      <div
        v-else-if="flatResults.length === 0"
        class="px-4 py-6 text-center text-sm text-base-content/60"
      >
        No matches for <span class="font-medium">"{{ query }}"</span>
      </div>
      <div v-else>
        <section v-for="g in grouped" :key="g.type">
          <div class="px-3 pt-2 pb-1 text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold">
            {{ g.label }}
          </div>
          <ul>
            <li v-for="r in g.items" :key="r.id">
              <button
                type="button"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                  flatResults.indexOf(r) === focusedIndex
                    ? 'bg-primary/5'
                    : 'hover:bg-base-200/60'
                ]"
                @click="activate(r)"
                @mouseenter="focusedIndex = flatResults.indexOf(r)"
              >
                <component :is="iconFor(r.type)" class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">{{ r.label }}</div>
                  <div class="text-xs text-base-content/60 truncate flex items-center gap-1">
                    <Hash v-if="r.type === 'task'" class="w-3 h-3" :stroke-width="1.75" />
                    {{ r.sub }}
                  </div>
                </div>
                <CornerDownLeft
                  v-if="flatResults.indexOf(r) === focusedIndex"
                  class="w-3.5 h-3.5 text-base-content/40 shrink-0"
                  :stroke-width="1.75"
                />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
