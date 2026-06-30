<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Building2, Mail, Phone, PhoneCall, DollarSign, Percent, Trash2,
  ChevronRight, Sparkles, Save, Copy, Check, MapPin, Globe, Clock,
  TrendingUp, Edit3, X, Trophy, Mic, GripVertical, RotateCcw,
} from 'lucide-vue-next'
import { useLeads, STAGE_ORDER, STAGE_LABEL, type Lead, type LeadStage } from '../../composables/useLeads'
import { useCallLog } from '../../composables/useCallLog'
import { useToast } from '../../composables/useToast'
import { useDialog } from '../../composables/useDialog'
import { useBroadcast } from '../../composables/useBroadcast'
import { useCompliance } from '../../composables/useCompliance'
import CrmStageBadge from './CrmStageBadge.vue'
import LeadTimelineSection from './LeadTimelineSection.vue'
import LeadTasksSection from './LeadTasksSection.vue'
import PresenceAvatars from '../presence/PresenceAvatars.vue'
import HexAvatar from '../HexAvatar.vue'
import { usePresence } from '../../composables/usePresence'
import { useProfiles } from '../../composables/useProfiles'
import { useSortableLayout } from '../../composables/useSortableLayout'

const props = defineProps<{ lead: Lead }>()
const emit = defineEmits<{ (e: 'delete', id: string): void }>()

const leads = useLeads()
const callLog = useCallLog()
const toast = useToast()
const dialog = useDialog()
const broadcast = useBroadcast()
const compliance = useCompliance()

// ── Computed status ─────────────────────────────────────────
const callabilityCheck = computed(() => compliance.isLeadCallableNow(props.lead))
const attemptsThisPeriod = computed(() => compliance.attemptsPer30Days(props.lead.id))
const leadLocalTime = computed(() => compliance.formatLeadLocalTime(props.lead))
const leadTimezone = computed(() => compliance.leadTimezone(props.lead))
const leadTzShort = computed(() =>
  leadTimezone.value.split('/').pop()?.replace('_', ' ') ?? leadTimezone.value,
)
const daysInStage = computed(() =>
  props.lead.stageChangedAt
    ? Math.round((Date.now() - new Date(props.lead.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0,
)
const callsForLead = computed(() => callLog.callsForLead(props.lead.id))

// Group calls into Today / Yesterday / Earlier so the column shares its
// visual rhythm with the Timeline column to the right.
function _callDayBucket(iso: string): 'today' | 'yesterday' | 'earlier' {
  const t = new Date(iso); t.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - t.getTime()) / 86400000
  if (diff <= 0) return 'today'
  if (diff < 2) return 'yesterday'
  return 'earlier'
}
const _CALL_BUCKET_LABEL = { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' } as const

const callGroups = computed(() => {
  const buckets: Record<string, typeof callsForLead.value> = { today: [], yesterday: [], earlier: [] }
  for (const c of callsForLead.value) {
    buckets[_callDayBucket(c.startedAt)].push(c)
  }
  return (['today', 'yesterday', 'earlier'] as const)
    .filter(k => buckets[k].length > 0)
    .map(k => ({ key: k, label: _CALL_BUCKET_LABEL[k], calls: buckets[k] }))
})

// Avatar initials + deterministic gradient
const initials = computed(() => {
  const parts = props.lead.fullName.split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
})
const avatarGradient = computed(() => {
  let h = 0
  for (const c of props.lead.fullName) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const hue1 = h % 360
  const hue2 = (hue1 + 50) % 360
  return `linear-gradient(135deg, hsl(${hue1} 65% 55%), hsl(${hue2} 70% 50%))`
})

// ── Edit drafts ────────────────────────────────────────────
const draftName = ref(props.lead.fullName)
const draftPhone = ref(props.lead.phoneE164)
const draftEmail = ref(props.lead.email ?? '')
const draftCompany = ref(props.lead.company ?? '')
const draftNotes = ref(props.lead.notes ?? '')
const draftDealValue = ref(props.lead.dealValueCents ? (props.lead.dealValueCents / 100).toString() : '')
const draftProbability = ref(props.lead.closeProbability?.toString() ?? '')

const editingContact = ref(false)
const notesExpanded = ref(false)

function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '')
  return '+' + trimmed.replace(/\D/g, '')
}

// ── Multiplayer presence on this lead ──
// What field this user is currently typing in (notes / company / etc.).
// Broadcast through Supabase Presence so other clients viewing this lead
// see "Sarah editing notes" badges in real time.
const focusedField = ref<string | null>(null)
const presence = usePresence(
  computed(() => `lead:${props.lead.id}`).value,
  () => ({ leadId: props.lead.id, editingField: focusedField.value }),
)

const profilesStore = useProfiles()

function othersEditing(field: string): { name: string } | null {
  const other = presence.others.value.find(u => u.editingField === field)
  if (!other) return null
  // Prefer the presence payload's fullName; fall back to the profile cache
  // so other users always show a real name, not just an email username.
  const name = other.fullName
    || profilesStore.displayName(other.userId, other.email ? other.email.split('@')[0] : 'Someone')
  return { name }
}

// Reset focused-field on lead switch (mirrors the existing drafts reset)
watch(() => props.lead.id, () => {
  focusedField.value = null
})

watch(() => props.lead.id, () => {
  draftName.value = props.lead.fullName
  draftPhone.value = props.lead.phoneE164
  draftEmail.value = props.lead.email ?? ''
  draftCompany.value = props.lead.company ?? ''
  draftNotes.value = props.lead.notes ?? ''
  draftDealValue.value = props.lead.dealValueCents ? (props.lead.dealValueCents / 100).toString() : ''
  draftProbability.value = props.lead.closeProbability?.toString() ?? ''
  editingContact.value = false
})

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Deal — computed weighted ──────────────────────────────
const weightedDeal = computed(() => {
  const v = parseFloat(draftDealValue.value || '0') || 0
  const p = parseInt(draftProbability.value || '0', 10) || 0
  return Math.round(v * p / 100)
})
const PROB_PRESETS = [25, 50, 75, 90]
function setProbability(p: number) {
  draftProbability.value = p.toString()
}

// ── Helpers ───────────────────────────────────────────────
function fmtMoney(value: number): string {
  if (!value) return '$0'
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}
function fmtPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `Today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
function fmtTimeUntil(iso: string): { label: string; overdue: boolean; absolute: string } {
  const d = new Date(iso)
  const ms = d.getTime() - Date.now()
  const overdue = ms < 0
  const absM = Math.round(Math.abs(ms) / 60000)
  let label: string
  if (absM < 60) label = overdue ? `${absM}m overdue` : `in ${absM}m`
  else {
    const absH = Math.round(absM / 60)
    if (absH < 24) label = overdue ? `${absH}h overdue` : `in ${absH}h`
    else {
      const absD = Math.round(absH / 24)
      label = overdue ? `${absD}d overdue` : `in ${absD}d`
    }
  }
  return {
    label,
    overdue,
    absolute: d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }
}

const copiedField = ref<string | null>(null)
async function copyField(value: string, key: string) {
  try {
    await navigator.clipboard.writeText(value)
    copiedField.value = key
    setTimeout(() => { if (copiedField.value === key) copiedField.value = null }, 1500)
  } catch {
    toast.error('Copy failed')
  }
}

// ── Actions ───────────────────────────────────────────────
function callLead() {
  const check = callabilityCheck.value
  if (!check.ok) {
    toast.warning(check.reason, props.lead.fullName)
    return
  }
  broadcast.send({ type: 'dial:request', leadId: props.lead.id })
  toast.info('Calling…', `Opening dialer for ${props.lead.fullName}`)
}

function saveContact() {
  const phone = normalizePhone(draftPhone.value)
  leads.updateLead(props.lead.id, {
    fullName: draftName.value.trim() || props.lead.fullName,
    phoneE164: phone || props.lead.phoneE164,
    email: draftEmail.value.trim() || undefined,
    company: draftCompany.value.trim() || undefined,
    notes: draftNotes.value.trim() || undefined,
  })
  toast.success('Contact saved', draftName.value.trim() || props.lead.fullName)
  editingContact.value = false
}

function cancelContact() {
  draftName.value = props.lead.fullName
  draftPhone.value = props.lead.phoneE164
  draftEmail.value = props.lead.email ?? ''
  draftCompany.value = props.lead.company ?? ''
  draftNotes.value = props.lead.notes ?? ''
  editingContact.value = false
}

function saveDeal() {
  const valueCents = draftDealValue.value
    ? Math.round(parseFloat(draftDealValue.value) * 100)
    : undefined
  const prob = draftProbability.value ? parseInt(draftProbability.value, 10) : undefined
  leads.updateLead(props.lead.id, {
    dealValueCents: Number.isFinite(valueCents) ? valueCents : undefined,
    closeProbability: prob !== undefined && prob >= 0 && prob <= 100 ? prob : undefined,
  })
  const parts: string[] = []
  if (valueCents) parts.push(`$${(valueCents / 100).toFixed(0)}`)
  if (prob !== undefined) parts.push(`${prob}% close`)
  toast.success('Deal updated', parts.join(' · ') || undefined)
}

// Next-action handling moved into LeadTasksSection — the top task in that
// list IS the next action. Reps reorder by drag, no separate form needed.

async function moveToStage(stage: LeadStage) {
  if (stage === 'closed-lost') {
    const reason = await dialog.prompt({
      title: 'Mark as Lost',
      message: `Reason for losing the deal with ${props.lead.fullName}?`,
      placeholder: 'e.g. Went with competitor, budget cut',
      confirmLabel: 'Mark Lost',
    })
    if (reason === null) return
    leads.setStage(props.lead.id, stage, { wonLostReason: reason || undefined })
    toast.warning('Marked as Lost', reason || 'No reason given')
  } else if (stage === 'closed-won') {
    leads.setStage(props.lead.id, stage)
    toast.success('Deal won', props.lead.fullName)
  } else {
    leads.setStage(props.lead.id, stage)
    toast.success(`Moved to ${STAGE_LABEL[stage]}`, props.lead.fullName)
  }
}

function nextStage(): LeadStage | null {
  const i = STAGE_ORDER.indexOf(props.lead.stage)
  const advanceable = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf('closed-won'))
  if (i === -1 || i >= advanceable.length - 1) return null
  return advanceable[i + 1] ?? null
}
const next = computed(() => nextStage())

const showDealSection = computed(() =>
  props.lead.stage !== 'lead' && props.lead.stage !== 'contacted',
)

// ── Sortable layout ─────────────────────────────────────────
// Each rep can drag sections vertically to their preferred order.
// Order is per-user (localStorage), independent per machine.
const sortableContainerRef = ref<HTMLElement | null>(null)
const SECTION_DEFAULT_ORDER = ['callable', 'action-deal', 'main-grid', 'ai']
const { order: sectionOrder, isCustomized, reset: resetLayout } = useSortableLayout({
  containerRef: sortableContainerRef,
  storageKey: 'hivemind.crm.lead-detail.layout.v1',
  defaultOrder: SECTION_DEFAULT_ORDER,
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-base-100">
    <!-- ── HEADER ────────────────────────────────────────── -->
    <div class="px-5 py-4 border-b border-base-300 sticky top-0 bg-base-100/95 backdrop-blur-sm z-10">
      <div class="flex items-start gap-3">
        <!-- Avatar -->
        <HexAvatar :label="initials" :fill="avatarGradient" :size="48" :font-size="16" :title="lead.fullName" />

        <div class="flex-1 min-w-0">
          <!-- VIEW MODE -->
          <template v-if="!editingContact">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-base font-semibold text-base-content leading-tight">{{ lead.fullName }}</h2>
              <CrmStageBadge :stage="lead.stage" size="xs" />
              <span class="text-[10px] text-base-content/40">{{ daysInStage }}d in stage</span>
              <button
                class="text-base-content/30 hover:text-primary p-0.5 rounded transition-colors"
                title="Edit contact"
                @click="editingContact = true"
              >
                <Edit3 class="w-3 h-3" />
              </button>
            </div>

            <!-- Contact chips — click to copy -->
            <div class="flex items-center gap-2 mt-1.5 flex-wrap">
              <button
                class="group flex items-center gap-1 text-[11px] font-mono text-base-content/70 hover:text-primary transition-colors"
                :title="`Copy ${lead.phoneE164}`"
                @click="copyField(lead.phoneE164, 'phone')"
              >
                <Phone class="w-2.5 h-2.5 shrink-0" />
                {{ fmtPhone(lead.phoneE164) }}
                <component
                  :is="copiedField === 'phone' ? Check : Copy"
                  class="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  :class="copiedField === 'phone' ? 'opacity-100 text-green-500' : ''"
                />
              </button>
              <span v-if="lead.company" class="flex items-center gap-1 text-[11px] text-base-content/60">
                <Building2 class="w-2.5 h-2.5" />
                {{ lead.company }}
              </span>
              <button
                v-if="lead.email"
                class="group flex items-center gap-1 text-[11px] text-base-content/70 hover:text-primary transition-colors max-w-[180px]"
                :title="`Copy ${lead.email}`"
                @click="copyField(lead.email!, 'email')"
              >
                <Mail class="w-2.5 h-2.5 shrink-0" />
                <span class="truncate">{{ lead.email }}</span>
                <component
                  :is="copiedField === 'email' ? Check : Copy"
                  class="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  :class="copiedField === 'email' ? 'opacity-100 text-green-500' : ''"
                />
              </button>
            </div>

            <!-- Notes preview / expand -->
            <div v-if="lead.notes" class="mt-2 text-[11px] text-base-content/70 leading-relaxed">
              <div :class="notesExpanded ? '' : 'line-clamp-1'">{{ lead.notes }}</div>
              <button
                v-if="lead.notes.length > 80"
                class="text-[10px] text-primary hover:underline mt-0.5"
                @click="notesExpanded = !notesExpanded"
              >
                {{ notesExpanded ? 'show less' : 'show more' }}
              </button>
            </div>
            <button
              v-else
              class="mt-2 text-[10px] text-base-content/40 hover:text-primary italic transition-colors"
              @click="editingContact = true"
            >
              + Add notes about this lead
            </button>
          </template>

          <!-- EDIT MODE -->
          <template v-else>
            <div class="flex items-center gap-2 flex-wrap">
              <input
                v-model="draftName"
                type="text"
                placeholder="Full name"
                class="flex-1 min-w-[120px] text-base font-semibold px-2 py-1 rounded border border-primary/50 bg-base-100 focus:border-primary focus:outline-none"
              />
              <CrmStageBadge :stage="lead.stage" size="xs" />
            </div>

            <div class="grid grid-cols-2 gap-1.5 mt-2">
              <input
                v-model="draftPhone"
                type="tel"
                placeholder="+1 555…"
                class="text-[11px] font-mono px-2 py-1 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              />
              <input
                v-model="draftCompany"
                type="text"
                placeholder="Company"
                class="text-[11px] px-2 py-1 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              />
            </div>
            <input
              v-model="draftEmail"
              type="email"
              placeholder="Email"
              class="w-full mt-1.5 text-[11px] px-2 py-1 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
            />
            <div class="relative mt-1.5">
              <textarea
                v-model="draftNotes"
                rows="3"
                placeholder="Lead background, source context, important details…"
                class="w-full text-[11px] px-2 py-1.5 rounded border bg-base-100 focus:outline-none resize-none transition-colors"
                :class="othersEditing('notes')
                  ? 'border-amber-500/50 ring-1 ring-amber-500/30'
                  : 'border-base-300 focus:border-primary'"
                @focus="focusedField = 'notes'"
                @blur="focusedField = null"
              ></textarea>
              <div
                v-if="othersEditing('notes')"
                class="absolute -top-2 right-2 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-semibold uppercase tracking-wider shadow-sm flex items-center gap-1"
              >
                <span class="w-1 h-1 rounded-full bg-white animate-pulse"></span>
                {{ othersEditing('notes')!.name }} editing
              </div>
            </div>
            <div class="flex items-center gap-1.5 mt-2">
              <button
                class="text-[11px] px-2.5 py-1 rounded bg-primary text-white hover:bg-primary/90 transition-colors flex items-center gap-1"
                @click="saveContact"
              >
                <Save class="w-2.5 h-2.5" /> Save
              </button>
              <button
                class="text-[11px] px-2.5 py-1 rounded text-base-content/50 hover:text-base-content transition-colors"
                @click="cancelContact"
              >
                Cancel
              </button>
            </div>
          </template>
        </div>

        <div class="shrink-0 flex items-center gap-2">
          <PresenceAvatars
            v-if="presence.others.value.length > 0"
            :users="presence.others.value"
            size="sm"
            hide-when-empty
          />
          <button
            class="text-base-content/30 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded transition-colors"
            title="Delete lead"
            @click="emit('delete', lead.id)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-1.5 mt-3 flex-wrap">
        <button
          class="text-xs px-3 py-1.5 rounded-md bg-green-500 text-white hover:bg-green-600 font-medium transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          :disabled="!callabilityCheck.ok"
          :title="callabilityCheck.ok ? 'Call now' : callabilityCheck.reason"
          @click="callLead"
        >
          <PhoneCall class="w-3 h-3" fill="currentColor" />
          Call now
        </button>
        <button
          v-if="next"
          class="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors flex items-center gap-1"
          @click="moveToStage(next)"
        >
          <ChevronRight class="w-3 h-3" />
          Move to {{ STAGE_LABEL[next] }}
        </button>
        <button
          v-if="lead.stage !== 'closed-won'"
          class="text-xs px-2.5 py-1.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 font-medium transition-colors flex items-center gap-1"
          @click="moveToStage('closed-won')"
        >
          <Trophy class="w-3 h-3" />
          Won
        </button>
        <button
          v-if="lead.stage !== 'closed-lost'"
          class="text-xs px-2.5 py-1.5 rounded-md text-base-content/50 hover:bg-red-500/10 hover:text-red-500 transition-colors"
          @click="moveToStage('closed-lost')"
        >
          Lost
        </button>
      </div>
    </div>

    <!-- ── BODY ──────────────────────────────────────────── -->
    <div class="px-5 py-4 space-y-5">

      <!-- Sortable container — each rep can drag sections to their preferred order -->
      <div ref="sortableContainerRef" class="space-y-5">
        <template v-for="sectionKey in sectionOrder" :key="sectionKey">

      <!-- ─── 1. CALLABLE STATUS ─── -->
      <div v-if="sectionKey === 'callable'" class="sortable-section group/section relative" :data-section="sectionKey">
        <button
          class="section-drag-handle absolute -left-4 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover/section:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical class="w-3 h-3 text-base-content/60" />
        </button>

      <!-- 1. CALLABLE STATUS — single muted inline line.
           "Hold off" is operational metadata; the disabled Call Now button
           carries the actual constraint. We don't need to shout it. -->
      <section
        class="flex items-center gap-2 px-1 text-[11px] leading-relaxed"
        :class="callabilityCheck.ok
          ? 'text-base-content/55'
          : 'text-amber-700 dark:text-amber-400/90'"
      >
        <Clock class="w-3 h-3 shrink-0" />
        <span class="font-medium">
          {{ callabilityCheck.ok ? 'Callable' : 'Hold off' }}
        </span>
        <span class="text-base-content/40">·</span>
        <span>{{ leadLocalTime }} lead local</span>
        <span class="text-base-content/40">·</span>
        <span class="flex items-center gap-0.5">
          <MapPin class="w-2.5 h-2.5" />
          {{ leadTzShort }}
        </span>
        <template v-if="callabilityCheck.ok">
          <span class="text-base-content/40">·</span>
          <span>
            <span class="font-semibold">{{ attemptsThisPeriod }}</span><span class="text-base-content/40">/{{ compliance.maxAttemptsPer30Days.value || '∞' }}</span> attempts/30d
          </span>
          <template v-if="lead.source">
            <span class="text-base-content/40">·</span>
            <span class="truncate">via {{ lead.source }}</span>
          </template>
        </template>
        <template v-else>
          <span class="text-base-content/40">·</span>
          <span class="truncate">{{ callabilityCheck.reason }}</span>
        </template>
      </section>
      </div>
      <!-- /callable -->

      <!-- ─── 2. NEXT ACTION + DEAL ─── -->
      <div v-else-if="sectionKey === 'action-deal'" class="sortable-section group/section relative" :data-section="sectionKey">
        <button
          class="section-drag-handle absolute -left-4 top-2 p-1 rounded opacity-0 group-hover/section:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical class="w-3 h-3 text-base-content/60" />
        </button>

      <!-- Next Action removed — the top task in the Tasks section IS the next action. -->

      <!-- 3. DEAL — value + probability + inline weighted preview -->
      <section v-if="showDealSection">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50">Deal</h3>
        </div>
        <div class="border border-base-300 rounded-lg p-3 space-y-2">
          <!-- Inputs + Save sit on one row so commit is right next to where the eye lands -->
          <div class="flex items-stretch gap-2">
            <div class="relative flex-1 min-w-0">
              <DollarSign class="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-base-content/30" />
              <input
                v-model="draftDealValue"
                type="number" step="100" min="0"
                placeholder="Value"
                class="w-full text-xs pl-6 pr-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              />
            </div>
            <div class="relative flex-1 min-w-0">
              <Percent class="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-base-content/30" />
              <input
                v-model="draftProbability"
                type="number" min="0" max="100"
                placeholder="% close"
                class="w-full text-xs pl-6 pr-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              />
            </div>
            <button
              class="text-[10px] px-2.5 rounded bg-primary text-white hover:bg-primary/90 transition-colors flex items-center gap-1 shrink-0"
              @click="saveDeal"
            >
              <Save class="w-2.5 h-2.5" /> Save
            </button>
          </div>
          <!-- Inline weighted preview — sits right under the % field, no eye travel -->
          <div v-if="weightedDeal > 0" class="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 pl-1">
            <TrendingUp class="w-2.5 h-2.5" />
            <span class="text-base-content/40">→</span>
            <span class="font-semibold">{{ fmtMoney(weightedDeal) }}</span>
            <span class="text-base-content/40 font-normal">weighted</span>
          </div>
          <!-- Probability presets — 25/50/75/90 + Mark Won for one-click close -->
          <div class="flex items-center gap-1">
            <span class="text-[9px] uppercase tracking-wider text-base-content/40 mr-1">Quick:</span>
            <button
              v-for="p in PROB_PRESETS"
              :key="p"
              class="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              :class="parseInt(draftProbability) === p
                ? 'bg-primary/15 text-primary font-semibold'
                : 'bg-base-200 text-base-content/60 hover:bg-base-300'"
              @click="setProbability(p)"
            >{{ p }}%</button>
            <button
              class="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 font-semibold transition-colors flex items-center gap-0.5"
              title="Mark this deal as Won"
              @click="moveToStage('closed-won')"
            >
              <Trophy class="w-2.5 h-2.5" /> Mark Won
            </button>
          </div>
          <div v-if="lead.wonLostReason" class="text-[10px] text-base-content/60 italic pt-1 border-t border-base-300/50">
            <span class="text-base-content/40">Reason:</span> {{ lead.wonLostReason }}
          </div>
        </div>
      </section>

      </div>
      <!-- /deal sortable section -->

      <!-- ─── 3. MAIN GRID (Call History + Tasks + Timeline) ─── -->
      <div v-else-if="sectionKey === 'main-grid'" class="sortable-section group/section relative" :data-section="sectionKey">
        <button
          class="section-drag-handle absolute -left-4 top-2 p-1 rounded opacity-0 group-hover/section:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical class="w-3 h-3 text-base-content/60" />
        </button>

      <!-- 4+5+6. CALL HISTORY + TASKS + TIMELINE — 3-column grid (Contact is now in the header) -->
      <div class="grid grid-cols-3 gap-3">
        <!-- Call history -->
        <section class="min-w-0">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 flex items-center gap-1">
              <PhoneCall class="w-3 h-3" />
              Call history
              <span class="font-normal opacity-60">· {{ callsForLead.length }}</span>
            </h3>
          </div>

          <div v-if="callsForLead.length === 0" class="text-[11px] text-base-content/40 italic px-2 py-3 border border-dashed border-base-300 rounded-lg text-center">
            No calls yet.
          </div>

          <div v-else class="border border-base-300 rounded-lg overflow-hidden">
            <template v-for="group in callGroups" :key="group.key">
              <!-- Day bucket header — matches Timeline column's rhythm -->
              <div class="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-base-content/40 bg-base-200/40 border-b border-base-300 flex items-center justify-between">
                <span>{{ group.label }}</span>
                <span class="font-normal opacity-70">{{ group.calls.length }}</span>
              </div>

              <div
                v-for="call in group.calls"
                :key="call.id"
                class="px-2 py-1.5 border-b border-base-300 last:border-b-0 hover:bg-base-200/40 transition-colors"
              >
                <div class="flex items-center gap-1.5 text-[10px]">
                  <!-- Disposition dot — replaces the old vertical timeline rail -->
                  <span
                    class="w-1.5 h-1.5 rounded-full shrink-0"
                    :class="call.disposition === 'contacted'   ? 'bg-emerald-500'
                          : call.disposition === 'callback'    ? 'bg-amber-500'
                          : call.disposition === 'voicemail'   ? 'bg-purple-500'
                          : call.disposition === 'dnc'         ? 'bg-red-500'
                          : 'bg-base-300'"
                  ></span>
                  <span class="font-medium text-base-content truncate">{{ fmtDate(call.startedAt) }}</span>
                  <span class="text-base-content/40 shrink-0">·</span>
                  <span class="text-base-content/60 tabular-nums shrink-0">{{ fmtDuration(call.durationSec) }}</span>
                  <span
                    v-if="call.disposition"
                    class="ml-auto text-[9px] tracking-wider px-1 py-0.5 rounded font-medium shrink-0"
                    :class="call.disposition === 'contacted'      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : call.disposition === 'callback'       ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : call.disposition === 'voicemail'      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                          : call.disposition === 'no-answer'      ? 'bg-base-200 text-base-content/60'
                          : call.disposition === 'not-interested' ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
                          : call.disposition === 'wrong-number'   ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : call.disposition === 'dnc'            ? 'bg-red-500/20 text-red-700 dark:text-red-300 font-semibold'
                          : 'bg-base-200 text-base-content/60'"
                  >
                    {{ call.disposition }}
                  </span>
                </div>
                <div v-if="call.dispositionNotes" class="text-[10px] text-base-content/70 mt-0.5 leading-snug line-clamp-2 pl-3">
                  {{ call.dispositionNotes }}
                </div>
                <div v-if="call.recordingUrl" class="mt-0.5 text-[9px] text-purple-600 dark:text-purple-400 flex items-center gap-0.5 pl-3">
                  <Mic class="w-2 h-2" />
                  Recording
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- Tasks -->
        <div class="min-w-0">
          <LeadTasksSection :lead-id="lead.id" />
        </div>

        <!-- Timeline -->
        <div class="min-w-0">
          <LeadTimelineSection :lead-id="lead.id" />
        </div>
      </div>
      </div>
      <!-- /main-grid -->

      <!-- ─── 4. AI placeholder ─── -->
      <div v-else-if="sectionKey === 'ai'" class="sortable-section group/section relative" :data-section="sectionKey">
        <button
          class="section-drag-handle absolute -left-4 top-2 p-1 rounded opacity-0 group-hover/section:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical class="w-3 h-3 text-base-content/60" />
        </button>

      <!-- 7. AI placeholder -->
      <section class="border border-dashed border-primary/30 rounded-lg p-3 text-center">
        <Sparkles class="w-4 h-4 mx-auto mb-1 text-primary/60" />
        <p class="text-[11px] text-base-content/60 leading-relaxed">
          Future: BuzzyHive AI auto-summarizes the timeline + extracts action items from call recordings.
        </p>
      </section>
      </div>
      <!-- /ai -->

        </template>
      </div>
      <!-- /sortable container -->

      <!-- Reset layout link — only visible when reordered from default -->
      <div v-if="isCustomized" class="text-center pt-1">
        <button
          class="text-[10px] text-base-content/40 hover:text-primary transition-colors flex items-center gap-1 mx-auto"
          @click="resetLayout"
        >
          <RotateCcw class="w-2.5 h-2.5" />
          Reset layout
        </button>
      </div>

    </div>
  </div>
</template>
