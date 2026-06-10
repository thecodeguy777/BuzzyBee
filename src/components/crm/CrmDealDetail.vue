<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  X, MessageSquare, ListChecks, Mail, Pencil, Route, Phone, Calendar, Trophy,
  User, Users, Filter, SquareCheck, ArrowUpRight, Plus, Handshake,
} from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import CrmHealthDot from './CrmHealthDot.vue'
import { useCrmStore } from '@/stores/crm'
import { useTeamStore } from '@/stores/team'
import { useChannelsStore } from '@/stores/channels'
import { useClientsStore } from '@/stores/clients'
import { userColor } from '@/lib/userColor'
import { STAGES, LOST, fmtMoney, relTime, ACT_COLOR, type Deal, type StageId, type ActivityType } from '@/lib/crmData'

const props = defineProps<{ deal: Deal }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'move', id: string, stage: StageId): void
  (e: 'convert', deal: Deal): void
}>()

const router = useRouter()
const crm = useCrmStore()
const team = useTeamStore()
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

function requestClose() {
  visible.value = false // play the leave transition; @after-leave emits 'close'
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { requestClose(); return }
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
function actorName(id: string | null) {
  return (id ? team.profiles[id]?.full_name?.split(' ')[0] : null) ?? 'System'
}
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
          <button ref="closeBtn" type="button" class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Close" @click="requestClose">
            <X :size="17" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- title + value -->
          <div class="px-5 pt-[18px] pb-3.5 border-b border-base-300">
            <h2 class="m-0 mb-2.5 text-[21px] font-bold text-base-content tracking-tight leading-snug">{{ deal.title }}</h2>
            <div class="flex items-center gap-3.5">
              <span class="text-[28px] font-extrabold text-base-content" style="letter-spacing:-1px">{{ fmtMoney(deal.value) }}</span>
              <CrmHealthDot :health="deal.health" />
              <span class="inline-flex items-center gap-1.5 text-[12.5px] text-base-content/60"><Calendar :size="14" /> {{ deal.close }}</span>
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
              <div class="flex items-center gap-2">
                <CrmAvatar :name="ownerProfile?.full_name ?? 'Unassigned'" :avatar-url="ownerProfile?.avatar_url" :color="deal.ownerId ? userColor(deal.ownerId) : 'var(--accent)'" :size="22" :radius="6" />
                <span class="text-[13px] text-base-content font-semibold">{{ ownerProfile?.full_name ?? 'Unassigned' }}</span>
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
              <span class="text-[13px] text-base-content/60">{{ deal.source || '—' }}</span>
            </div>
          </div>

          <!-- connected -->
          <div class="px-5 py-4 border-b border-base-300">
            <h3 class="flex items-center gap-[7px] mb-[11px] m-0 text-[13.5px] font-bold text-base-content">
              <Route :size="15" :style="{ color: 'var(--accent-fg)' }" /> Connected across your workspace
            </h3>

            <button
              v-if="deal.channelName"
              type="button"
              class="crm-link flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-[9px] border border-base-300 bg-base-100 mb-2"
              @click="goChannel(deal.channelId, co?.clientId)"
            >
              <span class="w-[30px] h-[30px] rounded-lg grid place-items-center flex-none" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"><MessageSquare :size="16" /></span>
              <div class="flex-1">
                <div class="text-[13px] font-semibold text-base-content">#{{ deal.channelName }}</div>
                <div class="text-[11.5px] text-base-content/40">Open the conversation in Comms</div>
              </div>
              <ArrowUpRight :size="15" class="text-base-content/40" />
            </button>
            <button v-else disabled aria-label="Link a chat channel — coming soon" class="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-[9px] border-[1.5px] border-dashed border-base-300 text-base-content/40 mb-2 text-[13px] font-semibold opacity-60 cursor-not-allowed">
              <Plus :size="15" /> Link a chat channel <span class="ml-auto text-[10px] font-bold uppercase tracking-wide">Soon</span>
            </button>

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
              <button disabled aria-label="Create a task from this deal — coming soon" class="flex items-center gap-2 px-[11px] py-2 rounded-[9px] border-[1.5px] border-dashed border-base-300 text-base-content/40 text-[12.5px] font-semibold opacity-60 cursor-not-allowed">
                <SquareCheck :size="14" :stroke-width="2.1" /> Create a task from this deal <span class="ml-auto text-[10px] font-bold uppercase tracking-wide">Soon</span>
              </button>
            </div>
          </div>

          <!-- activity -->
          <div class="px-5 py-4">
            <h3 class="text-[13.5px] font-bold text-base-content mb-3.5 m-0">Activity timeline</h3>
            <div v-if="activities.length" class="relative">
              <div class="absolute left-[13px] top-3 bottom-3 w-[1.5px] bg-base-300" />
              <div v-for="a in activities" :key="a.id" class="flex gap-[11px] mb-[15px] relative">
                <span
                  class="w-[27px] h-[27px] rounded-lg flex-none grid place-items-center z-[1] border"
                  :style="{ background: `color-mix(in oklab, ${actColor(a.type)} 14%, var(--color-base-100))`, color: actColor(a.type), borderColor: 'var(--color-base-100)' }"
                >
                  <component :is="actIcon(a.type)" :size="14" />
                </span>
                <div class="flex-1 pt-px">
                  <div class="text-[13px] text-base-content leading-relaxed">
                    <strong class="font-bold">{{ actorName(a.actorId) }}</strong> <span class="text-base-content/60">{{ a.body }}</span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="text-[11px] text-base-content/40">{{ relTime(a.createdAt) }}</span>
                    <span v-if="a.meta" class="text-[10.5px] font-semibold px-1.5 py-px rounded-[5px] bg-base-200 text-base-content/60" :class="a.meta.startsWith('TASK') ? 'font-mono' : ''">{{ a.meta }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-[12.5px] text-base-content/40">No activity yet.</div>
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
            <button disabled aria-label="Send email — coming soon" type="button" class="flex-1 flex items-center justify-center gap-[7px] px-3 py-[11px] rounded-[10px] text-white text-[13.5px] font-bold opacity-60 cursor-not-allowed" :style="{ background: 'var(--accent)' }">
              <Mail :size="16" /> Send email
            </button>
            <button disabled aria-label="Log call — coming soon" type="button" class="flex items-center gap-[7px] px-4 rounded-[10px] border border-base-300 text-base-content/60 text-[13px] font-semibold opacity-60 cursor-not-allowed">
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
</style>
