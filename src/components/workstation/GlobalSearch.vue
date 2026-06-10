<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search, ListTodo, Hash, Loader, CornerDownLeft, MessageSquare, User, Briefcase
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useTasksStore } from '@/stores/tasks'
import { useClientsStore } from '@/stores/clients'
import { useChannelsStore } from '@/stores/channels'

const router = useRouter()
const tasksStore = useTasksStore()
const clients = useClientsStore()
const channels = useChannelsStore()

const query = ref('')
const open = ref(false)
const loading = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const focusedIndex = ref(0)

type RType = 'task' | 'message' | 'channel' | 'person' | 'client'
interface SearchRow {
  rtype: RType
  rid: string
  label: string
  sub: string
  score: number
  task_id: string | null
  message_id: string | null
  channel_id: string | null
  client_id: string | null
  user_id: string | null
  is_dm: boolean | null
}

const results = ref<SearchRow[]>([])
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// Monotonic token so a slow earlier request can't overwrite a newer one.
let searchToken = 0

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
  debounceTimer = setTimeout(() => runSearch(q), 220)
})

async function runSearch(q: string) {
  const token = ++searchToken
  loading.value = true
  focusedIndex.value = 0
  try {
    const { data, error } = await supabase.rpc('search_global', {
      q,
      p_client: clients.currentClientId,
      max_per: 6
    })
    if (token !== searchToken) return // a newer search superseded this one
    if (error) throw error
    results.value = (data ?? []) as SearchRow[]
    focusedIndex.value = 0
  } catch (e) {
    if (token === searchToken) {
      console.warn('[search] failed:', (e as Error).message)
      results.value = []
    }
  } finally {
    if (token === searchToken) loading.value = false
  }
}

const GROUPS: { type: RType; label: string }[] = [
  { type: 'message', label: 'Messages' },
  { type: 'task', label: 'Tasks' },
  { type: 'channel', label: 'Channels' },
  { type: 'person', label: 'People' },
  { type: 'client', label: 'Clients' }
]
const grouped = computed(() =>
  GROUPS.map((g) => ({ ...g, items: results.value.filter((r) => r.rtype === g.type) })).filter(
    (g) => g.items.length > 0
  )
)
const flatResults = computed(() => grouped.value.flatMap((g) => g.items))

async function activate(r: SearchRow) {
  open.value = false
  query.value = ''
  results.value = []
  if (r.rtype === 'task' && r.task_id) {
    if (r.client_id && r.client_id !== clients.currentClientId) clients.setCurrentClient(r.client_id)
    await router.push({ name: 'workstation-tasks' })
    tasksStore.selectTask(r.task_id)
  } else if (r.rtype === 'message' && r.channel_id) {
    if (r.client_id && r.client_id !== clients.currentClientId) clients.setCurrentClient(r.client_id)
    channels.select(r.channel_id)
    await router.push({ path: '/app/comms', query: r.message_id ? { m: r.message_id } : {} })
  } else if (r.rtype === 'channel' && r.channel_id) {
    if (r.client_id && r.client_id !== clients.currentClientId) clients.setCurrentClient(r.client_id)
    channels.select(r.channel_id)
    await router.push({ path: '/app/comms' })
  } else if (r.rtype === 'person' && r.user_id) {
    try {
      const id = await channels.openDm(r.user_id)
      if (id) {
        channels.select(id)
        await router.push({ path: '/app/comms' })
      }
    } catch {
      /* surfaced elsewhere */
    }
  } else if (r.rtype === 'client' && r.client_id) {
    clients.setCurrentClient(r.client_id)
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

const iconFor = (type: RType) =>
  type === 'message' ? MessageSquare
    : type === 'task' ? ListTodo
    : type === 'channel' ? Hash
    : type === 'person' ? User
    : Briefcase

// Single-occurrence highlight of the matched query in the label.
function parts(text: string) {
  const q = query.value.trim()
  if (!q) return [{ t: text, hit: false }]
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return [{ t: text, hit: false }]
  return [
    { t: text.slice(0, idx), hit: false },
    { t: text.slice(idx, idx + q.length), hit: true },
    { t: text.slice(idx + q.length), hit: false }
  ]
}
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
        role="combobox"
        aria-controls="global-search-list"
        :aria-expanded="open"
        :aria-activedescendant="open && flatResults.length ? `gs-opt-${focusedIndex}` : undefined"
        placeholder="Search messages, tasks, people…"
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
      id="global-search-list"
      class="absolute left-0 right-0 mt-1 rounded-lg border border-base-300 bg-base-100 shadow-xl overflow-hidden z-30 max-h-[60vh] overflow-y-auto"
      role="listbox"
    >
      <div v-if="loading" class="px-4 py-3 flex items-center gap-2 text-sm text-base-content/60">
        <Loader class="w-3.5 h-3.5 animate-spin" :stroke-width="1.75" />
        Searching…
      </div>
      <div v-else-if="query.trim().length < 2" class="px-4 py-3 text-xs text-base-content/50">
        Keep typing… (min 2 characters)
      </div>
      <div v-else-if="flatResults.length === 0" class="px-4 py-6 text-center text-sm text-base-content/60">
        No matches for <span class="font-medium">"{{ query }}"</span>
      </div>
      <div v-else>
        <section v-for="g in grouped" :key="g.type">
          <div class="px-3 pt-2 pb-1 text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold">
            {{ g.label }}
          </div>
          <ul>
            <li v-for="r in g.items" :key="r.rid">
              <button
                type="button"
                role="option"
                :id="`gs-opt-${flatResults.indexOf(r)}`"
                :aria-selected="flatResults.indexOf(r) === focusedIndex"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                  flatResults.indexOf(r) === focusedIndex ? 'bg-primary/5' : 'hover:bg-base-200/60'
                ]"
                @click="activate(r)"
                @mouseenter="focusedIndex = flatResults.indexOf(r)"
              >
                <component :is="iconFor(r.rtype)" class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">
                    <template v-for="(p, i) in parts(r.label)" :key="i"><span v-if="p.hit" class="bg-primary/20 text-primary rounded px-0.5">{{ p.t }}</span><template v-else>{{ p.t }}</template></template>
                  </div>
                  <div class="text-xs text-base-content/60 truncate flex items-center gap-1">
                    <Hash v-if="r.rtype === 'channel'" class="w-3 h-3" :stroke-width="1.75" />
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
