<script setup lang="ts">
import { computed } from 'vue'
import {
  Sparkles, ChevronRight, DollarSign, User, Users, Calendar, CalendarOff,
  StickyNote, FileEdit, PhoneOutgoing, PhoneOff, PhoneCall, CheckCircle2,
  Mic, AlertCircle, Bot, MessageSquare,
} from 'lucide-vue-next'
import { useLeads, STAGE_LABEL, type LeadStage } from '../../composables/useLeads'
import { useProfiles } from '../../composables/useProfiles'
import { supabaseSession } from '../../lib/supabase-client'
import type { LeadEvent, LeadEventType } from '../../composables/useLeadEvents'

const props = defineProps<{
  event: LeadEvent
  /** Show the lead name (true for global feed, false for per-lead timeline) */
  showLead?: boolean
  /** Compact mode collapses sub-lines */
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'lead-click', leadId: string): void
}>()

const leads = useLeads()
const profiles = useProfiles()

const lead = computed(() =>
  leads.leads.value.find(l => l.id === props.event.leadId) ?? null,
)

// ── Event type → visual style + descriptor ─────────────────────
const STYLE: Record<LeadEventType, { icon: any; color: string; label: string }> = {
  imported:               { icon: Sparkles,       color: 'text-base-content/50',  label: 'Imported' },
  assigned:               { icon: User,           color: 'text-blue-500',         label: 'Assigned' },
  reassigned:             { icon: Users,          color: 'text-blue-500',         label: 'Reassigned' },
  call_started:           { icon: PhoneOutgoing,  color: 'text-cyan-500',         label: 'Call started' },
  call_completed:         { icon: PhoneOff,       color: 'text-base-content/60',  label: 'Call ended' },
  disposition_set:        { icon: CheckCircle2,   color: 'text-emerald-500',      label: 'Dispositioned' },
  stage_changed:          { icon: ChevronRight,   color: 'text-primary',          label: 'Stage moved' },
  deal_value_changed:     { icon: DollarSign,     color: 'text-emerald-500',      label: 'Deal value' },
  note_added:             { icon: StickyNote,     color: 'text-amber-500',        label: 'Note added' },
  note_edited:            { icon: FileEdit,       color: 'text-amber-500',        label: 'Note edited' },
  task_created:           { icon: CheckCircle2,   color: 'text-purple-500',       label: 'Task created' },
  task_completed:         { icon: CheckCircle2,   color: 'text-emerald-500',      label: 'Task done' },
  task_overdue:           { icon: AlertCircle,    color: 'text-red-500',          label: 'Task overdue' },
  callback_scheduled:     { icon: Calendar,       color: 'text-amber-500',        label: 'Callback set' },
  callback_cleared:       { icon: CalendarOff,    color: 'text-base-content/50',  label: 'Callback cleared' },
  recording_ready:        { icon: Mic,            color: 'text-purple-500',       label: 'Recording ready' },
  recording_transcribed:  { icon: MessageSquare,  color: 'text-purple-500',       label: 'Transcribed' },
  sla_breached:           { icon: AlertCircle,    color: 'text-red-500',          label: 'SLA breach' },
  ai_summary_generated:   { icon: Bot,            color: 'text-purple-500',       label: 'AI summary' },
  manual_note:            { icon: StickyNote,     color: 'text-amber-500',        label: 'Note' },
}

const style = computed(() => STYLE[props.event.eventType])

const description = computed(() => {
  const p = props.event.payload as any
  switch (props.event.eventType) {
    case 'imported':
      return `via ${p.source ?? 'unknown'}`
    case 'stage_changed': {
      const from = p.from ? STAGE_LABEL[p.from as LeadStage] : '?'
      const to = p.to ? STAGE_LABEL[p.to as LeadStage] : '?'
      const days = p.seconds_in_previous_stage
        ? ` · ${Math.round(p.seconds_in_previous_stage / 86400)}d in ${from}`
        : ''
      return `${from} → ${to}${days}`
    }
    case 'deal_value_changed': {
      const from = p.from_cents ? `$${(p.from_cents / 100).toFixed(0)}` : '—'
      const to = p.to_cents ? `$${(p.to_cents / 100).toFixed(0)}` : '—'
      const prob = p.close_probability != null ? ` · ${p.close_probability}% close` : ''
      return `${from} → ${to}${prob}`
    }
    case 'assigned':
    case 'reassigned':
      return p.to_user_id ? 'to a rep' : 'unassigned'
    case 'callback_scheduled':
      return p.callback_at ? `for ${new Date(p.callback_at).toLocaleString()}` : ''
    case 'callback_cleared':
      return ''
    case 'note_added':
      return `(${p.new_length ?? 0} chars)`
    case 'note_edited':
      return `(${p.previous_length ?? 0} → ${p.new_length ?? 0} chars)`
    case 'call_started':
      return `${p.direction === 'inbound' ? '← inbound' : '→ outbound'}`
    case 'call_completed': {
      const dur = p.duration_sec ? formatDuration(p.duration_sec) : '—'
      const answered = p.answered ? 'answered' : 'unanswered'
      return `${p.status} · ${dur} · ${answered}`
    }
    case 'disposition_set':
      return p.disposition ?? ''
    case 'recording_ready':
      return p.duration_sec ? `${formatDuration(p.duration_sec)}` : ''
    case 'sla_breached':
      return p.task_title ?? 'task'
    case 'ai_summary_generated':
      return 'lead summary refreshed'
    default:
      return ''
  }
})

const isMine = computed(() =>
  props.event.actorUserId === supabaseSession.value?.userId,
)

const actorLabel = computed(() => {
  if (props.event.actorUserId === null) return 'System'
  if (isMine.value) return 'You'
  return profiles.displayName(props.event.actorUserId, 'Teammate')
})

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function onLeadClick() {
  if (lead.value) emit('lead-click', lead.value.id)
}
</script>

<template>
  <div class="flex items-start gap-2.5 px-3 py-2 hover:bg-base-200/50 transition-colors text-xs">
    <!-- Icon -->
    <div class="shrink-0 w-6 h-6 rounded-full bg-base-200/60 flex items-center justify-center mt-0.5">
      <component :is="style.icon" class="w-3 h-3" :class="style.color" />
    </div>

    <!-- Body -->
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-1.5 flex-wrap">
        <span class="font-medium text-base-content/80" :class="isMine ? 'text-primary' : ''">
          {{ actorLabel }}
        </span>
        <span class="text-base-content/40">·</span>
        <span class="font-medium text-base-content" :class="style.color">{{ style.label }}</span>
        <button
          v-if="showLead && lead"
          class="px-1.5 py-0.5 rounded bg-base-200 text-[10px] font-medium text-base-content/70 hover:bg-primary/10 hover:text-primary transition-colors max-w-[140px] truncate"
          :title="`Open ${lead.fullName}`"
          @click="onLeadClick"
        >
          {{ lead.fullName }}
        </button>
        <span v-else-if="showLead" class="text-[10px] text-base-content/30">
          (lead missing)
        </span>
      </div>
      <div v-if="description && !compact" class="text-[11px] text-base-content/60 mt-0.5 truncate">
        {{ description }}
      </div>
    </div>

    <!-- Timestamp -->
    <div class="shrink-0 text-[10px] text-base-content/40 mt-1 tabular-nums" :title="new Date(event.createdAt).toLocaleString()">
      {{ formatRelative(event.createdAt) }}
    </div>
  </div>
</template>
