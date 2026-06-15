<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Handshake, X, ChevronDown, Building2, Plus, Route, MessageSquare, ListChecks, Filter } from 'lucide-vue-next'
import CrmAvatar from './CrmAvatar.vue'
import { useCrmStore } from '@/stores/crm'
import { useTeamStore } from '@/stores/team'
import { useAuthStore } from '@/stores/auth'
import { userColor } from '@/lib/userColor'
import { STAGES, HEALTH, SOURCES, fmtMoney, type StageId, type Health } from '@/lib/crmData'

const emit = defineEmits<{ (e: 'close'): void; (e: 'created'): void }>()

const crm = useCrmStore()
const team = useTeamStore()
const auth = useAuthStore()

// ── form state ────────────────────────────────────────────────────────────────
const title = ref('')
const companyId = ref<string | null>(null)
const stage = ref<StageId>('lead')
const value = ref('')
const close = ref('')
const ownerId = ref<string | null>(auth.user?.id ?? null)
const health = ref<Health>('warm')
const source = ref(SOURCES[0])
const linkChannel = ref(true)
const kickoff = ref(false)
const saving = ref(false)

const co = computed(() => (companyId.value ? crm.company(companyId.value) : null))
const channelName = computed(() => co.value?.channelName ?? null)
const valid = computed(() => title.value.trim().length > 0 && !!companyId.value)
const summary = computed(() => `${fmtMoney(Number(value.value) || 0)} · ${STAGES.find((s) => s.id === stage.value)?.label ?? 'Lead'}`)
const owners = computed(() => Object.values(team.profiles))
const healthOpts: { id: Health; label: string }[] = [{ id: 'hot', label: 'Hot' }, { id: 'warm', label: 'Warm' }, { id: 'cold', label: 'Cold' }]

// ── company combo ─────────────────────────────────────────────────────────────
const comboOpen = ref(false)
const query = ref('')
const filtered = computed(() => {
  // Cap the rendered list — a workspace can hold thousands of companies and
  // rendering them all locks the combo. Search narrows it.
  const q = query.value.toLowerCase()
  const list = Object.values(crm.companies)
  return (q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list).slice(0, 100)
})
function pickCompany(id: string) {
  companyId.value = id
  comboOpen.value = false
  query.value = ''
}
async function createCompanyInline() {
  const name = query.value.trim()
  if (!name) return
  const c = await crm.createCompany({ name })
  if (c) pickCompany(c.id)
}

// ── submit ────────────────────────────────────────────────────────────────────
async function submit() {
  if (!valid.value || saving.value) return
  saving.value = true
  const ok = await crm.createDeal({
    title: title.value, companyId: companyId.value!, stage: stage.value,
    value: Number(value.value) || 0, close: close.value, source: source.value,
    ownerId: ownerId.value, health: health.value,
    channelId: linkChannel.value ? co.value?.channelId ?? null : null,
    kickoffTask: kickoff.value,
  })
  saving.value = false
  if (ok) { emit('created'); requestClose() }
}

// ── slide-out shell (focus trap + transitions) ────────────────────────────────
const panel = ref<HTMLElement | null>(null)
const visible = ref(false)
let triggerEl: HTMLElement | null = null
function requestClose() { visible.value = false }
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { if (comboOpen.value) { comboOpen.value = false; return } requestClose(); return }
  if (e.key === 'Tab' && panel.value) {
    const els = Array.from(panel.value.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null)
    if (!els.length) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}
onMounted(() => {
  triggerEl = document.activeElement as HTMLElement
  document.addEventListener('keydown', onKey)
  if (auth.user?.id) void team.fetchProfiles([auth.user.id])
  visible.value = true
  void nextTick(() => panel.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus())
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  triggerEl?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="crm-scrim">
      <div v-if="visible" class="fixed inset-0 z-[100]" style="background: rgba(0,0,0,.5)" @click="requestClose" />
    </Transition>
    <Transition name="crm-panel" @after-leave="emit('close')">
      <div
        v-if="visible"
        ref="panel"
        class="crm-detail fixed top-0 right-0 bottom-0 z-[101] w-[480px] max-w-[95vw] flex flex-col bg-base-100 border-l border-base-300"
        style="box-shadow: -16px 0 48px -16px rgba(0,0,0,.45)"
        role="dialog"
        aria-modal="true"
        aria-label="New deal"
      >
        <!-- header -->
        <div class="flex items-center gap-2.5 px-[18px] py-[15px] border-b border-base-300">
          <span class="w-[30px] h-[30px] rounded-[9px] grid place-items-center" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }"><Handshake :size="17" /></span>
          <div class="flex-1">
            <div class="text-[15px] font-bold text-base-content">New deal</div>
            <div class="text-[11.5px] text-base-content/40">Set it up and its connections in one go</div>
          </div>
          <button type="button" class="w-[30px] h-[30px] rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Close" @click="requestClose"><X :size="17" /></button>
        </div>

        <div class="flex-1 overflow-y-auto px-[18px] py-4">
          <!-- title -->
          <div class="mb-[15px]">
            <label class="crm-lbl">Deal title</label>
            <input v-model="title" data-autofocus type="text" placeholder="e.g. Website rebuild" class="crm-in w-full" @keydown.enter="submit" />
          </div>

          <!-- company combo -->
          <div class="mb-[15px]">
            <label class="crm-lbl">Company</label>
            <div class="relative">
              <button type="button" class="crm-in w-full flex items-center gap-2.5 text-left" :class="comboOpen ? 'crm-in-on' : ''" @click="comboOpen = !comboOpen">
                <template v-if="co">
                  <CrmAvatar :name="co.name" :initials="co.initials" :color="co.color" :size="20" :radius="6" />
                  <span class="text-[13.5px] font-semibold text-base-content">{{ co.name }}</span>
                </template>
                <template v-else>
                  <span class="w-5 h-5 rounded-md border-[1.5px] border-dashed border-base-content/40 grid place-items-center text-base-content/40"><Building2 :size="12" /></span>
                  <span class="text-[13.5px] text-base-content/40">Select company</span>
                </template>
                <ChevronDown :size="15" class="ml-auto text-base-content/40" />
              </button>
              <template v-if="comboOpen">
                <div class="fixed inset-0 z-[105]" @click="comboOpen = false" />
                <div class="absolute top-full left-0 right-0 mt-1.5 z-[106] rounded-[10px] border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
                  <div class="p-2 border-b border-base-200">
                    <input v-model="query" autofocus placeholder="Search companies…" class="crm-in w-full !h-9 !text-[13px]" @keydown.enter="filtered.length ? pickCompany(filtered[0].id) : createCompanyInline()" />
                  </div>
                  <div class="max-h-52 overflow-y-auto p-1">
                    <button v-for="c in filtered" :key="c.id" type="button" class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-base-200 text-left" @click="pickCompany(c.id)">
                      <CrmAvatar :name="c.name" :initials="c.initials" :color="c.color" :size="22" :radius="6" />
                      <span class="text-[13px] font-semibold text-base-content">{{ c.name }}</span>
                      <span class="ml-auto text-[11px] text-base-content/40">{{ c.industry }}</span>
                    </button>
                    <div v-if="!filtered.length && !query" class="px-2.5 py-2.5 text-[12.5px] text-base-content/40 text-center">No companies yet</div>
                  </div>
                  <button type="button" class="w-full flex items-center gap-2 px-3 py-2.5 border-t border-base-200 hover:bg-base-200 text-[13px] font-semibold" :style="{ color: 'var(--accent-fg)' }" @click="createCompanyInline">
                    <Plus :size="15" /> New company<template v-if="query"> “{{ query }}”</template>
                  </button>
                </div>
              </template>
            </div>
          </div>

          <!-- stage -->
          <div class="mb-[15px]">
            <label class="crm-lbl">Pipeline stage</label>
            <div class="crm-seg">
              <button v-for="s in STAGES" :key="s.id" type="button" class="crm-seg-btn" :class="stage === s.id ? 'crm-seg-on' : ''" @click="stage = s.id">
                <span class="w-[7px] h-[7px] rounded-full" :style="{ background: s.dot }" />{{ s.label }}
              </button>
            </div>
          </div>

          <!-- value + close -->
          <div class="flex gap-3 mb-[15px]">
            <div class="flex-1 min-w-0">
              <label class="crm-lbl">Value</label>
              <div class="crm-in flex items-center !px-0 overflow-hidden">
                <span class="pl-3 pr-1 text-base-content/40 font-bold">$</span>
                <input :value="value" inputmode="numeric" placeholder="0" class="flex-1 min-w-0 bg-transparent outline-none py-2.5 pr-3 text-[14px] font-semibold text-base-content" @input="value = ($event.target as HTMLInputElement).value.replace(/[^0-9]/g, '')" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <label class="crm-lbl">Close date</label>
              <input v-model="close" type="text" placeholder="e.g. Jul 5" class="crm-in w-full" />
            </div>
          </div>

          <!-- owner -->
          <div class="mb-[15px]">
            <label class="crm-lbl">Owner</label>
            <div class="crm-in w-full flex items-center gap-2.5 !py-0">
              <CrmAvatar :name="ownerId ? (team.profiles[ownerId]?.full_name ?? '') : ''" :avatar-url="ownerId ? team.profiles[ownerId]?.avatar_url : null" :color="ownerId ? userColor(ownerId) : 'var(--accent)'" :size="20" :radius="6" />
              <select v-model="ownerId" class="flex-1 bg-transparent outline-none py-2.5 text-[13.5px] font-semibold text-base-content">
                <option v-for="o in owners" :key="o.id" :value="o.id">{{ o.full_name }}</option>
              </select>
            </div>
          </div>

          <!-- health + source -->
          <div class="flex gap-3 mb-[15px]">
            <div class="flex-1 min-w-0">
              <label class="crm-lbl">Health</label>
              <div class="crm-seg">
                <button v-for="h in healthOpts" :key="h.id" type="button" class="crm-seg-btn" :class="health === h.id ? 'crm-seg-on' : ''" @click="health = h.id">
                  <span class="w-[7px] h-[7px] rounded-full" :style="{ background: HEALTH[h.id].color }" />{{ h.label }}
                </button>
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <label class="crm-lbl">Source</label>
              <div class="crm-in w-full flex items-center gap-2 !py-0">
                <Filter :size="15" class="text-base-content/40 shrink-0" />
                <select v-model="source" class="flex-1 bg-transparent outline-none py-2.5 text-[13.5px] font-semibold text-base-content">
                  <option v-for="s in SOURCES" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
            </div>
          </div>

          <!-- wire into workspace -->
          <div class="rounded-[11px] p-[13px_14px] px-3.5 py-3.5" :style="{ background: 'var(--accent-soft)', border: '1px solid var(--accent-bord)' }">
            <div class="flex items-center gap-[7px] mb-3">
              <Route :size="15" :style="{ color: 'var(--accent-fg)' }" />
              <span class="text-[12.5px] font-bold" :style="{ color: 'var(--accent-fg)' }">Wire it into your workspace</span>
            </div>
            <label class="flex items-center gap-2.5 mb-2.5 cursor-pointer">
              <button type="button" class="crm-toggle" :class="linkChannel ? 'crm-toggle-on' : ''" role="switch" :aria-checked="linkChannel" @click="linkChannel = !linkChannel"><span class="crm-knob" /></button>
              <div class="flex-1">
                <div class="text-[12.5px] font-semibold text-base-content">Link a chat channel</div>
                <div class="text-[11px] text-base-content/50">
                  <template v-if="channelName">Opens <strong :style="{ color: 'var(--accent-fg)' }">#{{ channelName }}</strong> in Comms</template>
                  <template v-else>Pick a company with a channel to link it</template>
                </div>
              </div>
              <MessageSquare :size="15" :style="{ color: 'var(--accent-fg)' }" />
            </label>
            <label class="flex items-center gap-2.5 cursor-pointer">
              <button type="button" class="crm-toggle" :class="kickoff ? 'crm-toggle-on' : ''" role="switch" :aria-checked="kickoff" @click="kickoff = !kickoff"><span class="crm-knob" /></button>
              <div class="flex-1">
                <div class="text-[12.5px] font-semibold text-base-content">Create a kickoff task on win</div>
                <div class="text-[11px] text-base-content/50">Auto-adds a task to the tracker</div>
              </div>
              <ListChecks :size="15" :style="{ color: 'var(--accent-fg)' }" />
            </label>
          </div>
        </div>

        <!-- footer -->
        <div class="px-[18px] py-3.5 border-t border-base-300 flex items-center gap-2.5">
          <span class="text-[12.5px] text-base-content/40">{{ summary }}</span>
          <div class="flex-1" />
          <button type="button" class="px-4 py-2.5 rounded-[9px] text-[13.5px] font-semibold text-base-content/70 border border-base-300 hover:bg-base-200" @click="requestClose">Cancel</button>
          <button type="button" class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[9px] text-[13.5px] font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed" :style="{ background: 'var(--accent)' }" :disabled="!valid || saving" @click="submit">
            <Handshake :size="16" /> {{ saving ? 'Creating…' : 'Create deal' }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.crm-lbl { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.3px; color: var(--color-base-content); opacity: 0.45; text-transform: uppercase; margin-bottom: 7px; }
.crm-in { height: 42px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--color-base-300); background: var(--color-base-200); color: var(--color-base-content); font-size: 14px; outline: none; transition: border-color 0.12s; }
.crm-in:focus, .crm-in-on { border-color: var(--accent); }
input.crm-in { font-weight: 500; }

.crm-seg { display: flex; gap: 4px; background: var(--color-base-200); padding: 3px; border-radius: 9px; flex-wrap: wrap; }
.crm-seg-btn { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; color: var(--color-base-content); opacity: 0.6; transition: all 0.1s; }
.crm-seg-btn:hover { opacity: 0.85; }
.crm-seg-on { background: var(--color-base-100); opacity: 1; box-shadow: var(--sh-card); }
.crm-seg-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.crm-toggle { width: 34px; height: 20px; border-radius: 11px; flex: none; position: relative; background: var(--color-base-300); transition: background 0.15s; }
.crm-toggle-on { background: var(--accent); }
.crm-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.crm-toggle-on .crm-knob { left: 16px; }

.crm-scrim-enter-active, .crm-scrim-leave-active { transition: opacity 0.2s ease; }
.crm-scrim-enter-from, .crm-scrim-leave-to { opacity: 0; }
.crm-panel-enter-active { transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.24s ease; }
.crm-panel-leave-active { transition: transform 0.18s ease-in, opacity 0.18s ease-in; }
.crm-panel-enter-from, .crm-panel-leave-to { transform: translateX(28px); opacity: 0; }
</style>
