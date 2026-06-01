<script setup lang="ts">
import { computed, ref } from 'vue'
import { Calendar, Phone, Clock, AlertCircle, ChevronRight, Globe } from 'lucide-vue-next'
import { useAutoDialer } from '../../composables/useAutoDialer'
import { useToast } from '../../composables/useToast'
import type { Lead } from '../../composables/useLeads'
import CrmStageBadge from '../crm/CrmStageBadge.vue'

const auto = useAutoDialer()
const toast = useToast()

// Live ticker so "overdue X min ago" stays current
const now = ref(Date.now())
setInterval(() => { now.value = Date.now() }, 30_000)

interface BucketEntry {
  lead: Lead
  callbackTime: Date
  isOverdue: boolean
  callabilityCheck: ReturnType<typeof auto.compliance.isLeadCallableNow>
}

interface Bucket {
  key: string
  label: string
  color: string
  entries: BucketEntry[]
}

const buckets = computed<Bucket[]>(() => {
  const out: Bucket[] = []
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const dayAfterTomorrow = new Date(todayStart); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
  const weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + 7)

  const overdue: BucketEntry[] = []
  const next2h: BucketEntry[] = []
  const today: BucketEntry[] = []
  const tomorrow: BucketEntry[] = []
  const thisWeek: BucketEntry[] = []
  const later: BucketEntry[] = []

  for (const lead of auto.leads.leads.value) {
    if (!lead.nextCallbackAt) continue
    if (lead.stage === 'closed-won' || lead.stage === 'closed-lost') continue
    const cb = new Date(lead.nextCallbackAt)
    const entry: BucketEntry = {
      lead,
      callbackTime: cb,
      isOverdue: cb.getTime() < now.value,
      callabilityCheck: auto.compliance.isLeadCallableNow(lead),
    }
    if (cb.getTime() < now.value) {
      overdue.push(entry)
    } else if (cb.getTime() < now.value + 2 * 60 * 60 * 1000) {
      next2h.push(entry)
    } else if (cb < tomorrowStart) {
      today.push(entry)
    } else if (cb < dayAfterTomorrow) {
      tomorrow.push(entry)
    } else if (cb < weekEnd) {
      thisWeek.push(entry)
    } else {
      later.push(entry)
    }
  }

  // Sort each bucket chronologically
  const byTime = (a: BucketEntry, b: BucketEntry) =>
    a.callbackTime.getTime() - b.callbackTime.getTime()
  overdue.sort(byTime)
  next2h.sort(byTime)
  today.sort(byTime)
  tomorrow.sort(byTime)
  thisWeek.sort(byTime)
  later.sort(byTime)

  if (overdue.length)  out.push({ key: 'overdue',  label: 'Overdue',           color: 'red',    entries: overdue })
  if (next2h.length)   out.push({ key: 'next2h',   label: 'Next 2 hours',      color: 'amber',  entries: next2h })
  if (today.length)    out.push({ key: 'today',    label: 'Later today',       color: 'primary', entries: today })
  if (tomorrow.length) out.push({ key: 'tomorrow', label: 'Tomorrow',          color: 'base',   entries: tomorrow })
  if (thisWeek.length) out.push({ key: 'week',     label: 'This week',         color: 'base',   entries: thisWeek })
  if (later.length)    out.push({ key: 'later',    label: 'Later',             color: 'base',   entries: later })

  return out
})

const totalCount = computed(() =>
  buckets.value.reduce((sum, b) => sum + b.entries.length, 0),
)

const BUCKET_HEADER_CLS: Record<string, string> = {
  red:     'text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/5',
  amber:   'text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/5',
  primary: 'text-primary border-primary/30 bg-primary/5',
  base:    'text-base-content/60 border-base-300 bg-base-200/40',
}

function callLead(lead: Lead) {
  const check = auto.compliance.isLeadCallableNow(lead)
  if (!check.ok) {
    toast.warning(check.reason, lead.fullName)
    return
  }
  auto.dialLead(lead.id)
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtRelative(d: Date): string {
  const diffMs = d.getTime() - now.value
  const absM = Math.round(Math.abs(diffMs) / 60_000)
  if (absM < 60) return diffMs < 0 ? `${absM}m ago` : `in ${absM}m`
  const absH = Math.round(absM / 60)
  if (absH < 24) return diffMs < 0 ? `${absH}h ago` : `in ${absH}h`
  const absD = Math.round(absH / 24)
  return diffMs < 0 ? `${absD}d ago` : `in ${absD}d`
}

function fmtLeadLocal(lead: Lead): string {
  return auto.compliance.formatLeadLocalTime(lead)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-3 py-2 border-b border-base-300">
      <div class="flex items-center gap-2">
        <Calendar class="w-3.5 h-3.5 text-primary" />
        <h3 class="text-xs font-semibold text-base-content">Callback schedule</h3>
        <span class="text-[10px] text-base-content/40">· {{ totalCount }} scheduled</span>
      </div>
    </div>

    <!-- Buckets -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="totalCount === 0" class="p-6 text-center">
        <Calendar class="w-8 h-8 mx-auto mb-2 text-base-content/20" />
        <p class="text-xs text-base-content/50">No callbacks scheduled.</p>
        <p class="text-[10px] text-base-content/40 mt-1">
          When you disposition a call as <span class="font-medium">Callback</span>, it appears here.
        </p>
      </div>

      <div v-for="bucket in buckets" :key="bucket.key">
        <div
          class="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold border-y flex items-center justify-between sticky top-0 z-10"
          :class="BUCKET_HEADER_CLS[bucket.color]"
        >
          <span class="flex items-center gap-1.5">
            <AlertCircle v-if="bucket.color === 'red'" class="w-2.5 h-2.5" />
            <Clock v-else-if="bucket.color === 'amber'" class="w-2.5 h-2.5" />
            {{ bucket.label }}
          </span>
          <span class="opacity-60 normal-case tracking-normal text-[9px]">
            {{ bucket.entries.length }}
          </span>
        </div>

        <div class="divide-y divide-base-300">
          <div
            v-for="entry in bucket.entries"
            :key="entry.lead.id"
            class="px-3 py-2 hover:bg-base-200/50 transition-colors"
            :class="entry.isOverdue ? 'bg-red-500/5' : ''"
          >
            <div class="flex items-start gap-2">
              <!-- Time block -->
              <div class="shrink-0 w-14 text-right">
                <div
                  class="text-xs font-semibold tracking-tight leading-tight"
                  :class="entry.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-base-content'"
                >
                  {{ fmtTime(entry.callbackTime) }}
                </div>
                <div class="text-[9px] text-base-content/40 leading-tight mt-0.5">
                  {{ bucket.key === 'today' || bucket.key === 'next2h' || bucket.key === 'overdue'
                     ? fmtRelative(entry.callbackTime)
                     : fmtDate(entry.callbackTime) }}
                </div>
              </div>

              <!-- Lead info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-medium text-base-content truncate">
                    {{ entry.lead.fullName }}
                  </span>
                  <CrmStageBadge :stage="entry.lead.stage" size="xs" />
                </div>
                <div class="flex items-center gap-1.5 mt-0.5 text-[10px] text-base-content/50">
                  <span v-if="entry.lead.company" class="truncate">{{ entry.lead.company }}</span>
                  <span v-else>{{ entry.lead.phoneE164 }}</span>
                </div>
                <div class="flex items-center gap-1 mt-0.5 text-[9px] text-base-content/40">
                  <Globe class="w-2 h-2 shrink-0" />
                  <span>Lead local: {{ fmtLeadLocal(entry.lead) }}</span>
                </div>
                <div
                  v-if="!entry.callabilityCheck.ok"
                  class="mt-1 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1"
                >
                  <AlertCircle class="w-2.5 h-2.5 shrink-0" />
                  <span class="truncate">{{ entry.callabilityCheck.reason }}</span>
                </div>
              </div>

              <!-- Call button -->
              <button
                class="shrink-0 p-1.5 rounded text-green-600 hover:bg-green-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="auto.isCampaignActive.value || !entry.callabilityCheck.ok"
                :title="entry.callabilityCheck.ok ? `Call ${entry.lead.fullName} now` : entry.callabilityCheck.reason"
                @click="callLead(entry.lead)"
              >
                <Phone class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
