<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  UsersRound,
  Search,
  Clock,
  ListTodo,
  Mail,
  Filter
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useTeamStore, type MemberProfile } from '@/stores/team'
import VADetail from '@/components/workstation/VADetail.vue'

const props = defineProps<{ vaId?: string }>()

const auth = useAuthStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const team = useTeamStore()
const router = useRouter()

// Hours-this-week per VA (for the master list).
const hoursByVa = ref<Record<string, number>>({})
const hoursLoading = ref(false)

async function loadHoursThisWeek() {
  hoursLoading.value = true
  try {
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - monday.getDay())
    const { data, error } = await supabase
      .from('time_entries')
      .select('va_id, started_at, ended_at')
      .gte('started_at', monday.toISOString())
    if (error) throw error
    const map: Record<string, number> = {}
    for (const e of (data ?? []) as any[]) {
      if (!e.va_id) continue
      const start = new Date(e.started_at).getTime()
      const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now()
      const seconds = Math.max(0, Math.floor((end - start) / 1000))
      map[e.va_id] = (map[e.va_id] ?? 0) + seconds
    }
    hoursByVa.value = map
  } catch (e) {
    console.warn('[team] hours:', (e as Error).message)
  } finally {
    hoursLoading.value = false
  }
}

watch(
  () => auth.isAuthenticated,
  (is) => {
    if (is) void loadHoursThisWeek()
  },
  { immediate: true }
)

const openTasksByVa = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const t of tasks.tasks) {
    if (!t.assignee_id) continue
    if (t.status === 'done' || t.status === 'cancelled') continue
    m[t.assignee_id] = (m[t.assignee_id] ?? 0) + 1
  }
  return m
})

// Filtering
const search = ref('')
const clientFilter = ref<'all' | string>('all')

const filtered = computed(() => {
  return team.myTeam.filter((m) => {
    if (clientFilter.value !== 'all') {
      const list = team.assignmentsByVa[m.id] ?? []
      if (!list.some((a) => a.client_id === clientFilter.value)) return false
    }
    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase()
      const hay = `${m.full_name ?? ''} ${m.email ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

function initials(p: MemberProfile) {
  const src = p.full_name || p.email || '?'
  return (
    src
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x.charAt(0).toUpperCase())
      .join('') || 'BB'
  )
}

function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

const totalVAs = computed(() => team.myTeam.length)
const totalHours = computed(() =>
  Object.values(hoursByVa.value).reduce((a, b) => a + b, 0)
)

// -----------------------------------------------------------------------------
// Selection — synced to /app/team/:vaId
// -----------------------------------------------------------------------------
const selectedId = computed(() => props.vaId ?? null)
const selectedVa = computed(() =>
  selectedId.value ? team.profiles[selectedId.value] ?? team.myTeam.find((x) => x.id === selectedId.value) ?? null : null
)

function selectVa(id: string) {
  router.push({ name: 'workstation-team', params: { vaId: id } })
}
function clearSelection() {
  router.push({ name: 'workstation-team', params: {} })
}

// Auto-select the first filtered VA on wide screens for a populated initial state.
watch(
  [filtered, selectedId],
  ([list, sel]) => {
    if (sel) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(min-width: 1024px)').matches && list.length > 0) {
      router.replace({ name: 'workstation-team', params: { vaId: list[0].id } })
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full -mx-6 -my-6 flex flex-col">
    <!-- Page header -->
    <header
      class="px-6 py-4 border-b border-base-300 flex items-end justify-between gap-4 flex-wrap shrink-0"
    >
      <div>
        <h1 class="font-display text-xl font-semibold flex items-center gap-2">
          <UsersRound class="w-5 h-5 text-base-content/70" :stroke-width="1.75" />
          Team
        </h1>
        <p class="text-xs text-base-content/60 mt-0.5">
          {{ auth.isAdmin ? 'All VAs across the agency.' : 'VAs you manage.' }}
        </p>
      </div>
      <div class="flex items-center gap-3 text-xs text-base-content/60">
        <span class="flex items-center gap-1.5">
          <UsersRound class="w-3.5 h-3.5" :stroke-width="1.75" />
          {{ totalVAs }} VA{{ totalVAs === 1 ? '' : 's' }}
        </span>
        <span class="flex items-center gap-1.5">
          <Clock class="w-3.5 h-3.5" :stroke-width="1.75" />
          {{ formatHours(totalHours) }} this week
        </span>
      </div>
    </header>

    <!-- Master + detail -->
    <div class="flex-1 min-h-0 flex">
      <!-- Master (roster) -->
      <aside
        :class="[
          'w-full lg:w-80 lg:shrink-0 lg:border-r border-base-300 bg-base-100 flex flex-col min-h-0',
          selectedId ? 'hidden lg:flex' : 'flex'
        ]"
      >
        <!-- Filters -->
        <div class="px-3 py-2.5 border-b border-base-300 space-y-2 shrink-0">
          <label
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-base-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/40"
          >
            <Search class="w-4 h-4 text-base-content/50" :stroke-width="1.75" />
            <input
              v-model="search"
              type="text"
              placeholder="Search name or email"
              class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40 min-w-0"
            />
          </label>
          <div class="flex items-center gap-1.5">
            <Filter class="w-3.5 h-3.5 text-base-content/50" :stroke-width="1.75" />
            <select v-model="clientFilter" class="select select-bordered select-xs flex-1">
              <option value="all">All clients</option>
              <option v-for="c in clients.clients" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Roster list -->
        <ul class="flex-1 overflow-y-auto py-1">
          <li v-if="!filtered.length" class="px-4 py-8 text-center text-xs text-base-content/50">
            <UsersRound class="w-6 h-6 mx-auto text-base-content/30" :stroke-width="1.5" />
            <p class="mt-2" v-if="team.myTeam.length === 0">
              {{ auth.isAdmin ? 'No VAs in the system yet.' : 'No VAs assigned to you yet.' }}
            </p>
            <p class="mt-2" v-else>No matches.</p>
          </li>
          <li
            v-for="m in filtered"
            :key="m.id"
            class="px-2"
          >
            <button
              type="button"
              class="w-full text-left px-2.5 py-2 rounded-lg flex items-start gap-2.5 transition-colors"
              :class="
                selectedId === m.id
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-base-200'
              "
              @click="selectVa(m.id)"
            >
              <div
                class="w-9 h-9 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center shrink-0 overflow-hidden"
              >
                <img
                  v-if="m.avatar_url"
                  :src="m.avatar_url"
                  :alt="m.full_name ?? ''"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ initials(m) }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ m.full_name || m.email || 'Unknown' }}</div>
                <div class="text-[0.65rem] text-base-content/50 truncate flex items-center gap-1">
                  <Mail class="w-2.5 h-2.5" :stroke-width="1.75" />
                  {{ m.email ?? '—' }}
                </div>
                <div class="flex items-center gap-2 mt-1 text-[0.65rem] text-base-content/60">
                  <span class="inline-flex items-center gap-0.5 tabular-nums">
                    <Clock class="w-2.5 h-2.5" :stroke-width="1.75" />
                    {{ formatHours(hoursByVa[m.id] ?? 0) }}
                  </span>
                  <span class="text-base-content/30">·</span>
                  <span class="inline-flex items-center gap-0.5 tabular-nums">
                    <ListTodo class="w-2.5 h-2.5" :stroke-width="1.75" />
                    {{ openTasksByVa[m.id] ?? 0 }} open
                  </span>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Detail -->
      <section
        :class="[
          'flex-1 min-w-0',
          selectedId ? 'flex' : 'hidden lg:flex'
        ]"
      >
        <VADetail
          v-if="selectedVa"
          :key="selectedId ?? 'none'"
          :va-id="selectedId!"
          @back="clearSelection"
        />
        <div
          v-else
          class="flex-1 flex items-center justify-center text-center text-sm text-base-content/50 px-6"
        >
          <div>
            <UsersRound class="w-10 h-10 mx-auto text-base-content/20" :stroke-width="1.5" />
            <p class="mt-3">Pick a VA from the list to see assignments, hours, and recent activity.</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
