<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Pencil, Trash2, Download, StickyNote, X, Check } from 'lucide-vue-next'
import { useTimeStore, type TimeEntry } from '@/stores/time'
import { useClientsStore } from '@/stores/clients'

const time = useTimeStore()
const clients = useClientsStore()

// ── Range ─────────────────────────────────────────────────────────────────────
type RangeId = 'today' | 'week' | 'last-week' | 'month'
const RANGES: { id: RangeId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
  { id: 'month', label: 'This month' },
]
const range = ref<RangeId>('today')

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function startOfWeekMs(offsetWeeks = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // Monday-start week.
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day - offsetWeeks * 7)
  return d.getTime()
}
const bounds = computed<{ from: number; to: number }>(() => {
  const now = Date.now()
  if (range.value === 'today') return { from: startOfToday(), to: now }
  if (range.value === 'week') return { from: startOfWeekMs(), to: now }
  if (range.value === 'last-week') return { from: startOfWeekMs(1), to: startOfWeekMs() }
  const m = new Date()
  m.setHours(0, 0, 0, 0)
  m.setDate(1)
  return { from: m.getTime(), to: now }
})

onMounted(() => {
  void time.fetchRecent(45) // covers "this month" + last week comfortably
})

// ── Durations ─────────────────────────────────────────────────────────────────
const nowMs = computed(() => {
  void time.elapsedSeconds // ride the store ticker so running rows advance
  return Date.now()
})
function durationSeconds(e: TimeEntry, tnow: number) {
  const start = new Date(e.started_at).getTime()
  const end = e.ended_at ? new Date(e.ended_at).getTime() : tnow
  return Math.max(0, Math.floor((end - start) / 1000))
}
function formatHM(totalSeconds: number) {
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

const entries = computed(() =>
  time.recentEntries.filter((e) => {
    const t = new Date(e.started_at).getTime()
    return t >= bounds.value.from && t < bounds.value.to
  }),
)
const rangeTotal = computed(() => entries.value.reduce((acc, e) => acc + durationSeconds(e, nowMs.value), 0))
const byClient = computed(() => {
  const map = new Map<string, number>()
  for (const e of entries.value) {
    map.set(e.client_id, (map.get(e.client_id) ?? 0) + durationSeconds(e, nowMs.value))
  }
  return [...map.entries()]
    .map(([client_id, seconds]) => ({ client_id, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
})

function clientName(id: string) {
  return clients.clients.find((c) => c.id === id)?.name ?? '—'
}
function timeRange(e: TimeEntry) {
  const start = new Date(e.started_at)
  const startStr = start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const endStr = e.ended_at
    ? new Date(e.ended_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'running'
  return `${startStr} → ${endStr}`
}
const wasAutoClosed = (e: TimeEntry) => !!e.notes?.includes('[auto-closed')

// ── Edit / delete ─────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null)
const draft = ref({ start: '', end: '', notes: '' })
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
function beginEdit(e: TimeEntry) {
  editingId.value = e.id
  draft.value = {
    start: toLocalInput(e.started_at),
    end: toLocalInput(e.ended_at),
    notes: e.notes ?? '',
  }
}
async function saveEdit(e: TimeEntry) {
  const ok = await time.updateEntry(e.id, {
    started_at: draft.value.start ? new Date(draft.value.start).toISOString() : undefined,
    ended_at: draft.value.end ? new Date(draft.value.end).toISOString() : e.ended_at,
    notes: draft.value.notes,
  })
  if (ok) editingId.value = null
}
async function removeEntry(e: TimeEntry) {
  if (!window.confirm(`Delete this ${formatHM(durationSeconds(e, nowMs.value))} session for ${clientName(e.client_id)}?`)) return
  await time.deleteEntry(e.id)
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCsv() {
  const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"'
  const rows = [
    ['Client', 'Date', 'Start', 'End', 'Hours', 'Status', 'Notes'],
    ...entries.value.map((e) => {
      const secs = durationSeconds(e, nowMs.value)
      return [
        clientName(e.client_id),
        new Date(e.started_at).toLocaleDateString(),
        new Date(e.started_at).toLocaleTimeString(),
        e.ended_at ? new Date(e.ended_at).toLocaleTimeString() : 'running',
        (secs / 3600).toFixed(2),
        e.status,
        e.notes ?? '',
      ]
    }),
  ]
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `buzzyhive-time-${range.value}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="space-y-6">
    <header class="flex flex-wrap items-end gap-3">
      <div class="flex-1 min-w-0">
        <h1 class="font-display text-xl font-semibold">Time</h1>
        <p class="text-xs text-base-content/60 mt-0.5">
          Honest activity log. Timestamps only — no screenshots, no keystrokes.
        </p>
      </div>
      <div class="join">
        <button
          v-for="r in RANGES"
          :key="r.id"
          type="button"
          class="join-item btn btn-xs"
          :class="range === r.id ? 'btn-primary' : 'btn-ghost border border-base-300'"
          @click="range = r.id"
        >{{ r.label }}</button>
      </div>
      <button type="button" class="btn btn-xs btn-ghost border border-base-300 gap-1.5" :disabled="!entries.length" @click="exportCsv">
        <Download class="w-3.5 h-3.5" :stroke-width="2" /> CSV
      </button>
    </header>

    <p v-if="time.error" class="text-sm text-error">{{ time.error }}</p>

    <section class="grid gap-4 sm:grid-cols-2">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="text-xs uppercase tracking-wide text-base-content/60">{{ RANGES.find(r => r.id === range)?.label }} total</div>
          <div class="font-display text-xl font-semibold mt-1 tabular-nums">
            {{ formatHMSPrecise(rangeTotal) }}
          </div>
          <div class="text-xs text-base-content/60 mt-1">
            {{ entries.length }} session{{ entries.length === 1 ? '' : 's' }}
          </div>
        </div>
      </div>

      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-5">
          <div class="text-xs uppercase tracking-wide text-base-content/60">By client</div>
          <ul v-if="byClient.length" class="mt-2 space-y-1.5 text-sm">
            <li v-for="row in byClient" :key="row.client_id" class="flex items-center justify-between gap-3">
              <span class="truncate">{{ clientName(row.client_id) }}</span>
              <span class="font-mono tabular-nums text-base-content/70">{{ formatHM(row.seconds) }}</span>
            </li>
          </ul>
          <div v-else class="text-sm text-base-content/60 mt-2">No sessions in this range.</div>
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-medium text-base-content/70 mb-2">Sessions</h2>
      <ul v-if="entries.length" class="space-y-2">
        <li v-for="e in entries" :key="e.id" class="card bg-base-100 border border-base-300 shadow-sm">
          <!-- edit mode -->
          <div v-if="editingId === e.id" class="card-body p-4 gap-3">
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="form-control">
                <span class="text-[11px] uppercase tracking-wide text-base-content/50 mb-1">Start</span>
                <input v-model="draft.start" type="datetime-local" class="input input-bordered input-sm" />
              </label>
              <label class="form-control">
                <span class="text-[11px] uppercase tracking-wide text-base-content/50 mb-1">End</span>
                <input v-model="draft.end" type="datetime-local" class="input input-bordered input-sm" :min="draft.start" />
              </label>
            </div>
            <input v-model="draft.notes" type="text" placeholder="Note — what was this session?" class="input input-bordered input-sm w-full" />
            <div class="flex justify-end gap-2">
              <button type="button" class="btn btn-ghost btn-xs gap-1" @click="editingId = null"><X class="w-3.5 h-3.5" /> Cancel</button>
              <button type="button" class="btn btn-primary btn-xs gap-1" @click="saveEdit(e)"><Check class="w-3.5 h-3.5" /> Save</button>
            </div>
          </div>

          <!-- read mode -->
          <div v-else class="card-body p-4 flex-row items-center justify-between gap-4 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="font-medium truncate">{{ clientName(e.client_id) }}</div>
              <div class="text-xs text-base-content/60 mt-0.5">{{ timeRange(e) }}</div>
              <div v-if="e.notes" class="flex items-start gap-1.5 text-xs text-base-content/70 mt-1.5">
                <StickyNote class="w-3.5 h-3.5 shrink-0 mt-px text-base-content/40" :stroke-width="1.75" />
                <span>{{ e.notes }}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-mono tabular-nums text-sm">{{ formatHMSPrecise(durationSeconds(e, nowMs)) }}</div>
              <span v-if="e.status === 'running'" class="badge badge-success badge-sm gap-1 mt-1">Running</span>
              <span v-else-if="wasAutoClosed(e)" class="badge badge-warning badge-sm gap-1 mt-1" title="Closed automatically at the 12h cap — edit if the real end time differs">auto-closed</span>
            </div>
            <div class="flex gap-1 shrink-0">
              <button type="button" class="btn btn-ghost btn-xs btn-square" title="Edit session" @click="beginEdit(e)">
                <Pencil class="w-3.5 h-3.5" :stroke-width="1.75" />
              </button>
              <button type="button" class="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error" title="Delete session" @click="removeEntry(e)">
                <Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" />
              </button>
            </div>
          </div>
        </li>
      </ul>
      <div v-else class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-6 text-center text-sm text-base-content/60">
          Nothing logged in this range. Clock in from the top bar to start a session.
        </div>
      </div>
    </section>
  </div>
</template>
