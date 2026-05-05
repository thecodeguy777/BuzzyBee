<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useTimeStore, type TimeEntry } from '@/stores/time'
import { useClientsStore } from '@/stores/clients'

const time = useTimeStore()
const clients = useClientsStore()

onMounted(() => {
  void time.fetchRecent(14)
})

function clientName(id: string) {
  return clients.clients.find((c) => c.id === id)?.name ?? '—'
}

function durationSeconds(e: TimeEntry, nowMs: number) {
  const start = new Date(e.started_at).getTime()
  const end = e.ended_at ? new Date(e.ended_at).getTime() : nowMs
  return Math.max(0, Math.floor((end - start) / 1000))
}

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function formatHMSPrecise(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function startOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // Sunday-start, simple
  return d.getTime()
}

const todayEntries = computed(() => {
  const cutoff = startOfToday()
  return time.recentEntries.filter((e) => new Date(e.started_at).getTime() >= cutoff)
})

const weekEntries = computed(() => {
  const cutoff = startOfWeek()
  return time.recentEntries.filter((e) => new Date(e.started_at).getTime() >= cutoff)
})

const nowMs = computed(() => {
  // Force reactivity on the running entry by reading the ticker.
  void time.elapsedSeconds
  return Date.now()
})

const todayTotal = computed(() =>
  todayEntries.value.reduce((acc, e) => acc + durationSeconds(e, nowMs.value), 0)
)

const weekByClient = computed(() => {
  const map = new Map<string, number>()
  for (const e of weekEntries.value) {
    map.set(e.client_id, (map.get(e.client_id) ?? 0) + durationSeconds(e, nowMs.value))
  }
  return [...map.entries()]
    .map(([client_id, seconds]) => ({ client_id, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
})

function timeRange(e: TimeEntry) {
  const start = new Date(e.started_at)
  const startStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endStr = e.ended_at
    ? new Date(e.ended_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'running'
  return `${startStr} → ${endStr}`
}
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="font-display text-xl font-semibold">Time</h1>
      <p class="text-xs text-base-content/60 mt-0.5">
        Honest activity log. Timestamps only — no screenshots, no keystrokes.
      </p>
    </header>

    <section class="grid gap-4 sm:grid-cols-2">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="text-xs uppercase tracking-wide text-base-content/60">Today</div>
          <div class="font-display text-xl font-semibold mt-1 tabular-nums">
            {{ formatHMSPrecise(todayTotal) }}
          </div>
          <div class="text-xs text-base-content/60 mt-1">
            {{ todayEntries.length }} session{{ todayEntries.length === 1 ? '' : 's' }}
          </div>
        </div>
      </div>

      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="text-xs uppercase tracking-wide text-base-content/60">This week, by client</div>
          <ul v-if="weekByClient.length" class="mt-2 space-y-1.5 text-sm">
            <li
              v-for="row in weekByClient"
              :key="row.client_id"
              class="flex items-center justify-between gap-3"
            >
              <span class="truncate">{{ clientName(row.client_id) }}</span>
              <span class="font-mono tabular-nums text-base-content/70">{{ formatHMS(row.seconds) }}</span>
            </li>
          </ul>
          <div v-else class="text-sm text-base-content/60 mt-2">No sessions yet this week.</div>
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-medium text-base-content/70 mb-2">Today's sessions</h2>
      <ul v-if="todayEntries.length" class="space-y-2">
        <li
          v-for="e in todayEntries"
          :key="e.id"
          class="card bg-base-100 border border-base-300 shadow-sm"
        >
          <div class="card-body p-4 flex-row items-center justify-between gap-4 flex-wrap">
            <div class="min-w-0">
              <div class="font-medium truncate">{{ clientName(e.client_id) }}</div>
              <div class="text-xs text-base-content/60 mt-0.5">{{ timeRange(e) }}</div>
            </div>
            <div class="text-right">
              <div class="font-mono tabular-nums text-sm">
                {{ formatHMSPrecise(durationSeconds(e, nowMs)) }}
              </div>
              <span
                v-if="e.status === 'running'"
                class="badge badge-success badge-sm gap-1 mt-1"
              >
                Running
              </span>
            </div>
          </div>
        </li>
      </ul>
      <div
        v-else
        class="card bg-base-100 border border-base-300 shadow-sm"
      >
        <div class="card-body p-6 text-center text-sm text-base-content/60">
          Nothing logged today yet. Clock in from the top bar to start a session.
        </div>
      </div>
    </section>
  </div>
</template>
