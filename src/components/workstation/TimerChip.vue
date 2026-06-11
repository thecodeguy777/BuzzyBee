<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Play, Square, Clock, AlertTriangle } from 'lucide-vue-next'
import { useTimeStore } from '@/stores/time'
import { useClientsStore } from '@/stores/clients'

const time = useTimeStore()
const clients = useClientsStore()

// Clock-out note ("what did you work on?") — optional, saved to entry.notes.
const noteDraft = ref('')
// Stale recovery: a forgotten timer gets a custom end time instead of "now".
const fixEnd = ref('')
function toLocalInput(iso: string) {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
async function saveFixedEnd() {
  const entry = time.currentEntry
  if (!entry || !fixEnd.value) return
  const ok = await time.updateEntry(entry.id, {
    ended_at: new Date(fixEnd.value).toISOString(),
    notes: noteDraft.value || undefined,
  })
  if (ok) {
    noteDraft.value = ''
    close()
  }
}

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close()
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onEsc)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEsc)
})

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const elapsedLabel = computed(() => formatHMS(time.elapsedSeconds))

const runningClient = computed(() => {
  if (!time.currentEntry) return null
  return clients.clients.find((c) => c.id === time.currentEntry!.client_id) ?? null
})

const startedAtLabel = computed(() => {
  if (!time.currentEntry) return ''
  return new Date(time.currentEntry.started_at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })
})

async function handleClockIn() {
  await time.clockIn()
}
async function handleClockOut() {
  try {
    await time.clockOut(noteDraft.value)
    noteDraft.value = ''
    close()
  } catch {
    /* time.error is shown in the popover */
  }
}
function toggleOpen() {
  toggle()
  if (open.value && time.isStaleSession && time.currentEntry && !fixEnd.value) {
    // Sensible default for "when did you actually stop?": start + 8h.
    const d = new Date(time.currentEntry.started_at)
    d.setHours(d.getHours() + 8)
    fixEnd.value = toLocalInput(d.toISOString())
  }
}
</script>

<template>
  <div ref="rootEl" class="relative">
    <!-- Idle state -->
    <button
      v-if="!time.isRunning"
      type="button"
      class="btn btn-sm btn-primary gap-2"
      :disabled="!clients.currentClient || time.loading"
      @click="handleClockIn"
    >
      <Play class="w-3.5 h-3.5" :stroke-width="2" />
      <span class="hidden sm:inline">
        {{
          clients.currentClient
            ? `Clock in for ${clients.currentClient.name}`
            : 'Select a client first'
        }}
      </span>
      <span class="sm:hidden">Clock in</span>
    </button>

    <!-- Running state — turns amber after 6h, red after 12h (forgot to clock out?) -->
    <button
      v-else
      type="button"
      class="btn btn-sm gap-2"
      :class="time.isStaleSession
        ? 'border-error bg-error/10 text-error hover:bg-error/20'
        : time.isLongSession
          ? 'border-warning bg-warning/10 text-warning-content hover:bg-warning/20'
          : 'border-success bg-success/10 text-success-content hover:bg-success/20'"
      :aria-expanded="open"
      :aria-haspopup="true"
      @click="toggleOpen"
    >
      <AlertTriangle v-if="time.isLongSession" class="w-3.5 h-3.5" :stroke-width="2" />
      <span v-else class="relative flex h-2 w-2">
        <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
      </span>
      <span class="font-medium max-w-[10rem] truncate">
        {{ runningClient?.name ?? 'Running' }}
      </span>
      <span class="font-mono tabular-nums text-xs">{{ elapsedLabel }}</span>
    </button>

    <!-- Popover (only when running + open) -->
    <transition name="dropdown">
    <div
      v-if="time.isRunning && open"
      class="absolute right-0 z-40 mt-1 w-72 rounded-lg border border-base-300 bg-base-100 shadow-lg overflow-hidden"
      role="menu"
    >
      <div class="px-4 py-3 border-b border-base-300">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
          </span>
          <div class="text-sm font-medium truncate">
            {{ runningClient?.name ?? 'Running' }}
          </div>
        </div>
        <div class="font-display text-lg font-semibold mt-2 tabular-nums">
          {{ elapsedLabel }}
        </div>
        <div class="text-xs text-base-content/60 mt-1 flex items-center gap-1">
          <Clock class="w-3 h-3" :stroke-width="1.75" />
          Started {{ startedAtLabel }}
        </div>
      </div>

      <!-- stale recovery: forgot to clock out -->
      <div v-if="time.isStaleSession" class="px-4 py-3 border-b border-base-300 bg-error/5">
        <div class="flex items-center gap-1.5 text-xs font-semibold text-error">
          <AlertTriangle class="w-3.5 h-3.5" :stroke-width="2" /> Forgot to clock out?
        </div>
        <p class="text-xs text-base-content/60 mt-1">
          This session is over 12 hours. Set when you actually stopped:
        </p>
        <div class="flex gap-1.5 mt-2">
          <input
            v-model="fixEnd"
            type="datetime-local"
            class="input input-bordered input-xs flex-1"
            :min="toLocalInput(time.currentEntry!.started_at)"
          />
          <button type="button" class="btn btn-error btn-xs" :disabled="!fixEnd" @click="saveFixedEnd">
            Save
          </button>
        </div>
      </div>

      <div class="px-2 py-2 space-y-1.5">
        <p v-if="time.isLongSession && !time.isStaleSession" class="flex items-center gap-1.5 px-1 text-xs text-warning">
          <AlertTriangle class="w-3.5 h-3.5 shrink-0" :stroke-width="2" /> Long session — still working?
        </p>
        <input
          v-model="noteDraft"
          type="text"
          placeholder="What did you work on? (optional)"
          class="input input-bordered input-sm w-full"
          @keydown.enter="handleClockOut"
        />
        <button
          type="button"
          class="btn btn-error btn-sm w-full justify-center gap-2"
          :disabled="time.loading"
          @click="handleClockOut"
        >
          <Square class="w-3.5 h-3.5" :stroke-width="2" />
          Clock out
        </button>
        <p v-if="time.error" class="text-xs text-error text-center">{{ time.error }}</p>
        <p class="text-xs text-base-content/50 text-center pt-0.5">
          Switching clients in the top bar will auto-stop and re-start.
        </p>
      </div>
    </div>
    </transition>
  </div>
</template>
