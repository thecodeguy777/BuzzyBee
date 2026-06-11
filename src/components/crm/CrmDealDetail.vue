<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  X, MessageSquare, ListChecks, Mail, Pencil, Route, Phone, Calendar, Trophy,
  User, Users, Filter, SquareCheck, ArrowUpRight, Plus, Handshake, Hash,
  Video, Trash2, ChevronDown, Flag,
} from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import CrmHealthDot from './CrmHealthDot.vue'
import { useCrmStore } from '@/stores/crm'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import { useClientsStore } from '@/stores/clients'
import { userColor } from '@/lib/userColor'
import { createMeetingRoom } from '@/lib/meetingRoom'
import { STAGES, LOST, HEALTH, SOURCES, fmtMoney, relTime, ACT_COLOR, type Deal, type StageId, type Health, type ActivityType } from '@/lib/crmData'

const props = defineProps<{ deal: Deal }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'move', id: string, stage: StageId): void
  (e: 'convert', deal: Deal): void
}>()

const router = useRouter()
const crm = useCrmStore()
const team = useTeamStore()
const auth = useAuthStore()
const channels = useChannelsStore()
const clients = useClientsStore()
const closeBtn = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const visible = ref(false)
let triggerEl: HTMLElement | null = null

const co = computed(() => crm.company(props.deal.companyId))
const ownerProfile = computed(() => (props.deal.ownerId ? team.profiles[props.deal.ownerId] : null))
const contacts = computed(() => crm.contactsFor(props.deal.companyId))
const linkedTasks = computed(() => crm.linkedTasks(props.deal.id))
const activities = computed(() => crm.activities(props.deal.id))
const isWon = computed(() => props.deal.stage === 'won')
// Stages + Lost, so a deal can be marked lost and a lost deal still shows a chip.
const stageChips = [...STAGES, LOST]

const ACT_ICONS: Record<ActivityType, unknown> = {
  message: MessageSquare, task: ListChecks, email: Mail, note: Pencil,
  stage: Route, call: Phone, meeting: Calendar, won: Trophy,
}
const actIcon = (t: ActivityType) => ACT_ICONS[t] ?? Pencil
const actColor = (t: ActivityType) => ACT_COLOR[t] ?? 'var(--color-base-content)'
function actorName(id: string | null) {
  return (id ? team.profiles[id]?.full_name?.split(' ')[0] : null) ?? 'System'
}

// ── Inline edits (title / value / close date) ─────────────────────────────────
type EditKey = 'title' | 'value' | 'close'
const editing = ref<EditKey | null>(null)
const draft = ref('')
function startEdit(k: EditKey) {
  editing.value = k
  draft.value = k === 'value' ? String(props.deal.value || '') : k === 'title' ? props.deal.title : (props.deal.close === '—' ? '' : props.deal.close)
  void nextTick(() => panel.value?.querySelector<HTMLInputElement>('#crm-deal-edit')?.focus())
}
function commitEdit() {
  const k = editing.value
  editing.value = null
  if (!k) return
  const v = draft.value.trim()
  if (k === 'title') {
    if (v && v !== props.deal.title) void crm.updateDeal(props.deal.id, { title: v })
  } else if (k === 'value') {
    const n = Number(v.replace(/[^0-9.]/g, '')) || 0
    if (n !== props.deal.value) void crm.updateDeal(props.deal.id, { value: n })
  } else if (v !== props.deal.close) {
    void crm.updateDeal(props.deal.id, { close: v })
  }
}

// ── Owner / source / priority / health ────────────────────────────────────────
// Roster: people actively assigned to this workspace's client, plus me and the
// current owner (so a stale owner still resolves).
const roster = computed(() => {
  const ids = new Set<string>()
  for (const a of team.assignments) {
    if (a.status !== 'active' || a.client_id !== clients.currentClientId) continue
    if (a.va_id) ids.add(a.va_id)
    if (a.pm_id) ids.add(a.pm_id)
  }
  if (auth.user?.id) ids.add(auth.user.id)
  if (props.deal.ownerId) ids.add(props.deal.ownerId)
  return [...ids].map((id) => team.profiles[id]).filter(Boolean)
})
const sourceOpts = computed(() =>
  props.deal.source && !SOURCES.includes(props.deal.source) ? [props.deal.source, ...SOURCES] : SOURCES)
const PRIORITIES = ['Low', 'Medium', 'High']
const priorityOpts = computed(() =>
  props.deal.priority && !PRIORITIES.includes(props.deal.priority) ? [props.deal.priority, ...PRIORITIES] : PRIORITIES)
const healthOpts: Health[] = ['hot', 'warm', 'cold']

const setOwner = (id: string) => void crm.updateDeal(props.deal.id, { ownerId: id || null })
const setSource = (s: string) => void crm.updateDeal(props.deal.id, { source: s })
const setPriority = (p: string) => void crm.updateDeal(props.deal.id, { priority: p })
const setHealth = (h: Health) => h !== props.deal.health && void crm.updateDeal(props.deal.id, { health: h })

// ── Channel link ──────────────────────────────────────────────────────────────
const channelPickerOpen = ref(false)
// The store's optimistic patch doesn't refresh the embedded channel name —
// resolve it from the channels store first.
const channelName = computed(() =>
  props.deal.channelId
    ? channels.channels.find((c) => c.id === props.deal.channelId)?.name ?? props.deal.channelName
    : null)
async function pickChannel(id: string | null) {
  channelPickerOpen.value = false
  if (id !== props.deal.channelId) await crm.updateDeal(props.deal.id, { channelId: id })
}

// ── Create a task from this deal ──────────────────────────────────────────────
const addingTask = ref(false)
const taskTitle = ref('')
const savingTask = ref(false)
function openTaskForm() {
  addingTask.value = true
  taskTitle.value = 'Follow up: ' + props.deal.title
  void nextTick(() => panel.value?.querySelector<HTMLInputElement>('#crm-deal-task')?.focus())
}
async function submitTask() {
  const title = taskTitle.value.trim()
  if (!title || savingTask.value) return
  savingTask.value = true
  try {
    const { useTasksStore } = await import('@/stores/tasks')
    const task = await useTasksStore().createTask({ title, client_id: co.value?.clientId ?? undefined })
    if (task?.id) {
      await crm.linkTask(props.deal.id, task.id)
      void crm.logActivity(props.deal.id, { type: 'task', body: 'created task "' + title + '"', meta: (task as any).reference_number ?? null })
      addingTask.value = false
      taskTitle.value = ''
    }
  } catch (e) {
    crm.error = "Couldn't create that task — " + (e as Error).message
  } finally {
    savingTask.value = false
  }
}

// ── Meetings / email ──────────────────────────────────────────────────────────
const startingMeeting = ref(false)
async function startMeeting() {
  if (!auth.user || startingMeeting.value) return
  startingMeeting.value = true
  try {
    const token = await createMeetingRoom(auth.user.id, (co.value?.name ?? 'Deal') + ' meeting')
    window.open('/meet/' + token, '_blank', 'noopener')
    await crm.logActivity(props.deal.id, { type: 'meeting', body: 'started a meeting', meta: '/meet/' + token })
  } catch (e) {
    crm.error = "Couldn't start a meeting — " + (e as Error).message
  } finally {
    startingMeeting.value = false
  }
}

const emailContact = computed(() =>
  contacts.value.find((c) => c.primary && c.email) ?? contacts.value.find((c) => c.email) ?? null)
function onEmail() {
  if (!emailContact.value) return
  void crm.logActivity(props.deal.id, {
    type: 'email', body: 'emailed ' + emailContact.value.name, contactId: emailContact.value.id,
  })
}

// ── Activity composer ─────────────────────────────────────────────────────────
const logType = ref<ActivityType>('note')
const logBody = ref('')
const logContactId = ref('')
const LOG_TYPES: { id: ActivityType; label: string; icon: unknown }[] = [
  { id: 'note', label: 'Note', icon: Pencil },
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'meeting', label: 'Meeting', icon: Calendar },
  { id: 'email', label: 'Email', icon: Mail },
]
async function submitLog() {
  const body = logBody.value.trim()
  if (!body) return
  const ok = await crm.logActivity(props.deal.id, { type: logType.value, body, contactId: logContactId.value || null })
  if (ok) {
    logBody.value = ''
    logContactId.value = ''
  }
}
function focusComposer(type: ActivityType) {
  logType.value = type
  void nextTick(() => panel.value?.querySelector<HTMLElement>('#crm-deal-log')?.focus())
}
async function removeActivity(id: string) {
  if (!window.confirm('Remove this timeline entry?')) return
  await crm.deleteActivity(props.deal.id, id)
}

// ── Delete deal ───────────────────────────────────────────────────────────────
async function removeDeal() {
  if (!window.confirm('Delete "' + props.deal.title + '"? Its timeline goes with it.')) return
  if (await crm.deleteDeal(props.deal.id)) requestClose()
}

// ── Panel chrome ──────────────────────────────────────────────────────────────
function requestClose() {
  visible.value = false // play the leave transition; @after-leave emits 'close'
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (channelPickerOpen.value) { channelPickerOpen.value = false; return }
    if (editing.value) { editing.value = null; return }
    requestClose()
    return
  }
  if (e.key === 'Tab' && panel.value) {
    const els = Array.from(
      panel.value.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null)
    if (!els.length) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}
onMounted(() => {
  triggerEl = document.activeElement as HTMLElement
  document.addEventListener('keydown', onKey)
  void crm.loadActivities(props.deal.id)
  visible.value = true
  void nextTick(() => closeBtn.value?.focus())
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  triggerEl?.focus?.() // restore focus to whatever opened the panel
})

// ── Cross-workspace navigation ────────────────────────────────────────────────
// Open the linked channel. Switch client context AND load that client's channels
// before selecting, so a deal's channel on any client resolves in Comms (not a race).
async function goChannel(channelId: string | null, clientId: string | null | undefined) {
  try {
    if (clientId) {
      clients.setCurrentClient(clientId)
      await channels.load()
    }
    if (channelId) channels.select(channelId)
    await router.push({ name: 'workstation-comms' })
  } catch (e) {
    console.warn('[crm] open channel:', (e as Error).message)
  }
}
async function goTask(taskId: string) {
  try {
    const { useTasksStore } = await import('@/stores/tasks')
    useTasksStore().selectTask(taskId)
    await router.push({ name: 'workstation-tasks' })
  } catch (e) {
    console.warn('[crm] open task:', (e as Error).message)
  }
}

watch(() => props.deal.id, () => {
  editing.value = null
  addingTask.value = false
  void crm.loadActivities(props.deal.id)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="crm-scrim">
      <div v-if="visible" class="fixed inset-0 z-[90]" style="background: rgba(0,0,0,.5)" @click="requestClose" />
    </Transition>
    <Transition name="crm-panel" @after-leave="emit('close')">
      <div
        v-if="visible"
        ref="panel"
        class="crm-detail fixed top-0 right-0 bottom-0 z-[95] w-[508px] max-w-[95vw] flex flex-col bg-base-100 border-l border-base-300"
        style="box-shadow: -16px 0 48px -16px rgba(0,0,0,.45)"
        role="dialog"
        aria-modal="true"
        :aria-label="deal.title + ' — deal details'"
      >
        <!-- header -->
        <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-base-300">
          <CrmAvatar :name="co?.name" :initials="co?.initials" :color="co?.color" :size="30" :radius="8" />
          <div class="flex-1 min-w-0">
            <div class="text-[13.5px] font-bold text-base-content truncate">{{ co?.name ?? 'Unknown company' }}</div>
            <div class="text-[11.5px] text-base-content/40">{{ co?.industry }}<template v-if="co?.site"> · {{ co.site }}</template></div>
          </div>
          <button type="button" class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/40 hover:bg-base-200 hover:text-[#c2253c]" aria-label="Delete deal" title="Delete deal" @click="removeDeal">
            <Trash2 :size="15" />
          </button>
          <button ref="closeBtn" type="button" class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Close" @click="requestClose">
            <X :size="17" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- title + value -->
          <div class="px-5 pt-[18px] pb-3.5 border-b border-base-300">
            <input
              v-if="editing === 'title'"
              id="crm-deal-edit"
              v-model="draft"
              class="w-full m-0 mb-2.5 text-[21px] font-bold text-base-content tracking-tight leading-snug bg-base-200 rounded-lg px-2 py-1 outline-none ring-1 ring-primary/40"
              @blur="commitEdit"
              @keydown.enter.prevent="commitEdit"
            />
            <h2
              v-else
              class="crm-editable m-0 mb-2.5 -mx-2 px-2 py-1 rounded-lg text-[21px] font-bold text-base-content tracking-tight leading-snug cursor-text"
              title="Click to edit"
              @click="startEdit('title')"
            >{{ deal.title }}</h2>
            <div class="flex items-center gap-3.5 flex-wrap">
              <input
                v-if="editing === 'value'"
                id="crm-deal-edit"
                v-model="draft"
                inputmode="numeric"
                class="w-36 text-[28px] font-extrabold text-base-content bg-base-200 rounded-lg px-2 outline-none ring-1 ring-primary/40"
                style="letter-spacing:-1px"
                @blur="commitEdit"
                @keydown.enter.prevent="commitEdit"
              />
              <span
                v-else
                class="crm-editable -mx-1 px-1 rounded-lg text-[28px] font-extrabold text-base-content cursor-text"
                style="letter-spacing:-1px"
                title="Click to edit"
                @click="startEdit('value')"
              >{{ fmtMoney(deal.value) }}</span>

              <!-- health: click to set -->
              <span class="inline-flex items-center gap-1" role="group" aria-label="Deal health">
                <button
                  v-for="h in healthOpts"
                  :key="h"
                  type="button"
                  class="px-1.5 py-1 rounded-md transition-opacity"
                  :class="deal.health === h ? '' : 'opacity-30 hover:opacity-70'"
                  :title="HEALTH[h].label"
                  :aria-pressed="deal.health === h"
                  @click="setHealth(h)"
                >
                  <CrmHealthDot :health="h" />
                </button>
              </span>

              <input
                v-if="editing === 'close'"
                id="crm-deal-edit"
                v-model="draft"
                placeholder="e.g. Jul 5"
                class="w-28 text-[12.5px] text-base-content bg-base-200 rounded-md px-2 py-1 outline-none ring-1 ring-primary/40"
                @blur="commitEdit"
                @keydown.enter.prevent="commitEdit"
              />
              <button v-else type="button" class="crm-editable inline-flex items-center gap-1.5 text-[12.5px] text-base-content/60 rounded-md px-1 py-0.5" title="Close date — click to edit" @click="startEdit('close')">
                <Calendar :size="14" /> {{ deal.close || '—' }}
              </button>
            </div>
          </div>

          <!-- stage selector -->
          <div class="px-5 py-3.5 border-b border-base-300" role="group" aria-label="Pipeline stage">
            <div class="text-[11px] font-bold tracking-wide text-base-content/40 uppercase mb-2">Pipeline stage</div>
            <div class="flex gap-[5px] flex-wrap">
              <button
                v-for="s in stageChips"
                :key="s.id"
                type="button"
                class="crm-stage inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-[7px] text-xs font-semibold border"
                :class="deal.stage === s.id ? 'crm-stage-on' : ''"
                :aria-pressed="deal.stage === s.id"
                :style="deal.stage === s.id
                  ? { background: `color-mix(in oklab, ${s.dot} 18%, var(--color-base-100))`, color: 'var(--color-base-content)', borderColor: `color-mix(in oklab, ${s.dot} 42%, transparent)` }
                  : {}"
                @click="deal.stage !== s.id && emit('move', deal.id, s.id)"
              >
                <span class="w-[7px] h-[7px] rounded-full" :style="{ background: s.dot }" />{{ s.label }}
              </button>
            </div>
          </div>

          <!-- meta -->
          <div class="px-5 pt-3 pb-4 border-b border-base-300 flex flex-col gap-0.5">
            <div class="flex items-center gap-2.5 min-h-[34px]">
              <span class="flex items-center gap-[7px] w-24 flex-none text-base-content/40 text-[12.5px] font-semibold"><User :size="15" /> Owner</span>
              <div class="crm-pick flex items-center gap-2 rounded-lg px-1.5 py-1 -mx-1.5">
                <CrmAvatar :name="ownerProfile?.full_name ?? 'Unassigned'" :avatar-url="ownerProfile?.avatar_url" :color="deal.ownerId ? userColor(deal.ownerId) : 'var(--accent)'" :size="22" :radius="6" />
                <select
                  class="bg-transparent outline-none text-[13px] text-base-content font-semibold cursor-pointer"
                  :value="deal.ownerId ?? ''"
                  aria-label="Deal owner"
                  @change="setOwner(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Unassigned</option>
                  <option v-for="p in roster" :key="p.id" :value="p.id">{{ p.full_name }}</option>
                </select>
              </div>
            </div>
            <div class="flex items-start gap-2.5 min-h-[34px] py-1.5">
              <span class="flex items-center gap-[7px] w-24 flex-none text-base-content/40 text-[12.5px] font-semibold pt-0.5"><Users :size="15" /> Contacts</span>
              <div v-if="contacts.length" class="flex flex-col gap-1.5">
                <div v-for="c in contacts" :key="c.id" class="flex items-center gap-2">
                  <CrmAvatar :name="c.name" :initials="c.initials" :color="c.color" :size="22" :radius="6" />
                  <span class="text-[13px] text-base-content font-semibold">{{ c.name }}</span>
                  <span class="text-[11.5px] text-base-content/40">{{ c.role }}</span>
                </div>
              </div>
              <span v-else class="text-[13px] text-base-content/40 pt-0.5">No contacts yet</span>
            </div>
            <div class="flex items-center gap-2.5 min-h-[34px]">
              <span class="flex items-center gap-[7px] w-24 flex-none text-base-content/40 text-[12.5px] font-semibold"><Filter :size="15" /> Source</span>
              <select
                class="crm-pick bg-transparent outline-none text-[13px] text-base-content/70 rounded-lg px-1 py-1 -mx-1 cursor-pointer"
                :value="deal.source || ''"
                aria-label="Deal source"
                @change="setSource(($event.target as HTMLSelectElement).value)"
              >
                <option v-if="!deal.source" value="">—</option>
                <option v-for="s in sourceOpts" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="flex items-center gap-2.5 min-h-[34px]">
              <span class="flex items-center gap-[7px] w-24 flex-none text-base-content/40 text-[12.5px] font-semibold"><Flag :size="15" /> Priority</span>
              <select
                class="crm-pick bg-transparent outline-none text-[13px] text-base-content/70 rounded-lg px-1 py-1 -mx-1 cursor-pointer"
                :value="deal.priority || 'Medium'"
                aria-label="Deal priority"
                @change="setPriority(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="p in priorityOpts" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
          </div>

          <!-- connected -->
          <div class="px-5 py-4 border-b border-base-300">
            <h3 class="flex items-center gap-[7px] mb-[11px] m-0 text-[13.5px] font-bold text-base-content">
              <Route :size="15" :style="{ color: 'var(--accent-fg)' }" /> Connected across your workspace
            </h3>

            <!-- channel: open if linked, picker to link/change -->
            <div class="relative mb-2">
              <div v-if="channelName" class="crm-link flex items-center gap-2.5 w-full px-3 py-2.5 rounded-[9px] border border-base-300 bg-base-100">
                <span class="w-[30px] h-[30px] rounded-lg grid place-items-center flex-none" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"><MessageSquare :size="16" /></span>
                <button type="button" class="flex-1 min-w-0 text-left" @click="goChannel(deal.channelId, co?.clientId)">
                  <div class="text-[13px] font-semibold text-base-content truncate">#{{ channelName }}</div>
                  <div class="text-[11.5px] text-base-content/40">Open the conversation in Comms</div>
                </button>
                <button type="button" class="text-[11px] font-bold text-base-content/40 hover:text-base-content px-1.5 py-1 rounded-md hover:bg-base-200" title="Change linked channel" @click="channelPickerOpen = !channelPickerOpen">
                  Change
                </button>
                <ArrowUpRight :size="15" class="text-base-content/40 flex-none" />
              </div>
              <button
                v-else
                type="button"
                class="crm-link flex items-center gap-2.5 w-full px-3 py-2.5 rounded-[9px] border-[1.5px] border-dashed border-base-300 text-base-content/50 text-[13px] font-semibold"
                @click="channelPickerOpen = !channelPickerOpen"
              >
                <Plus :size="15" /> Link a chat channel
                <ChevronDown :size="14" class="ml-auto" />
              </button>

              <template v-if="channelPickerOpen">
                <div class="fixed inset-0 z-[105]" @click="channelPickerOpen = false" />
                <div class="absolute top-full left-0 right-0 mt-1.5 z-[106] rounded-[10px] border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
                  <div class="max-h-48 overflow-y-auto p-1">
                    <button
                      v-for="ch in channels.channels"
                      :key="ch.id"
                      type="button"
                      class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-base-200 text-left text-[13px] font-semibold text-base-content"
                      @click="pickChannel(ch.id)"
                    >
                      <Hash :size="13" :style="{ color: 'var(--accent-fg)' }" /> {{ ch.name }}
                      <SquareCheck v-if="ch.id === deal.channelId" :size="13" class="ml-auto" :style="{ color: 'var(--accent-fg)' }" />
                    </button>
                    <div v-if="!channels.channels.length" class="px-2.5 py-2.5 text-[12.5px] text-base-content/40 text-center">No channels in this workspace yet</div>
                  </div>
                  <button v-if="deal.channelId" type="button" class="w-full px-3 py-2 border-t border-base-200 hover:bg-base-200 text-left text-[12.5px] font-semibold text-base-content/50" @click="pickChannel(null)">
                    Unlink channel
                  </button>
                </div>
              </template>
            </div>

            <!-- meeting -->
            <button
              type="button"
              class="crm-link flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-[9px] border border-base-300 bg-base-100 mb-2 disabled:opacity-60"
              :disabled="startingMeeting"
              @click="startMeeting"
            >
              <span class="w-[30px] h-[30px] rounded-lg grid place-items-center flex-none" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"><Video :size="16" /></span>
              <div class="flex-1">
                <div class="text-[13px] font-semibold text-base-content">{{ startingMeeting ? 'Starting…' : 'Start a meeting' }}</div>
                <div class="text-[11.5px] text-base-content/40">Opens a guest-joinable room and logs it here</div>
              </div>
              <ArrowUpRight :size="15" class="text-base-content/40" />
            </button>

            <!-- tasks -->
            <div class="flex flex-col gap-1.5">
              <button
                v-for="t in linkedTasks"
                :key="t.taskId"
                type="button"
                class="crm-link flex items-center gap-2.5 px-[11px] py-2.5 rounded-[9px] border border-base-300 bg-base-100 text-left"
                :title="'Open ' + t.ref + ' in the tracker'"
                @click="goTask(t.taskId)"
              >
                <span class="w-[18px] h-[18px] rounded-md grid place-items-center flex-none" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"><SquareCheck :size="12" :stroke-width="2.2" /></span>
                <span class="font-mono text-[11px] font-semibold text-base-content/40">{{ t.ref }}</span>
                <span class="flex-1 text-[12.5px] text-base-content truncate">{{ t.title }}</span>
                <span class="w-2 h-2 rounded-full flex-none" :style="{ background: t.dot }" :title="t.status || 'status'" :aria-label="'Status: ' + (t.status || 'unknown')" />
                <ArrowUpRight :size="13" class="text-base-content/40 flex-none" />
              </button>

              <form v-if="addingTask" class="flex gap-1.5" @submit.prevent="submitTask">
                <input
                  id="crm-deal-task"
                  v-model="taskTitle"
                  class="flex-1 bg-base-200 rounded-[9px] px-3 py-2 text-[12.5px] text-base-content outline-none focus:ring-1 focus:ring-primary/40"
                  placeholder="Task title"
                  @keydown.esc.stop="addingTask = false"
                />
                <button type="submit" class="px-3 rounded-[9px] text-white text-[12px] font-bold disabled:opacity-50" :style="{ background: 'var(--accent)' }" :disabled="!taskTitle.trim() || savingTask">
                  {{ savingTask ? 'Adding…' : 'Add' }}
                </button>
              </form>
              <button v-else type="button" class="crm-link flex items-center gap-2 px-[11px] py-2 rounded-[9px] border-[1.5px] border-dashed border-base-300 text-base-content/50 text-[12.5px] font-semibold" @click="openTaskForm">
                <SquareCheck :size="14" :stroke-width="2.1" /> Create a task from this deal
              </button>
            </div>
          </div>

          <!-- activity -->
          <div class="px-5 py-4">
            <h3 class="text-[13.5px] font-bold text-base-content mb-3 m-0">Activity timeline</h3>

            <!-- composer -->
            <div class="rounded-[10px] border border-base-300 bg-base-100 p-2.5 mb-4">
              <div class="flex gap-1 mb-2">
                <button
                  v-for="t in LOG_TYPES"
                  :key="t.id"
                  type="button"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded-[7px] text-[11.5px] font-semibold border"
                  :style="logType === t.id
                    ? { background: `color-mix(in oklab, ${actColor(t.id)} 14%, var(--color-base-100))`, color: actColor(t.id), borderColor: `color-mix(in oklab, ${actColor(t.id)} 40%, transparent)` }
                    : { background: 'var(--color-base-200)', borderColor: 'transparent', color: 'var(--color-base-content)', opacity: 0.7 }"
                  @click="logType = t.id"
                >
                  <component :is="t.icon" :size="12" /> {{ t.label }}
                </button>
                <select v-if="contacts.length" v-model="logContactId" class="ml-auto bg-base-200 rounded-[7px] px-1.5 text-[11.5px] text-base-content/70 outline-none" aria-label="With contact">
                  <option value="">With contact…</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div class="flex gap-1.5">
                <input
                  id="crm-deal-log"
                  v-model="logBody"
                  class="flex-1 bg-base-200 rounded-[8px] px-2.5 py-1.5 text-[13px] text-base-content outline-none focus:ring-1 focus:ring-primary/40"
                  :placeholder="logType === 'note' ? 'Write a note…' : 'What happened on the ' + logType + '?'"
                  @keydown.enter.prevent="submitLog"
                />
                <button type="button" class="px-3 rounded-[8px] text-white text-[12.5px] font-bold disabled:opacity-50" :style="{ background: 'var(--accent)' }" :disabled="!logBody.trim()" @click="submitLog">Log</button>
              </div>
            </div>

            <div v-if="activities.length" class="relative">
              <div class="absolute left-[13px] top-3 bottom-3 w-[1.5px] bg-base-300" />
              <div v-for="a in activities" :key="a.id" class="crm-act flex gap-[11px] mb-[15px] relative">
                <span
                  class="w-[27px] h-[27px] rounded-lg flex-none grid place-items-center z-[1] border"
                  :style="{ background: `color-mix(in oklab, ${actColor(a.type)} 14%, var(--color-base-100))`, color: actColor(a.type), borderColor: 'var(--color-base-100)' }"
                >
                  <component :is="actIcon(a.type)" :size="14" />
                </span>
                <div class="flex-1 pt-px min-w-0">
                  <div class="text-[13px] text-base-content leading-relaxed">
                    <strong class="font-bold">{{ actorName(a.actorId) }}</strong> <span class="text-base-content/60">{{ a.body }}</span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[11px] text-base-content/40">{{ relTime(a.createdAt) }}</span>
                    <a
                      v-if="a.meta && a.meta.startsWith('/meet/')"
                      class="text-[10.5px] font-semibold px-1.5 py-px rounded-[5px] hover:underline"
                      :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"
                      :href="a.meta" target="_blank" rel="noopener"
                    >Join meeting</a>
                    <span v-else-if="a.meta" class="text-[10.5px] font-semibold px-1.5 py-px rounded-[5px] bg-base-200 text-base-content/60" :class="a.meta.startsWith('TASK') ? 'font-mono' : ''">{{ a.meta }}</span>
                  </div>
                </div>
                <button type="button" class="crm-act-del w-6 h-6 rounded-md grid place-items-center text-base-content/30 hover:text-[#c2253c] hover:bg-base-200 flex-none" :aria-label="'Remove entry: ' + a.body" title="Remove entry" @click="removeActivity(a.id)">
                  <X :size="13" />
                </button>
              </div>
            </div>
            <div v-else class="text-[12.5px] text-base-content/40">No activity yet — log the first touch above.</div>
          </div>
        </div>

        <!-- footer -->
        <div class="px-4 py-3 border-t border-base-300 flex gap-2">
          <button
            v-if="isWon && co && !co.isClient"
            type="button"
            class="flex-1 flex items-center justify-center gap-[7px] px-3 py-[11px] rounded-[10px] text-white text-[13.5px] font-bold min-w-0"
            :style="{ background: 'var(--accent)' }"
            @click="emit('convert', deal)"
          >
            <Handshake :size="16" class="shrink-0" /> <span class="truncate">Convert to client workspace</span>
          </button>
          <button
            v-else-if="co && co.isClient"
            type="button"
            class="flex-1 flex items-center justify-center gap-[7px] px-3 py-[11px] rounded-[10px] text-white text-[13.5px] font-bold min-w-0"
            :style="{ background: 'var(--accent)' }"
            @click="goChannel(co.channelId, co.clientId)"
          >
            <ArrowUpRight :size="16" class="shrink-0" /> <span class="truncate">Open client workspace</span>
          </button>
          <template v-else>
            <a
              v-if="emailContact"
              class="flex-1 flex items-center justify-center gap-[7px] px-3 py-[11px] rounded-[10px] text-white text-[13.5px] font-bold"
              :style="{ background: 'var(--accent)' }"
              :href="'mailto:' + emailContact.email"
              :title="'Email ' + emailContact.name + ' (' + emailContact.email + ')'"
              @click="onEmail"
            >
              <Mail :size="16" /> Email {{ emailContact.name.split(' ')[0] }}
            </a>
            <button v-else disabled type="button" title="Add a contact with an email first" class="flex-1 flex items-center justify-center gap-[7px] px-3 py-[11px] rounded-[10px] text-white text-[13.5px] font-bold opacity-60 cursor-not-allowed" :style="{ background: 'var(--accent)' }">
              <Mail :size="16" /> Send email
            </button>
            <button type="button" class="flex items-center gap-[7px] px-4 rounded-[10px] border border-base-300 text-base-content/60 text-[13px] font-semibold hover:bg-base-200" @click="focusComposer('call')">
              <Phone :size="15" /> Log call
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.crm-scrim-enter-active, .crm-scrim-leave-active { transition: opacity 0.2s ease; }
.crm-scrim-enter-from, .crm-scrim-leave-to { opacity: 0; }

.crm-panel-enter-active { transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.24s ease; }
.crm-panel-leave-active { transition: transform 0.18s ease-in, opacity 0.18s ease-in; }
.crm-panel-enter-from, .crm-panel-leave-to { transform: translateX(28px); opacity: 0; }

.crm-link { transition: border-color 0.12s, background 0.12s; }
.crm-link:hover { border-color: var(--accent-bord); background: var(--color-base-200); }

.crm-stage { background: var(--color-base-200); color: var(--color-base-content); border-color: transparent; opacity: 0.75; transition: opacity 0.12s, background 0.12s; }
.crm-stage:hover { opacity: 1; background: var(--color-base-300); }
.crm-stage:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.crm-stage-on { opacity: 1; font-weight: 700; }

.crm-editable { transition: background 0.12s; }
.crm-editable:hover { background: var(--color-base-200); }

.crm-pick:hover { background: var(--color-base-200); }

.crm-act .crm-act-del { opacity: 0; transition: opacity 0.12s; }
.crm-act:hover .crm-act-del, .crm-act-del:focus-visible { opacity: 1; }
</style>
