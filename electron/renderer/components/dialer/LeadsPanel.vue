<script setup lang="ts">
import { ref, computed } from 'vue'
import { Upload, Phone, Trash2, Play, Pause, Square, SkipForward, Search, AlertCircle, Settings as SettingsIcon, Target, Sprout, UserPlus } from 'lucide-vue-next'
import { useAutoDialer, type DialScope } from '../../composables/useAutoDialer'
import { useToast } from '../../composables/useToast'
import { useDialog } from '../../composables/useDialog'
import { useAddLead } from '../../composables/useAddLead'
import LeadStatusBadge from './LeadStatusBadge.vue'

const DIAL_SCOPES: { value: DialScope; label: string; description: string }[] = [
  { value: 'cold',        label: 'Cold',       description: 'Only fresh leads (never called, stage="Lead"). Best for pure prospecting.' },
  { value: 'uncontacted', label: 'Uncalled',   description: 'Any lead with zero prior calls.' },
  { value: 'pipeline',    label: 'Pipeline',   description: 'Every open lead (excluding closed-won/lost/DNC). Standard sales workflow.' },
  { value: 'callbacks',   label: 'Callbacks',  description: 'Only leads with a callback scheduled.' },
]

const auto = useAutoDialer()
const toast = useToast()
const dialog = useDialog()
const addLead = useAddLead()

const search = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const showSettings = ref(false)

// The list mirrors what the auto-dialer would pick: filtered by current scope.
// The currently-being-called lead is always kept visible even if it would
// otherwise drop out (e.g., its disposition just promoted it past the scope).
const filteredLeads = computed(() => {
  const inScope = auto.leadsInScope.value
  const callingId = auto.currentLeadId.value
  let pool = inScope
  if (callingId && !inScope.some(l => l.id === callingId)) {
    const calling = auto.leads.leads.value.find(l => l.id === callingId)
    if (calling) pool = [calling, ...inScope]
  }
  const q = search.value.trim().toLowerCase()
  if (!q) return pool
  return pool.filter(l =>
    l.fullName.toLowerCase().includes(q)
    || l.phoneE164.includes(q)
    || (l.company?.toLowerCase().includes(q) ?? false),
  )
})

const hiddenByScope = computed(() =>
  auto.leads.leads.value.length - auto.leadsInScope.value.length,
)

const scopeCounts = computed(() => {
  const all = auto.leads.dialableLeads.value
  return {
    cold:        all.filter(l => l.status === 'new' && l.stage === 'lead').length,
    uncontacted: all.filter(l => l.callCount === 0).length,
    pipeline:    all.length,
    callbacks:   all.filter(l => !!l.nextCallbackAt).length,
  }
})

function pickFile() {
  fileInput.value?.click()
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  try {
    const text = await file.text()
    const { leads, errors } = auto.leads.parseCsv(text)
    if (errors.length > 0 && leads.length === 0) {
      toast.error('CSV import failed', errors[0])
    } else {
      const { added, skippedDuplicates } = auto.leads.importParsed(leads)
      const parts = [`${added} added`]
      if (skippedDuplicates > 0) parts.push(`${skippedDuplicates} duplicates skipped`)
      if (errors.length > 0) parts.push(`${errors.length} rows skipped`)
      if (added > 0) toast.success(`Imported ${added} lead${added === 1 ? '' : 's'}`, parts.slice(1).join(' · ') || undefined)
      else toast.warning('No leads imported', parts.join(' · '))
    }
  } catch (err: any) {
    toast.error('Import failed', err?.message || String(err))
  } finally {
    importing.value = false
    input.value = ''
  }
}

function callLeadNow(id: string) {
  auto.dialLead(id)
}

// Memoize compliance check per render — keeps the template terse and
// avoids running the rolling-window scan four times per row.
const checkCache = new Map<string, ReturnType<typeof auto.compliance.isLeadCallableNow>>()
function leadCheck(lead: { id: string } & Parameters<typeof auto.compliance.isLeadCallableNow>[0]) {
  // Cache key includes call count so we recompute when a call completes.
  const key = `${lead.id}-${(lead as any).callCount}-${(lead as any).status}`
  if (!checkCache.has(key)) {
    if (checkCache.size > 200) checkCache.clear()
    checkCache.set(key, auto.compliance.isLeadCallableNow(lead))
  }
  return checkCache.get(key)!
}

async function removeLead(id: string) {
  const lead = auto.leads.leads.value.find(l => l.id === id)
  const ok = await dialog.confirm({
    title: 'Delete this lead?',
    message: lead?.fullName,
    destructive: true,
  })
  if (!ok) return
  auto.leads.removeLead(id)
  toast.info('Lead deleted', lead?.fullName)
}

async function clearAll() {
  const count = auto.leads.leads.value.length
  const ok = await dialog.confirm({
    title: `Delete all ${count} leads?`,
    message: 'This cannot be undone. Call history is preserved.',
    destructive: true,
    confirmLabel: 'Delete all',
  })
  if (!ok) return
  auto.leads.clearAll()
  toast.warning(`Cleared ${count} lead${count === 1 ? '' : 's'}`)
}

function seedDemo() {
  const added = auto.leads.seedDemoLeads()
  if (added === 0) {
    toast.info('Demo leads already loaded', 'Nothing to add')
  } else {
    toast.success(`Seeded ${added} demo leads`, 'Across pipeline stages + US timezones')
  }
}

function fmtPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toolbar -->
    <div class="px-3 py-2 border-b border-base-300 space-y-2">
      <!-- Stats + actions row -->
      <div class="flex items-center gap-2">
        <div class="flex-1 flex items-center gap-2 text-[10px] text-base-content/60">
          <span class="font-medium text-primary">{{ auto.leadsInScope.value.length }} in scope</span>
          <span class="text-base-content/30">·</span>
          <span>{{ auto.leads.stats.value.total }} total</span>
          <span v-if="auto.leads.stats.value.callbacks > 0" class="text-amber-600 dark:text-amber-400">
            · {{ auto.leads.stats.value.callbacks }} callbacks
          </span>
        </div>
        <button
          class="p-1 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
          title="Settings"
          @click="showSettings = !showSettings"
        >
          <SettingsIcon class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
          title="Add lead"
          @click="addLead.open({ source: 'dialer' })"
        >
          <UserPlus class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors"
          title="Import CSV"
          @click="pickFile"
          :disabled="importing"
        >
          <Upload class="w-3.5 h-3.5" />
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,text/csv"
          class="hidden"
          @change="onFileChosen"
        />
      </div>

      <!-- Settings popover -->
      <div v-if="showSettings" class="border border-base-300 rounded p-2 space-y-3 bg-base-200/40">
        <!-- Preview countdown -->
        <div>
          <div class="text-[10px] uppercase tracking-wider text-base-content/50 mb-1">
            Preview countdown
          </div>
          <div class="flex items-center gap-1 text-[10px] text-base-content/60">
            <input
              type="number" min="3" max="10"
              v-model.number="auto.previewCountdownSeconds.value"
              class="w-12 px-1 py-0.5 rounded border border-base-300 bg-base-100 text-center"
            />
            <span>seconds before each call in Preview mode</span>
          </div>
        </div>

        <!-- Legal floor (locked) -->
        <div class="border-t border-base-300 pt-2 space-y-2">
          <div class="text-[10px] uppercase tracking-wider text-base-content/50 flex items-center gap-1">
            <span>Legal floor</span>
            <span class="text-[8px] font-normal opacity-60">(TCPA — required)</span>
          </div>

          <div class="flex items-center gap-1 text-[10px] text-base-content/60">
            <span class="w-20">Quiet hours:</span>
            <input
              type="number" min="0" max="23"
              v-model.number="auto.compliance.callWindowStart.value"
              class="w-10 px-1 py-0.5 rounded border border-base-300 bg-base-100 text-center"
            />
            <span>to</span>
            <input
              type="number" min="0" max="23"
              v-model.number="auto.compliance.callWindowEnd.value"
              class="w-10 px-1 py-0.5 rounded border border-base-300 bg-base-100 text-center"
            />
            <span class="text-base-content/40">lead local</span>
          </div>

          <label class="flex items-center gap-2 text-[10px] text-base-content/70">
            <input type="checkbox" v-model="auto.compliance.enforceLeadTimezone.value" class="w-3 h-3" />
            Enforce in lead's timezone
          </label>
          <p class="text-[9px] text-base-content/40 italic leading-tight">
            DNC is always blocked. Lead-local quiet hours protect you from TCPA fines.
          </p>
        </div>

        <!-- Team policy (optional) -->
        <div class="border-t border-base-300 pt-2 space-y-2">
          <div class="text-[10px] uppercase tracking-wider text-base-content/50 flex items-center gap-1">
            <span>Team policy</span>
            <span class="text-[8px] font-normal opacity-60">(optional — 0 = off)</span>
          </div>

          <div class="flex items-center gap-1 text-[10px] text-base-content/60">
            <span class="w-20">Max attempts:</span>
            <input
              type="number" min="0" max="20"
              v-model.number="auto.compliance.maxAttemptsPer30Days.value"
              class="w-10 px-1 py-0.5 rounded border border-base-300 bg-base-100 text-center"
            />
            <span class="text-base-content/40">per 30 days · 0 = unlimited</span>
          </div>

          <div class="flex items-center gap-1 text-[10px] text-base-content/60">
            <span class="w-20">Cool-down:</span>
            <input
              type="number" min="0" max="168"
              v-model.number="auto.compliance.cooldownHours.value"
              class="w-10 px-1 py-0.5 rounded border border-base-300 bg-base-100 text-center"
            />
            <span class="text-base-content/40">hours · 0 = off</span>
          </div>

          <label class="flex items-center gap-2 text-[10px] text-base-content/70">
            <input type="checkbox" v-model="auto.businessHoursEnabled.value" class="w-3 h-3" />
            Enforce my local hours
          </label>
          <div v-if="auto.businessHoursEnabled.value" class="flex items-center gap-1 text-[10px] text-base-content/60">
            <input
              type="number" min="0" max="23"
              v-model.number="auto.businessHoursStart.value"
              class="w-10 px-1 py-0.5 rounded border border-base-300 bg-base-100 text-center"
            />
            <span>to</span>
            <input
              type="number" min="0" max="23"
              v-model.number="auto.businessHoursEnd.value"
              class="w-10 px-1 py-0.5 rounded border border-base-300 bg-base-100 text-center"
            />
            <span class="text-base-content/40">(agent local)</span>
          </div>
        </div>

        <div class="border-t border-base-300 pt-2 space-y-1">
          <button
            class="w-full text-[10px] py-1 rounded text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
            @click="seedDemo"
          >
            <Sprout class="w-3 h-3" />
            Seed demo leads
          </button>
          <button
            v-if="auto.leads.stats.value.total > 0"
            class="w-full text-[10px] py-1 rounded text-red-500 hover:bg-red-500/5 transition-colors"
            @click="clearAll"
          >
            Clear all leads
          </button>
        </div>
      </div>

      <!-- Dial scope selector -->
      <div>
        <div class="text-[9px] uppercase tracking-wider text-base-content/40 mb-1">Auto-dial scope</div>
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="opt in DIAL_SCOPES"
            :key="opt.value"
            class="text-[9px] py-1 rounded border transition-colors leading-tight"
            :class="auto.dialScope.value === opt.value
              ? 'border-primary bg-primary/10 text-primary font-medium'
              : 'border-base-300 text-base-content/50 hover:border-base-content/30'"
            :title="opt.description"
            @click="auto.dialScope.value = opt.value"
          >
            {{ opt.label }}
            <div class="text-[8px] font-normal opacity-60 mt-0.5">{{ scopeCounts[opt.value] }}</div>
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="relative">
        <Search class="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-base-content/30" />
        <input
          v-model="search"
          type="text"
          placeholder="Search name, phone, company"
          class="w-full text-xs pl-6 pr-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
        />
      </div>

      <!-- Scope hint when leads are hidden -->
      <div v-if="hiddenByScope > 0" class="text-[10px] text-base-content/40 leading-tight">
        Showing {{ auto.leadsInScope.value.length }} of {{ auto.leads.leads.value.length }} leads —
        {{ hiddenByScope }} hidden by <span class="font-medium">{{ auto.dialScope.value }}</span> scope
        (closed deals, DNC, or out-of-scope stages).
        <span class="text-base-content/30">View all in the CRM tab.</span>
      </div>

      <!-- Campaign controls — split mode buttons when idle, transport when active -->
      <div v-if="!auto.isCampaignActive.value" class="grid grid-cols-2 gap-2">
        <button
          class="flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 rounded bg-green-500 hover:bg-green-600 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="auto.leadsInScope.value.length === 0"
          title="Auto-dial next lead immediately after each disposition"
          @click="auto.startCampaign('power')"
        >
          <Play class="w-3 h-3" fill="currentColor" /> Power Dial
        </button>
        <button
          class="flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 rounded bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="auto.leadsInScope.value.length === 0"
          :title="`Show each lead for ${auto.previewCountdownSeconds.value}s before dialing`"
          @click="auto.startCampaign('preview')"
        >
          <Target class="w-3 h-3" /> Preview Dial
        </button>
      </div>

      <div v-else class="flex items-center gap-1">
        <button
          v-if="auto.state.value !== 'paused'"
          class="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white transition-colors"
          @click="auto.pauseCampaign()"
        >
          <Pause class="w-3 h-3" /> Pause
        </button>
        <button
          v-else
          class="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded bg-green-500 hover:bg-green-600 text-white transition-colors"
          @click="auto.resumeCampaign()"
        >
          <Play class="w-3 h-3" /> Resume {{ auto.pacingMode.value }}
        </button>
        <button
          class="flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded bg-base-200 hover:bg-base-300 text-base-content transition-colors"
          @click="auto.stopCampaign()"
          title="Stop campaign"
        >
          <Square class="w-3 h-3" />
        </button>
        <button
          v-if="auto.state.value === 'previewing'"
          class="flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          @click="auto.skipPreview()"
          title="Dial now (skip countdown)"
        >
          <SkipForward class="w-3 h-3" />
        </button>
      </div>

      <!-- Errors / hints -->
      <div v-if="auto.lastError.value" class="text-[10px] text-red-500 flex items-start gap-1">
        <AlertCircle class="w-3 h-3 shrink-0 mt-0.5" />
        <span>{{ auto.lastError.value }}</span>
      </div>
      <div v-if="auto.state.value === 'previewing'" class="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
        <Target class="w-2.5 h-2.5" />
        Calling next in {{ auto.previewSecondsLeft.value }}s — {{ auto.currentLead.value?.fullName }}
      </div>
    </div>

    <!-- Lead list -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredLeads.length === 0 && auto.leads.leads.value.length === 0" class="p-6 text-center">
        <Upload class="w-8 h-8 mx-auto mb-2 text-base-content/20" />
        <p class="text-xs text-base-content/50">No leads yet.</p>
        <p class="text-[10px] text-base-content/40 mt-1">
          Upload a CSV with <code class="text-[10px]">name</code> + <code class="text-[10px]">phone</code> columns.
        </p>
      </div>

      <div v-else-if="filteredLeads.length === 0" class="p-6 text-center">
        <AlertCircle class="w-7 h-7 mx-auto mb-2 text-base-content/20" />
        <p class="text-xs text-base-content/50">
          No leads in <span class="font-medium text-primary">{{ auto.dialScope.value }}</span> scope
          <span v-if="search">matching "{{ search }}"</span>.
        </p>
        <p class="text-[10px] text-base-content/40 mt-1">
          Try widening the scope to <button class="underline hover:text-primary" @click="auto.dialScope.value = 'pipeline'">Pipeline</button>
          to see all open leads.
        </p>
      </div>

      <div v-else class="divide-y divide-base-300">
        <div
          v-for="lead in filteredLeads"
          :key="lead.id"
          class="px-3 py-2 hover:bg-base-200/60 transition-colors group"
          :class="auto.currentLeadId.value === lead.id ? 'bg-primary/5' : ''"
        >
          <div class="flex items-center gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-base-content truncate">{{ lead.fullName }}</span>
                <LeadStatusBadge :status="lead.status" size="xs" />
              </div>
              <div class="flex items-center gap-2 text-[10px] text-base-content/50 mt-0.5">
                <span>{{ fmtPhone(lead.phoneE164) }}</span>
                <span v-if="lead.company" class="truncate">· {{ lead.company }}</span>
                <span v-if="lead.callCount > 0">· {{ lead.callCount }} call{{ lead.callCount > 1 ? 's' : '' }}</span>
              </div>
              <!-- Compliance hint: only render when blocked -->
              <div
                v-if="leadCheck(lead) && !leadCheck(lead).ok"
                class="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1"
                :title="leadCheck(lead).reason"
              >
                <AlertCircle class="w-2.5 h-2.5 shrink-0" />
                <span class="truncate">{{ leadCheck(lead).reason }}</span>
              </div>
              <!-- Lead-local time (only when enforcing TZ) -->
              <div
                v-else-if="auto.compliance.enforceLeadTimezone.value"
                class="text-[10px] text-base-content/40 mt-0.5"
              >
                Lead local: {{ auto.compliance.formatLeadLocalTime(lead) }}
              </div>
            </div>

            <button
              class="p-1.5 rounded text-green-600 hover:bg-green-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="auto.isCampaignActive.value || !!(leadCheck(lead) && !leadCheck(lead).ok)"
              :title="leadCheck(lead).ok ? 'Call now' : leadCheck(lead).reason"
              @click="callLeadNow(lead.id)"
            >
              <Phone class="w-3.5 h-3.5" />
            </button>

            <button
              class="p-1 rounded text-base-content/30 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
              title="Delete lead"
              @click="removeLead(lead.id)"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
