<script setup lang="ts">
import { ref, computed } from 'vue'
import { Phone, PhoneCall, PhoneMissed, Voicemail, Clock, Calendar, Trash2, Search, ChevronRight, Mic } from 'lucide-vue-next'
import { useAutoDialer } from '../../composables/useAutoDialer'
import { useToast } from '../../composables/useToast'
import { useDialog } from '../../composables/useDialog'
import LeadStatusBadge from './LeadStatusBadge.vue'
import type { CallLogEntry } from '../../composables/useCallLog'
import type { LeadStatus } from '../../composables/useLeads'

const auto = useAutoDialer()
const callLog = auto.callLog
const toast = useToast()
const dialog = useDialog()

const filter = ref<'today' | 'week' | 'all'>('today')
const search = ref('')
const expandedId = ref<string | null>(null)

const filteredCalls = computed(() => {
  const all = callLog.recent.value
  let scope = all
  if (filter.value === 'today') {
    const since = startOfToday()
    scope = all.filter(c => new Date(c.startedAt).getTime() >= since)
  } else if (filter.value === 'week') {
    const since = startOfWeek()
    scope = all.filter(c => new Date(c.startedAt).getTime() >= since)
  }
  const q = search.value.trim().toLowerCase()
  if (!q) return scope
  return scope.filter(c =>
    (c.leadName?.toLowerCase().includes(q) ?? false)
    || c.toE164.includes(q)
    || (c.dispositionNotes?.toLowerCase().includes(q) ?? false),
  )
})

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function startOfWeek() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

function fmtPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtTotalDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// Map disposition → LeadStatus for badge reuse
function dispoToStatus(c: CallLogEntry): LeadStatus {
  return (c.disposition ?? (c.status === 'no-answer' || c.status === 'canceled' ? 'no-answer' : 'new')) as LeadStatus
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function deleteEntry(id: string) {
  const ok = await dialog.confirm({
    title: 'Delete this call entry?',
    destructive: true,
  })
  if (!ok) return
  callLog.deleteCall(id)
  toast.info('Call entry deleted')
}

async function clearAllCalls() {
  const count = callLog.calls.value.length
  const ok = await dialog.confirm({
    title: `Delete all ${count} call entries?`,
    message: 'This cannot be undone.',
    destructive: true,
    confirmLabel: 'Delete all',
  })
  if (!ok) return
  callLog.clearAll()
  toast.warning(`Cleared ${count} call ${count === 1 ? 'entry' : 'entries'}`)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Stats grid -->
    <div class="grid grid-cols-2 gap-1.5 p-3 border-b border-base-300">
      <div class="rounded-lg border border-base-300 p-2.5 bg-base-200/30">
        <div class="flex items-center gap-1 text-[9px] uppercase tracking-wider text-base-content/50">
          <PhoneCall class="w-2.5 h-2.5" />
          Today
        </div>
        <div class="text-lg font-semibold text-base-content mt-0.5">{{ callLog.todayStats.value.total }}</div>
        <div class="text-[9px] text-base-content/40">{{ fmtTotalDuration(callLog.todayStats.value.totalDurationSec) }} total</div>
      </div>

      <div class="rounded-lg border border-green-500/20 p-2.5 bg-green-500/5">
        <div class="flex items-center gap-1 text-[9px] uppercase tracking-wider text-green-700 dark:text-green-400">
          <Phone class="w-2.5 h-2.5" />
          Contacted
        </div>
        <div class="text-lg font-semibold text-base-content mt-0.5">{{ callLog.todayStats.value.contacted }}</div>
        <div class="text-[9px] text-base-content/40">today</div>
      </div>

      <div class="rounded-lg border border-purple-500/20 p-2.5 bg-purple-500/5">
        <div class="flex items-center gap-1 text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400">
          <Voicemail class="w-2.5 h-2.5" />
          Voicemails
        </div>
        <div class="text-lg font-semibold text-base-content mt-0.5">{{ callLog.todayStats.value.voicemails }}</div>
        <div class="text-[9px] text-base-content/40">today</div>
      </div>

      <div class="rounded-lg border border-amber-500/20 p-2.5 bg-amber-500/5">
        <div class="flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
          <Calendar class="w-2.5 h-2.5" />
          Callbacks
        </div>
        <div class="text-lg font-semibold text-base-content mt-0.5">{{ callLog.callbacksDue.value.length }}</div>
        <div class="text-[9px] text-base-content/40">scheduled</div>
      </div>
    </div>

    <!-- Filters + search -->
    <div class="px-3 py-2 border-b border-base-300 space-y-2">
      <div class="flex items-center gap-1">
        <button
          v-for="f in (['today', 'week', 'all'] as const)"
          :key="f"
          class="text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-colors"
          :class="filter === f
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-base-content/50 hover:text-base-content'"
          @click="filter = f"
        >{{ f }}</button>
        <div class="flex-1"></div>
        <button
          v-if="callLog.calls.value.length > 0"
          class="text-[10px] text-red-500/70 hover:text-red-500 transition-colors"
          title="Clear call log"
          @click="clearAllCalls"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
      <div class="relative">
        <Search class="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-base-content/30" />
        <input
          v-model="search"
          type="text"
          placeholder="Search by name, phone, notes"
          class="w-full text-xs pl-6 pr-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
        />
      </div>
    </div>

    <!-- Call list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredCalls.length === 0" class="p-6 text-center">
        <PhoneMissed class="w-8 h-8 mx-auto mb-2 text-base-content/20" />
        <p class="text-xs text-base-content/50">
          {{ callLog.calls.value.length === 0
            ? 'No calls yet.'
            : `No calls in ${filter === 'all' ? 'history' : filter}.` }}
        </p>
      </div>

      <div v-else class="divide-y divide-base-300">
        <div
          v-for="call in filteredCalls"
          :key="call.id"
          class="hover:bg-base-200/40 transition-colors"
        >
          <button
            class="w-full px-3 py-2 text-left flex items-center gap-2"
            @click="toggleExpand(call.id)"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-base-content truncate">
                  {{ call.leadName || fmtPhone(call.toE164) }}
                </span>
                <LeadStatusBadge :status="dispoToStatus(call)" size="xs" />
              </div>
              <div class="flex items-center gap-2 mt-0.5 text-[10px] text-base-content/50">
                <Clock class="w-2.5 h-2.5" />
                <span>{{ fmtTime(call.startedAt) }}</span>
                <span>·</span>
                <span>{{ fmtDuration(call.durationSec) }}</span>
                <span v-if="call.dispositionNotes">· note</span>
              </div>
            </div>
            <ChevronRight
              class="w-3 h-3 text-base-content/30 transition-transform"
              :class="expandedId === call.id ? 'rotate-90' : ''"
            />
          </button>

          <!-- Expanded detail -->
          <div v-if="expandedId === call.id" class="px-3 pb-3 space-y-2 bg-base-200/30">
            <div class="text-[10px] text-base-content/60 grid grid-cols-2 gap-x-3 gap-y-1">
              <div><span class="text-base-content/40">To:</span> {{ fmtPhone(call.toE164) }}</div>
              <div v-if="call.fromE164"><span class="text-base-content/40">From:</span> {{ fmtPhone(call.fromE164) }}</div>
              <div><span class="text-base-content/40">Started:</span> {{ fmtTime(call.startedAt) }}</div>
              <div v-if="call.endedAt"><span class="text-base-content/40">Ended:</span> {{ fmtTime(call.endedAt) }}</div>
              <div v-if="call.disposition"><span class="text-base-content/40">Outcome:</span> {{ call.disposition }}</div>
              <div v-if="call.callbackAt"><span class="text-base-content/40">Callback:</span> {{ fmtTime(call.callbackAt) }}</div>
            </div>
            <div v-if="call.dispositionNotes" class="text-[11px] text-base-content/80 leading-relaxed border-l-2 border-primary/30 pl-2">
              {{ call.dispositionNotes }}
            </div>
            <div v-if="call.recordingUrl" class="text-[10px] text-primary flex items-center gap-1">
              <Mic class="w-2.5 h-2.5" />
              Recording available
            </div>
            <div class="flex justify-end">
              <button
                class="text-[10px] text-red-500/70 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors flex items-center gap-1"
                @click.stop="deleteEntry(call.id)"
              >
                <Trash2 class="w-2.5 h-2.5" />
                Delete entry
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
