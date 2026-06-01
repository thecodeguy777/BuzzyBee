<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { X, Save, Trash2, User, Building2 } from 'lucide-vue-next'
import { useTasks, type DialerTask, type TaskType, type TaskStatus } from '../../composables/useTasks'
import { useLeads } from '../../composables/useLeads'
import { useDialog } from '../../composables/useDialog'
import { useToast } from '../../composables/useToast'
import { supabaseSession } from '../../lib/supabase-client'
import TaskTypeIcon from './TaskTypeIcon.vue'
import TaskAttachments from './TaskAttachments.vue'

const props = defineProps<{
  task: DialerTask | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const taskStore = useTasks()
const leads = useLeads()
const dialog = useDialog()
const toast = useToast()

const lead = computed(() =>
  props.task?.leadId ? leads.leads.value.find(l => l.id === props.task!.leadId) : null,
)

const draftTitle = ref('')
const draftDescription = ref('')
const draftTaskType = ref<TaskType>('manual')
const draftStatus = ref<TaskStatus>('open')
const draftDueAt = ref('')
const draftSlaHours = ref<number | null>(null)
const draftClaimed = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'manual',                  label: 'Manual' },
  { value: 'follow_up_email',         label: 'Follow-up email' },
  { value: 'send_proposal',           label: 'Send proposal' },
  { value: 'schedule_discovery',      label: 'Schedule discovery' },
  { value: 'follow_up_proposal',      label: 'Follow up on proposal' },
  { value: 'callback',                label: 'Callback' },
  { value: 'sms_voicemail_followup',  label: 'SMS after voicemail' },
  { value: 'send_calendar_invite',    label: 'Send calendar invite' },
  { value: 'onboarding_kickoff',      label: 'Onboarding kickoff' },
  { value: 'audit_dnc',               label: 'Audit DNC' },
  { value: 'audit_wrong_number',      label: 'Audit wrong number' },
  { value: 'review_not_interested',   label: 'Review not interested' },
]
const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'open',         label: 'Open' },
  { value: 'in_progress',  label: 'In progress' },
  { value: 'done',         label: 'Done' },
  { value: 'snoozed',      label: 'Snoozed' },
  { value: 'cancelled',    label: 'Cancelled' },
]

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Rehydrate drafts from task whenever it changes
watch(() => props.task, (t) => {
  if (!t) return
  draftTitle.value = t.title
  draftDescription.value = t.description ?? ''
  draftTaskType.value = t.taskType
  draftStatus.value = t.status
  draftDueAt.value = toLocalInput(t.dueAt)
  draftSlaHours.value = t.slaHours
  draftClaimed.value = t.assignedToUserId === supabaseSession.value?.userId
  nextTick(() => titleInputRef.value?.focus())
}, { immediate: true })

const canSave = computed(() => !!draftTitle.value.trim() && !!props.task)

async function save() {
  if (!canSave.value || !props.task) return
  const dueIso = draftDueAt.value ? new Date(draftDueAt.value).toISOString() : null
  const assignee = draftClaimed.value
    ? supabaseSession.value?.userId ?? null
    : (props.task.assignedToUserId === supabaseSession.value?.userId ? null : props.task.assignedToUserId)
  await taskStore.updateTask(props.task.id, {
    title: draftTitle.value.trim(),
    description: draftDescription.value.trim() || null,
    taskType: draftTaskType.value,
    status: draftStatus.value,
    dueAt: dueIso,
    slaHours: draftSlaHours.value,
    assignedToUserId: assignee,
  })
  toast.success('Task updated', draftTitle.value.trim())
  emit('close')
}

async function deleteTask() {
  if (!props.task) return
  const ok = await dialog.confirm({
    title: 'Delete this task?',
    message: `"${props.task.title}" will be permanently removed. The lead's call/event history is untouched.`,
    destructive: true,
    confirmLabel: 'Delete task',
  })
  if (!ok) return
  await taskStore.deleteTask(props.task.id)
  toast.info('Task deleted', props.task.title)
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    if (canSave.value) save()
  }
}
</script>

<template>
  <transition name="modal-fade">
    <div
      v-if="task"
      class="fixed inset-0 z-[180] flex items-center justify-center px-4"
      style="background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);"
      @click.self="emit('close')"
      @keydown="onKey"
    >
      <div class="bg-base-100 border border-base-300 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <!-- Header -->
        <div class="px-4 py-3 border-b border-base-300 flex items-center gap-2">
          <TaskTypeIcon :task-type="draftTaskType" :size="16" />
          <h3 class="text-sm font-semibold flex-1">Edit task</h3>
          <button class="text-base-content/40 hover:text-base-content transition-colors" @click="emit('close')">
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 space-y-3">
          <!-- Linked lead (read-only) -->
          <div v-if="lead" class="flex items-center gap-2 text-[11px] text-base-content/60 bg-base-200/40 rounded px-2.5 py-1.5">
            <User class="w-3 h-3" />
            <span class="font-medium text-base-content/80">{{ lead.fullName }}</span>
            <span v-if="lead.company" class="flex items-center gap-1">
              <Building2 class="w-2.5 h-2.5" />
              {{ lead.company }}
            </span>
          </div>

          <!-- Title -->
          <div>
            <label class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Title</label>
            <input
              ref="titleInputRef"
              v-model="draftTitle"
              type="text"
              class="w-full mt-1 text-sm px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              @keydown="onKey"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Description</label>
            <textarea
              v-model="draftDescription"
              rows="2"
              placeholder="Optional notes for whoever picks this up"
              class="w-full mt-1 text-xs px-3 py-2 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none resize-none"
            ></textarea>
          </div>

          <!-- Type + Status -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Type</label>
              <select
                v-model="draftTaskType"
                class="w-full mt-1 text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              >
                <option v-for="t in TASK_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Status</label>
              <select
                v-model="draftStatus"
                class="w-full mt-1 text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              >
                <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>

          <!-- Due + SLA -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Due at</label>
              <input
                v-model="draftDueAt"
                type="datetime-local"
                class="w-full mt-1 text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">SLA (hours)</label>
              <input
                v-model.number="draftSlaHours"
                type="number" min="0"
                placeholder="—"
                class="w-full mt-1 text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <!-- Assignment toggle -->
          <label class="flex items-center gap-2 text-[11px] text-base-content/70 cursor-pointer">
            <input type="checkbox" v-model="draftClaimed" class="w-3.5 h-3.5" />
            Assigned to me
          </label>

          <!-- Attachments -->
          <TaskAttachments :task-id="task?.id ?? null" />
        </div>

        <!-- Footer -->
        <div class="px-4 py-3 bg-base-200/40 border-t border-base-300 flex items-center justify-between gap-2">
          <button
            class="flex items-center gap-1 text-xs text-red-500 hover:bg-red-500/10 px-2.5 py-1.5 rounded transition-colors"
            @click="deleteTask"
          >
            <Trash2 class="w-3 h-3" />
            Delete
          </button>
          <div class="flex items-center gap-2">
            <button
              class="text-xs text-base-content/60 hover:text-base-content px-2.5 py-1.5 rounded transition-colors"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              class="flex items-center gap-1 text-xs px-3 py-1.5 rounded font-medium transition-colors"
              :class="canSave
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-base-300 text-base-content/40 cursor-not-allowed'"
              :disabled="!canSave"
              @click="save"
            >
              <Save class="w-3 h-3" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
