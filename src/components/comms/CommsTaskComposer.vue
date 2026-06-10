<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { CheckSquare, ChevronDown, User as UserIcon, Link2, Hash } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { useTeamStore } from '@/stores/team'
import { useStatusesStore } from '@/stores/statuses'
import { useChannelsStore } from '@/stores/channels'
import { COMMS_STREAM } from '@/composables/commsStream'
import { displayName, firstName } from '@/lib/format'
import type { CommsMessage } from '@/composables/useChannelStream'

const props = defineProps<{ message: CommsMessage }>()
const emit = defineEmits<{
  create: [payload: { title: string; statusKey?: string; assignee_id: string | null; due_on: string | null; priority: 1 | 2 | 3 | 4 }]
  close: []
}>()

const team = useTeamStore()
const statuses = useStatusesStore()
const channels = useChannelsStore()
const stream = inject(COMMS_STREAM, null)

function stripHtml(s: string) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

const project = computed(() => (stream ? stream.projectsForMessage(props.message)[0] ?? null : null))
const projectStatuses = computed(() => (project.value ? statuses.forProject(project.value.id) : []))
const channelName = computed(() => channels.channels.find((c) => c.id === props.message.channel_id)?.name ?? '')

const title = ref((stripHtml(props.message.body) || 'New task').slice(0, 140))
const statusKey = ref<string | undefined>(undefined)
const assignee = ref<string | null>(null)
const priority = ref<'Low' | 'Medium' | 'High'>('Medium')
const due = ref<'Today' | 'Tomorrow' | 'None'>('Today')
const link = ref(true)
const asgOpen = ref(false)
const titleInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  statusKey.value = projectStatuses.value.find((s) => !s.is_done && !s.is_cancelled)?.key ?? projectStatuses.value[0]?.key
  titleInput.value?.focus()
  titleInput.value?.select()
})

const assignees = computed(() => (team.myTeam.length ? team.myTeam : Object.values(team.profiles)))
const assigneeProfile = computed(() => assignees.value.find((m) => m.id === assignee.value) ?? null)

const CHIP: Record<string, string> = {
  neutral: 'text-base-content/70', muted: 'text-base-content/50', primary: 'text-primary',
  success: 'text-success', error: 'text-error', warning: 'text-warning', info: 'text-info'
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function submit() {
  const prio = priority.value === 'High' ? 2 : priority.value === 'Low' ? 4 : 3
  let due_on: string | null = null
  if (due.value === 'Today') due_on = ymd(new Date())
  else if (due.value === 'Tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); due_on = ymd(d) }
  emit('create', { title: title.value.trim() || 'New task', statusKey: statusKey.value, assignee_id: assignee.value, due_on, priority: prio as 1 | 2 | 3 | 4 })
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[80] grid place-items-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="emit('close')" />
      <div class="relative w-[360px] max-w-full rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden tw-popin">
        <!-- header -->
        <div class="flex items-center gap-2.5 px-3.5 py-3 border-b border-base-300">
          <span class="w-7 h-7 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
            <CheckSquare class="w-4 h-4" :stroke-width="2" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold leading-none">Create task</div>
            <div class="text-[0.7rem] text-base-content/50 mt-0.5 flex items-center gap-1">
              from message in <Hash class="w-2.5 h-2.5" :stroke-width="2.5" />{{ channelName }}
            </div>
          </div>
        </div>

        <div class="p-3.5 space-y-3">
          <!-- title -->
          <div>
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Task</div>
            <input
              ref="titleInput"
              v-model="title"
              class="w-full px-3 py-2 rounded-lg border border-base-300 bg-base-200/40 text-sm font-medium outline-none focus:border-primary"
              @keydown.enter="submit"
            />
          </div>

          <!-- status -->
          <div v-if="projectStatuses.length">
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Status</div>
            <div class="flex gap-1 bg-base-200 p-1 rounded-lg overflow-x-auto">
              <button
                v-for="s in projectStatuses.slice(0, 4)"
                :key="s.key"
                class="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all"
                :class="statusKey === s.key ? `bg-base-100 shadow-sm ${CHIP[s.color] || ''}` : 'text-base-content/60'"
                @click="statusKey = s.key"
              >
                {{ s.label }}
              </button>
            </div>
          </div>

          <div class="flex gap-2.5">
            <!-- assignee -->
            <div class="flex-1 relative">
              <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Assignee</div>
              <button
                class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-base-300 bg-base-200/40"
                @click="asgOpen = !asgOpen"
              >
                <template v-if="assigneeProfile">
                  <HexAvatar :name="displayName(assigneeProfile)" :avatar-url="assigneeProfile.avatar_url" :size="18" />
                  <span class="text-[0.8rem] font-medium truncate">{{ firstName(displayName(assigneeProfile)) }}</span>
                </template>
                <template v-else>
                  <span class="w-[18px] h-[18px] rounded-md border border-dashed border-base-content/40 grid place-items-center text-base-content/40"><UserIcon class="w-2.5 h-2.5" /></span>
                  <span class="text-[0.8rem] text-base-content/50">Unassigned</span>
                </template>
                <ChevronDown class="w-3.5 h-3.5 ml-auto text-base-content/40" :stroke-width="2" />
              </button>
              <div
                v-if="asgOpen"
                class="absolute top-full left-0 right-0 mt-1 z-20 max-h-44 overflow-y-auto rounded-lg border border-base-300 bg-base-100 shadow-lg p-1"
              >
                <button class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-base-200 text-left" @click="assignee = null; asgOpen = false">
                  <span class="w-5 h-5 rounded-md border border-dashed border-base-content/40 grid place-items-center text-base-content/40"><UserIcon class="w-3 h-3" /></span>
                  <span class="text-sm text-base-content/60">Unassigned</span>
                </button>
                <button
                  v-for="m in assignees"
                  :key="m.id"
                  class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-base-200 text-left"
                  @click="assignee = m.id; asgOpen = false"
                >
                  <HexAvatar :name="displayName(m)" :avatar-url="m.avatar_url" :size="20" />
                  <span class="text-sm truncate">{{ displayName(m) }}</span>
                </button>
              </div>
            </div>

            <!-- priority -->
            <div class="w-[118px]">
              <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Priority</div>
              <div class="flex gap-1 bg-base-200 p-1 rounded-lg">
                <button
                  v-for="p in ['Low', 'Medium', 'High']"
                  :key="p"
                  class="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
                  :class="priority === p ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/60'"
                  @click="priority = p as 'Low' | 'Medium' | 'High'"
                >
                  {{ p[0] }}
                </button>
              </div>
            </div>
          </div>

          <!-- due -->
          <div>
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Due</div>
            <div class="flex gap-1 bg-base-200 p-1 rounded-lg">
              <button
                v-for="d in ['Today', 'Tomorrow', 'None']"
                :key="d"
                class="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all"
                :class="due === d ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/60'"
                @click="due = d as 'Today' | 'Tomorrow' | 'None'"
              >
                {{ d }}
              </button>
            </div>
          </div>

          <!-- link toggle -->
          <label class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer" style="background: var(--accent-soft)">
            <button
              type="button"
              class="w-9 h-5 rounded-full relative shrink-0 transition-colors"
              :class="link ? 'bg-primary' : 'bg-base-300'"
              @click="link = !link"
            >
              <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" :class="link ? 'left-[18px]' : 'left-0.5'" />
            </button>
            <div class="flex-1">
              <div class="text-xs font-semibold">Link to the task board</div>
              <div class="text-[0.65rem] text-base-content/60">Syncs status both ways with the tracker</div>
            </div>
            <Link2 class="w-3.5 h-3.5 text-primary" :stroke-width="1.75" />
          </label>

          <!-- actions -->
          <div class="flex gap-2 pt-0.5">
            <button class="px-3.5 py-2 rounded-lg text-sm font-semibold text-base-content/70 border border-base-300 hover:bg-base-200" @click="emit('close')">Cancel</button>
            <button class="flex-1 px-3.5 py-2 rounded-lg text-sm font-bold text-primary-content bg-primary hover:opacity-90 flex items-center justify-center gap-1.5" @click="submit">
              <CheckSquare class="w-4 h-4" :stroke-width="2.2" /> Create &amp; link task
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes tw-popin { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: none; } }
.tw-popin { animation: tw-popin 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
</style>
