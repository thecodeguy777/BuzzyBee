<script setup lang="ts">
import { computed } from 'vue'
import {
  Mail, FileText, Calendar, PhoneCall, MessageSquare,
  Briefcase, CheckCircle2, ShieldAlert, AlertTriangle, RefreshCw, ListChecks,
} from 'lucide-vue-next'
import type { TaskType } from '../../composables/useTasks'

const props = defineProps<{
  taskType: TaskType
  size?: number
}>()

const ICONS: Record<TaskType, { icon: any; color: string }> = {
  follow_up_email:        { icon: Mail,           color: 'text-blue-500' },
  send_proposal:          { icon: FileText,       color: 'text-violet-500' },
  schedule_discovery:     { icon: Calendar,       color: 'text-cyan-500' },
  follow_up_proposal:     { icon: RefreshCw,      color: 'text-amber-500' },
  callback:               { icon: PhoneCall,      color: 'text-emerald-500' },
  sms_voicemail_followup: { icon: MessageSquare,  color: 'text-blue-500' },
  send_calendar_invite:   { icon: Calendar,       color: 'text-cyan-500' },
  onboarding_kickoff:     { icon: Briefcase,      color: 'text-emerald-600' },
  audit_dnc:              { icon: ShieldAlert,    color: 'text-red-500' },
  audit_wrong_number:     { icon: AlertTriangle,  color: 'text-amber-500' },
  review_not_interested:  { icon: CheckCircle2,   color: 'text-orange-500' },
  manual:                 { icon: ListChecks,     color: 'text-base-content/60' },
}

const def = computed(() => ICONS[props.taskType] ?? ICONS.manual)
const px = computed(() => props.size ?? 14)
</script>

<template>
  <component
    :is="def.icon"
    :class="def.color"
    :style="{ width: px + 'px', height: px + 'px' }"
  />
</template>
