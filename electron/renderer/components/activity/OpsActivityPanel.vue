<script setup lang="ts">
import { ref, computed } from 'vue'
import { Activity, Search, UserPlus } from 'lucide-vue-next'
import { useLeadEvents, type LeadEventType } from '../../composables/useLeadEvents'
import { useLeads } from '../../composables/useLeads'
import { useAddLead } from '../../composables/useAddLead'
import EventItem from './EventItem.vue'

const emit = defineEmits<{
  (e: 'lead-click', leadId: string): void
}>()

const leadEvents = useLeadEvents()
const leads = useLeads()
const addLead = useAddLead()

type Filter = 'all' | 'calls' | 'pipeline' | 'schedule' | 'notes' | 'system'

const filter = ref<Filter>('all')
const search = ref('')

const FILTER_GROUPS: Record<Filter, LeadEventType[] | null> = {
  all:      null,
  calls:    ['call_started', 'call_completed', 'disposition_set', 'recording_ready', 'recording_transcribed'],
  pipeline: ['stage_changed', 'assigned', 'reassigned', 'deal_value_changed'],
  schedule: ['callback_scheduled', 'callback_cleared'],
  notes:    ['note_added', 'note_edited', 'manual_note', 'ai_summary_generated'],
  system:   ['imported', 'task_created', 'task_completed', 'task_overdue', 'sla_breached'],
}

const filteredEvents = computed(() => {
  let scope = leadEvents.recent.value
  const types = FILTER_GROUPS[filter.value]
  if (types) {
    const set = new Set(types)
    scope = scope.filter(e => set.has(e.eventType))
  }
  const q = search.value.trim().toLowerCase()
  if (q) {
    scope = scope.filter(e => {
      const lead = leads.leads.value.find(l => l.id === e.leadId)
      return (lead?.fullName.toLowerCase().includes(q) ?? false)
        || (lead?.company?.toLowerCase().includes(q) ?? false)
        || e.eventType.includes(q)
    })
  }
  return scope
})

// Group events by date for readability ("Today", "Yesterday", "Earlier")
const grouped = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const groups: { label: string; events: typeof leadEvents.recent.value }[] = []
  const todayEv: typeof leadEvents.recent.value = []
  const yesterdayEv: typeof leadEvents.recent.value = []
  const earlierEv: typeof leadEvents.recent.value = []
  for (const ev of filteredEvents.value) {
    const t = new Date(ev.createdAt).getTime()
    if (t >= today.getTime()) todayEv.push(ev)
    else if (t >= yesterday.getTime()) yesterdayEv.push(ev)
    else earlierEv.push(ev)
  }
  if (todayEv.length) groups.push({ label: 'Today', events: todayEv })
  if (yesterdayEv.length) groups.push({ label: 'Yesterday', events: yesterdayEv })
  if (earlierEv.length) groups.push({ label: 'Earlier', events: earlierEv })
  return groups
})

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'calls',    label: 'Calls' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'notes',    label: 'Notes' },
  { value: 'system',   label: 'System' },
]

function counted(filterKey: Filter): number {
  const types = FILTER_GROUPS[filterKey]
  if (!types) return leadEvents.recent.value.length
  const set = new Set(types)
  return leadEvents.recent.value.filter(e => set.has(e.eventType)).length
}

function onLeadClick(leadId: string) {
  emit('lead-click', leadId)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="border-b border-base-300 bg-base-100">
      <div class="px-5 py-3 flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center">
          <Activity class="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-base-content">Team activity</h3>
          <div class="text-[10px] text-base-content/50">
            Every event flowing through HiveMind in real time
          </div>
        </div>
        <div class="flex-1"></div>
        <div class="relative">
          <Search class="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-base-content/30" />
          <input
            v-model="search"
            type="text"
            placeholder="Filter by lead, company, event…"
            class="w-56 text-xs pl-7 pr-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
          />
        </div>
        <button
          class="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm"
          title="Add a new lead"
          @click="addLead.open({ source: 'activity' })"
        >
          <UserPlus class="w-3 h-3" />
          New lead
        </button>
      </div>

      <!-- Filter chips -->
      <div class="px-5 pb-3 flex items-center gap-1 overflow-x-auto">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          class="text-[11px] px-2.5 py-1 rounded transition-colors whitespace-nowrap"
          :class="filter === f.value
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-200'"
          @click="filter = f.value"
        >
          {{ f.label }} <span class="text-[9px] ml-0.5 opacity-60">{{ counted(f.value) }}</span>
        </button>
      </div>
    </div>

    <!-- Feed -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredEvents.length === 0" class="p-12 text-center">
        <Activity class="w-8 h-8 mx-auto mb-2 text-base-content/20" />
        <p class="text-xs text-base-content/50">
          {{ leadEvents.recent.value.length === 0
            ? 'No activity yet. Make a call or move a lead to start the feed.'
            : `No events match "${search}" in ${filter}.` }}
        </p>
      </div>

      <div v-for="group in grouped" :key="group.label">
        <div class="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/40 bg-base-200/30 sticky top-0 z-10 border-y border-base-300">
          {{ group.label }} <span class="font-normal opacity-50">· {{ group.events.length }}</span>
        </div>
        <EventItem
          v-for="ev in group.events"
          :key="ev.id"
          :event="ev"
          :show-lead="true"
          @lead-click="onLeadClick"
        />
      </div>
    </div>
  </div>
</template>
