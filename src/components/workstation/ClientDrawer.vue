<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  X,
  Slack,
  Mail,
  Sparkles,
  Crown,
  UserPlus,
  X as XIcon,
  Search,
  Hash,
  CircleDashed,
  Pause,
  Archive,
  StickyNote,
  Tag,
  Users as UsersIcon,
  ListTodo
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { useClientsStore, type Client, type Channel, type ClientStatus, type ClientTier } from '@/stores/clients'
import { useTeamStore } from '@/stores/team'
import { useTasksStore } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const props = defineProps<{ clientId: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const clients = useClientsStore()
const team = useTeamStore()
const tasks = useTasksStore()
const auth = useAuthStore()
const router = useRouter()

const open = computed(() => props.clientId !== null)
const c = computed<Client | null>(
  () => clients.clients.find((x) => x.id === props.clientId) ?? null
)

const name = ref('')
const channel = ref<Channel | ''>('')
const slackUrl = ref('')
const emailTo = ref('')
const monthlyRate = ref<number | null>(null)
const tier = ref<ClientTier | ''>('')
const hivemind = ref(false)
const status = ref<ClientStatus>('active')
const notes = ref('')

const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
let savedTimer: ReturnType<typeof setTimeout> | undefined

const statusMeta: Record<ClientStatus, { label: string; icon: any; class: string; dot: string }> = {
  active: { label: 'Active', icon: CircleDashed, class: 'bg-success/10 text-success', dot: 'bg-success' },
  paused: { label: 'Paused', icon: Pause, class: 'bg-warning/10 text-warning', dot: 'bg-warning' },
  archived: { label: 'Archived', icon: Archive, class: 'bg-base-200 text-base-content/60', dot: 'bg-base-content/30' }
}

function syncFromClient() {
  if (!c.value) return
  name.value = c.value.name
  channel.value = c.value.preferred_channel ?? ''
  slackUrl.value = c.value.slack_webhook_url ?? ''
  emailTo.value = c.value.email_to ?? ''
  monthlyRate.value = c.value.monthly_rate
  tier.value = c.value.tier ?? ''
  hivemind.value = c.value.hivemind_enabled
  status.value = c.value.status
  notes.value = c.value.notes ?? ''
  saveState.value = 'idle'
}
watch(c, () => syncFromClient(), { immediate: true })

async function patchField(patch: Partial<Client>) {
  if (!c.value) return
  if (savedTimer) clearTimeout(savedTimer)
  saveState.value = 'saving'
  try {
    await clients.updateClient(c.value.id, patch)
    saveState.value = 'saved'
    savedTimer = setTimeout(() => {
      if (saveState.value === 'saved') saveState.value = 'idle'
    }, 1500)
  } catch (e) {
    console.warn('[client drawer]', (e as Error).message)
    saveState.value = 'idle'
    syncFromClient()
  }
}

async function saveName() {
  if (!c.value || !name.value.trim() || name.value.trim() === c.value.name) return
  await patchField({ name: name.value.trim() })
}
async function saveChannel() {
  if (!c.value || (c.value.preferred_channel ?? '') === channel.value) return
  await patchField({ preferred_channel: channel.value || null })
}
async function saveSlack() {
  if (!c.value || (c.value.slack_webhook_url ?? '') === slackUrl.value) return
  await patchField({ slack_webhook_url: slackUrl.value || null })
}
async function saveEmail() {
  if (!c.value || (c.value.email_to ?? '') === emailTo.value) return
  await patchField({ email_to: emailTo.value || null })
}
async function saveRate() {
  if (!c.value || c.value.monthly_rate === monthlyRate.value) return
  await patchField({ monthly_rate: monthlyRate.value })
}
async function saveTier() {
  if (!c.value || (c.value.tier ?? '') === tier.value) return
  await patchField({ tier: tier.value || null })
}
async function saveHivemind() {
  if (!c.value || c.value.hivemind_enabled === hivemind.value) return
  await patchField({ hivemind_enabled: hivemind.value })
}
async function saveStatus(value: ClientStatus) {
  if (!c.value || c.value.status === value) return
  status.value = value
  await patchField({ status: value })
}
async function saveNotes() {
  if (!c.value || (c.value.notes ?? '') === notes.value) return
  await patchField({ notes: notes.value || null })
}

const myPmList = computed(() => {
  if (!c.value) return []
  const list = clients.pmsByClient[c.value.id] ?? []
  return list
    .map((cp) => ({ ...cp, profile: team.profiles[cp.pm_id] }))
    .filter((x) => x.profile)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
})

// PMs added to a client may have no VA assignment yet (e.g. fresh add of
// Mark to Banahaw), so team.profiles — which is populated from assignments —
// won't have them. Pull any missing profiles directly so the list renders.
watch(
  () => (c.value ? clients.pmsByClient[c.value.id] ?? [] : []),
  (list) => {
    const missing = list.map((cp) => cp.pm_id).filter((id) => !team.profiles[id])
    if (missing.length) void team.fetchProfiles(missing)
  },
  { immediate: true, deep: true }
)

// Active assignments for this client, with VA profile attached.
interface AssignedVa {
  va_id: string
  pm_id: string | null
  status: 'active' | 'paused' | 'ended'
  started_at: string
  open_tasks: number
  profile: { full_name: string | null; email: string | null; avatar_url: string | null } | null
}
const assignedVas = computed<AssignedVa[]>(() => {
  if (!c.value) return []
  const cid = c.value.id
  const rows = team.assignments.filter((a) => a.client_id === cid && a.status !== 'ended')
  return rows.map((a) => {
    const open = tasks.tasks.filter(
      (t) =>
        t.assignee_id === a.va_id &&
        t.client_id === cid &&
        t.status !== 'done' &&
        t.status !== 'cancelled'
    ).length
    const p = team.profiles[a.va_id]
    return {
      va_id: a.va_id,
      pm_id: a.pm_id,
      status: a.status,
      started_at: a.started_at,
      open_tasks: open,
      profile: p
        ? { full_name: p.full_name, email: p.email, avatar_url: p.avatar_url }
        : null
    }
  })
})

// Lazy-load any VA profiles we don't have. Mirror of the PM-list pattern —
// a fresh account, or one with assignments but no profile prefetch yet,
// would otherwise render as a blank row.
watch(
  assignedVas,
  (list) => {
    const missing = list.map((v) => v.va_id).filter((id) => !team.profiles[id])
    if (missing.length) void team.fetchProfiles(missing)
  },
  { immediate: true, deep: true }
)

function openVaDetail(vaId: string) {
  close()
  void router.push({ name: 'workstation-team', params: { vaId } })
}

// ── Add VA picker (mirrors the PM add flow) ───────────────────────────────
const showAddVa = ref(false)
const vaSearch = ref('')
const vaSearchResults = ref<{ id: string; full_name: string | null; email: string | null }[]>([])
const vaSearchLoading = ref(false)
const vaActionError = ref<string | null>(null)
let vaSearchDebounce: ReturnType<typeof setTimeout> | null = null

watch(vaSearch, () => {
  if (vaSearchDebounce) clearTimeout(vaSearchDebounce)
  vaSearchDebounce = setTimeout(runVaSearch, 200)
})
watch(showAddVa, (is) => {
  if (is) void runVaSearch()
})

async function runVaSearch() {
  if (!c.value) return
  vaSearchLoading.value = true
  try {
    const pattern = `%${vaSearch.value.split(/\s+/).filter(Boolean).join('%')}%`
    let q = supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('role', 'va')
      .limit(15)
    if (vaSearch.value.trim()) {
      q = q.or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    }
    const { data, error: err } = await q
    if (err) throw err
    const existing = new Set(assignedVas.value.map((v) => v.va_id))
    vaSearchResults.value = (data ?? [])
      .filter((p) => !existing.has(p.id))
      .map((p) => ({ id: p.id, full_name: (p as any).full_name ?? null, email: (p as any).email ?? null }))
  } catch (e) {
    console.warn('[va search]', (e as Error).message)
    vaSearchResults.value = []
  } finally {
    vaSearchLoading.value = false
  }
}

async function addVa(profileId: string) {
  if (!c.value) return
  vaActionError.value = null
  // Default the VA's PM to the current user if they're a PM/admin on the
  // client; otherwise leave null and an admin can set it later.
  const myPmId = (clients.pmsByClient[c.value.id] ?? []).some(
    (cp) => cp.pm_id === auth.user?.id
  )
    ? auth.user?.id
    : null
  try {
    await team.addAssignment({
      va_id: profileId,
      client_id: c.value.id,
      pm_id: myPmId ?? null
    })
    vaSearch.value = ''
    vaSearchResults.value = []
    showAddVa.value = false
  } catch (e) {
    const msg = (e as Error).message
    if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('permission denied')) {
      vaActionError.value = "You don't have permission to add VAs to this client. Ask an admin or the primary PM."
    } else {
      vaActionError.value = msg
    }
    console.warn('[client drawer addVa]', msg)
  }
}

async function removeVa(vaId: string) {
  if (!c.value) return
  if (!confirm('End this VA\'s assignment on this client? The history stays in the database.')) return
  vaActionError.value = null
  try {
    const active = team.assignments.find(
      (a) => a.va_id === vaId && a.client_id === c.value!.id && a.status === 'active'
    )
    if (!active) return
    await team.endAssignment(active.id)
  } catch (e) {
    vaActionError.value = (e as Error).message
    console.warn('[client drawer removeVa]', (e as Error).message)
  }
}

const showAddPm = ref(false)
const pmSearch = ref('')
const pmSearchResults = ref<{ id: string; full_name: string | null; email: string | null }[]>([])
const pmSearchLoading = ref(false)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

watch(pmSearch, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(runPmSearch, 200)
})

// Auto-load the full PM list the moment the picker opens, so users don't
// have to type to discover who's available.
watch(showAddPm, (is) => {
  if (is) void runPmSearch()
})

async function runPmSearch() {
  if (!c.value) return
  pmSearchLoading.value = true
  try {
    const pattern = `%${pmSearch.value.split(/\s+/).filter(Boolean).join('%')}%`
    let q = supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['pm', 'admin', 'superadmin'])
      .limit(15)
    if (pmSearch.value.trim()) {
      q = q.or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    }
    const { data, error: err } = await q
    if (err) throw err
    const existing = new Set(myPmList.value.map((x) => x.pm_id))
    pmSearchResults.value = (data ?? [])
      .filter((p) => !existing.has(p.id))
      .map((p) => ({ id: p.id, full_name: (p as any).full_name ?? null, email: (p as any).email ?? null }))
  } catch (e) {
    console.warn('[pm search]', (e as Error).message)
    pmSearchResults.value = []
  } finally {
    pmSearchLoading.value = false
  }
}

const pmActionError = ref<string | null>(null)

function describeRlsError(msg: string) {
  // Translate Postgres permission errors into something a PM can act on.
  const lower = msg.toLowerCase()
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return "You don't have permission to modify this client's PMs. Either be the primary PM, or have an admin add you first."
  }
  return msg
}

async function addPm(profileId: string, isPrimary = false) {
  if (!c.value) return
  pmActionError.value = null
  // If no primary exists yet, force this add to be primary so RLS bootstrap fires.
  const noPrimary = !myPmList.value.some((x) => x.is_primary)
  const wantsPrimary = isPrimary || noPrimary
  try {
    await clients.addPm(c.value.id, profileId, wantsPrimary)
    pmSearch.value = ''
    pmSearchResults.value = []
    showAddPm.value = false
  } catch (e) {
    pmActionError.value = describeRlsError((e as Error).message)
    console.warn('[client drawer addPm]', (e as Error).message)
  }
}
async function makePrimary(profileId: string) {
  if (!c.value) return
  pmActionError.value = null
  try {
    await clients.setPrimaryPm(c.value.id, profileId)
  } catch (e) {
    pmActionError.value = describeRlsError((e as Error).message)
    console.warn('[client drawer makePrimary]', (e as Error).message)
  }
}
async function removePm(profileId: string) {
  if (!c.value) return
  if (!confirm('Remove this PM from the client?')) return
  pmActionError.value = null
  try {
    await clients.removePm(c.value.id, profileId)
  } catch (e) {
    pmActionError.value = describeRlsError((e as Error).message)
    console.warn('[client drawer removePm]', (e as Error).message)
  }
}

const clientInitial = computed(() => (c.value?.name?.charAt(0) || 'C').toUpperCase())

function close() {
  emit('close')
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}
onMounted(() => document.addEventListener('keydown', onEsc))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))

watch(open, (is) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = is ? 'hidden' : ''
  if (is) {
    showAddPm.value = false
    pmSearch.value = ''
    pmSearchResults.value = []
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      :class="[
        'fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-200 ease-out',
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      ]"
      @click="close"
    />

    <aside
      :class="[
        'fixed top-0 right-0 z-40 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col',
        'transition-transform duration-300 ease-out will-change-transform',
        open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      ]"
      role="dialog"
      :aria-hidden="!open"
      aria-modal="true"
    >
      <!-- Header — large hero with avatar, name, status pill -->
      <header class="relative px-6 pt-5 pb-4 border-b border-base-300/60 shrink-0">
        <div class="absolute top-3 right-3 flex items-center gap-2">
          <span
            v-if="saveState === 'saving'"
            class="text-[0.7rem] text-base-content/50 italic"
          >
            Saving…
          </span>
          <span
            v-else-if="saveState === 'saved'"
            class="text-[0.7rem] text-success font-medium"
          >
            Saved
          </span>
          <button
            type="button"
            class="w-8 h-8 rounded-full flex items-center justify-center text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors"
            aria-label="Close"
            @click="close"
          >
            <X class="w-4 h-4" :stroke-width="2" />
          </button>
        </div>

        <div class="flex items-start gap-3" v-if="c">
          <div class="w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-display text-lg font-semibold shrink-0">
            {{ clientInitial }}
          </div>
          <div class="flex-1 min-w-0 pt-0.5">
            <input
              v-model="name"
              type="text"
              class="font-display text-lg font-semibold w-full bg-transparent outline-none px-2 py-0.5 -ml-2 rounded hover:bg-base-200/60 focus:bg-base-200/80 transition-colors"
              placeholder="Client name"
              @blur="saveName"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
            <div class="flex items-center gap-1.5 mt-1.5">
              <button
                v-for="(meta, key) in statusMeta"
                :key="key"
                type="button"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.65rem] font-medium uppercase tracking-wider transition-colors"
                :class="status === key ? meta.class : 'text-base-content/40 hover:text-base-content/70'"
                @click="saveStatus(key as ClientStatus)"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full"
                  :class="status === key ? meta.dot : 'bg-base-content/20'"
                />
                {{ meta.label }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto" v-if="c">
        <!-- Plan -->
        <section class="px-6 py-4 space-y-3">
          <div class="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
            <Tag class="w-3 h-3" :stroke-width="1.75" />
            Plan
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="block text-[0.65rem] text-base-content/50 font-medium">Tier</label>
              <select
                v-model="tier"
                class="w-full text-sm bg-transparent border-0 border-b border-base-300 rounded-none px-0 py-1 focus:outline-none focus:border-primary transition-colors capitalize"
                @change="saveTier"
              >
                <option value="">—</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="specialist">Specialist</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="block text-[0.65rem] text-base-content/50 font-medium">Monthly rate</label>
              <div class="flex items-center gap-1 border-b border-base-300 focus-within:border-primary transition-colors">
                <span class="text-sm text-base-content/60 pb-1">₱</span>
                <input
                  v-model.number="monthlyRate"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="60,000"
                  class="flex-1 text-sm bg-transparent outline-none py-1 tabular-nums"
                  @blur="saveRate"
                />
              </div>
            </div>
          </div>

          <!-- HiveMind feature card -->
          <button
            type="button"
            class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
            :class="
              hivemind
                ? 'border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5 shadow-sm'
                : 'border-base-300 bg-base-100/40 hover:border-base-content/20'
            "
            @click="hivemind = !hivemind; saveHivemind()"
          >
            <div
              class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
              :class="hivemind ? 'bg-primary/20 text-primary' : 'bg-base-200 text-base-content/50'"
            >
              <Sparkles class="w-4 h-4" :stroke-width="1.75" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium">HiveMind AI</div>
              <div class="text-[0.7rem] text-base-content/60 leading-snug mt-0.5">
                Live transcription, in-call Q&amp;A, auto-MoM. Charged separately.
              </div>
            </div>
            <span
              class="text-[0.65rem] uppercase tracking-wider font-semibold shrink-0"
              :class="hivemind ? 'text-primary' : 'text-base-content/40'"
            >
              {{ hivemind ? 'On' : 'Off' }}
            </span>
          </button>
        </section>

        <!-- Comms -->
        <section class="px-6 py-4 border-t border-base-300/60 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
              <Hash class="w-3 h-3" :stroke-width="1.75" />
              Communications
            </div>
            <div class="flex items-center gap-1 rounded-md bg-base-200/60 p-0.5">
              <button
                type="button"
                class="px-2 py-0.5 rounded text-[0.65rem] font-medium uppercase tracking-wider transition-colors"
                :class="channel === 'slack' ? 'bg-white shadow-sm text-base-content' : 'text-base-content/50 hover:text-base-content/80'"
                @click="channel = 'slack'; saveChannel()"
              >
                Slack
              </button>
              <button
                type="button"
                class="px-2 py-0.5 rounded text-[0.65rem] font-medium uppercase tracking-wider transition-colors"
                :class="channel === 'email' ? 'bg-white shadow-sm text-base-content' : 'text-base-content/50 hover:text-base-content/80'"
                @click="channel = 'email'; saveChannel()"
              >
                Email
              </button>
              <button
                v-if="channel"
                type="button"
                class="px-2 py-0.5 rounded text-[0.65rem] text-base-content/40 hover:text-error transition-colors"
                title="Clear"
                @click="channel = ''; saveChannel()"
              >
                <X class="w-3 h-3" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- Slack webhook -->
          <div class="space-y-1">
            <label class="flex items-center gap-1.5 text-[0.65rem] text-base-content/50 font-medium">
              <Slack class="w-3 h-3" :stroke-width="1.75" />
              Slack webhook URL
            </label>
            <input
              v-model="slackUrl"
              type="url"
              placeholder="https://hooks.slack.com/services/…"
              class="w-full text-sm bg-transparent outline-none py-1 border-b border-base-300 focus:border-primary transition-colors font-mono"
              @blur="saveSlack"
            />
          </div>

          <!-- Email destination -->
          <div class="space-y-1">
            <label class="flex items-center gap-1.5 text-[0.65rem] text-base-content/50 font-medium">
              <Mail class="w-3 h-3" :stroke-width="1.75" />
              Email destination
            </label>
            <input
              v-model="emailTo"
              type="email"
              placeholder="ops@acme.com"
              class="w-full text-sm bg-transparent outline-none py-1 border-b border-base-300 focus:border-primary transition-colors"
              @blur="saveEmail"
            />
          </div>
        </section>

        <!-- Project Managers -->
        <section class="px-6 py-4 border-t border-base-300/60 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
              <Crown class="w-3 h-3" :stroke-width="1.75" />
              Project Managers
              <span class="text-base-content/40 normal-case">({{ myPmList.length }})</span>
            </div>
            <button
              type="button"
              class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline transition-all flex items-center gap-1"
              @click="showAddPm = !showAddPm"
            >
              <UserPlus class="w-3 h-3" :stroke-width="1.75" />
              {{ showAddPm ? 'Done' : 'Add' }}
            </button>
          </div>

          <ul v-if="myPmList.length" class="space-y-1">
            <li
              v-for="cp in myPmList"
              :key="cp.pm_id"
              class="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-base-200/40 transition-colors"
            >
              <HexAvatar
                :name="cp.profile.full_name"
                :email="cp.profile.email"
                :size="36"
                :tint="cp.is_primary ? 'warning' : 'neutral'"
              />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate flex items-center gap-1.5">
                  {{ cp.profile.full_name || cp.profile.email || '—' }}
                  <span
                    v-if="cp.is_primary"
                    class="inline-flex items-center gap-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-warning bg-warning/10 px-1.5 py-0.5 rounded"
                  >
                    <Crown class="w-2.5 h-2.5" :stroke-width="2" />
                    Primary
                  </span>
                </div>
                <div class="text-[0.7rem] text-base-content/50 truncate">
                  {{ cp.profile.email ?? '' }}
                </div>
              </div>
              <button
                v-if="!cp.is_primary"
                type="button"
                class="opacity-0 group-hover:opacity-100 text-[0.65rem] uppercase tracking-wider text-warning hover:underline transition-opacity"
                @click="makePrimary(cp.pm_id)"
              >
                Make primary
              </button>
              <button
                type="button"
                class="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-base-content/40 hover:text-error hover:bg-error/10 transition-all"
                title="Remove"
                @click="removePm(cp.pm_id)"
              >
                <XIcon class="w-3.5 h-3.5" :stroke-width="1.75" />
              </button>
            </li>
          </ul>

          <p v-else class="text-xs italic text-base-content/40 px-2 py-1">
            No project managers yet — add one to set up the relationship.
          </p>

          <p v-if="pmActionError" class="text-xs text-error px-1">
            {{ pmActionError }}
          </p>

          <!-- Inline picker -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div v-if="showAddPm" class="rounded-lg border border-base-300 bg-base-100/40 p-2 space-y-2">
              <label class="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-base-300 bg-white focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/40">
                <Search class="w-3.5 h-3.5 text-base-content/50" :stroke-width="1.75" />
                <input
                  v-model="pmSearch"
                  type="text"
                  placeholder="Search by name or email…"
                  class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
                />
              </label>

              <ul v-if="pmSearchResults.length" class="space-y-0.5 max-h-48 overflow-y-auto">
                <li v-for="r in pmSearchResults" :key="r.id">
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-base-200/60 group/r">
                    <HexAvatar :name="r.full_name" :email="r.email" :size="28" :font-size="11" />
                    <div class="flex-1 min-w-0 text-xs">
                      <div class="font-medium truncate">{{ r.full_name || r.email }}</div>
                      <div v-if="r.full_name && r.email" class="text-base-content/50 truncate">{{ r.email }}</div>
                    </div>
                    <div class="flex items-center gap-1 opacity-0 group-hover/r:opacity-100 transition-opacity">
                      <button
                        type="button"
                        class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline"
                        @click="addPm(r.id, false)"
                      >
                        Add
                      </button>
                      <button
                        v-if="!myPmList.some((x) => x.is_primary)"
                        type="button"
                        class="text-[0.65rem] uppercase tracking-wider font-semibold text-warning hover:underline"
                        @click="addPm(r.id, true)"
                      >
                        + Primary
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
              <p v-else-if="pmSearchLoading" class="text-xs text-base-content/50 px-2 py-2">Searching…</p>
              <p v-else class="text-xs italic text-base-content/40 px-2 py-2">
                {{ pmSearch ? 'No matching PMs.' : 'Type to search…' }}
              </p>
            </div>
          </Transition>
        </section>

        <!-- Virtual Assistants -->
        <section
          v-if="auth.role === 'pm' || auth.isAdmin"
          class="px-6 py-4 border-t border-base-300/60 space-y-3"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
              <UsersIcon class="w-3 h-3" :stroke-width="1.75" />
              Virtual Assistants
              <span class="text-base-content/40 normal-case">({{ assignedVas.length }})</span>
            </div>
            <button
              v-if="auth.isAdmin"
              type="button"
              class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline transition-all flex items-center gap-1"
              @click="showAddVa = !showAddVa"
            >
              <UserPlus class="w-3 h-3" :stroke-width="1.75" />
              {{ showAddVa ? 'Done' : 'Add' }}
            </button>
          </div>

          <ul v-if="assignedVas.length" class="space-y-1">
            <li
              v-for="v in assignedVas"
              :key="v.va_id"
              class="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-base-200/40 transition-colors cursor-pointer"
              @click="openVaDetail(v.va_id)"
            >
              <HexAvatar
                :avatar-url="v.profile?.avatar_url"
                :name="v.profile?.full_name"
                :email="v.profile?.email"
                :size="36"
                tint="secondary"
                :class="v.status === 'paused' ? 'opacity-60' : ''"
              />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate flex items-center gap-1.5">
                  {{ v.profile?.full_name || v.profile?.email || 'Loading…' }}
                  <span
                    v-if="v.status === 'paused'"
                    class="inline-flex items-center gap-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-warning bg-warning/10 px-1.5 py-0.5 rounded"
                  >
                    Paused
                  </span>
                </div>
                <div class="text-[0.7rem] text-base-content/50 truncate flex items-center gap-2">
                  <span>{{ v.profile?.email ?? '' }}</span>
                  <span v-if="v.pm_id && team.profiles[v.pm_id]" class="text-base-content/30">·</span>
                  <span v-if="v.pm_id && team.profiles[v.pm_id]" class="truncate">
                    PM: {{ team.profiles[v.pm_id]?.full_name || team.profiles[v.pm_id]?.email?.split('@')[0] }}
                  </span>
                </div>
              </div>
              <div
                class="flex items-center gap-1 text-[0.7rem] text-base-content/60 tabular-nums shrink-0"
                :title="`${v.open_tasks} open task${v.open_tasks === 1 ? '' : 's'}`"
              >
                <ListTodo class="w-3 h-3" :stroke-width="1.75" />
                {{ v.open_tasks }}
              </div>
              <button
                v-if="auth.isAdmin"
                type="button"
                class="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-base-content/40 hover:text-error hover:bg-error/10 transition-all"
                title="End assignment"
                @click.stop="removeVa(v.va_id)"
              >
                <XIcon class="w-3.5 h-3.5" :stroke-width="1.75" />
              </button>
            </li>
          </ul>

          <p v-else class="text-xs italic text-base-content/40 px-2 py-1">
            {{
              auth.isAdmin
                ? 'No VAs assigned to this client yet.'
                : 'No VAs assigned to this client yet. Ask an admin to add staff.'
            }}
          </p>

          <p v-if="vaActionError" class="text-xs text-error px-1">
            {{ vaActionError }}
          </p>

          <!-- Inline VA picker -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div v-if="showAddVa" class="rounded-lg border border-base-300 bg-base-100/40 p-2 space-y-2">
              <label class="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-base-300 bg-white focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/40">
                <Search class="w-3.5 h-3.5 text-base-content/50" :stroke-width="1.75" />
                <input
                  v-model="vaSearch"
                  type="text"
                  placeholder="Search VAs by name or email…"
                  class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
                />
              </label>

              <ul v-if="vaSearchResults.length" class="space-y-0.5 max-h-48 overflow-y-auto">
                <li v-for="r in vaSearchResults" :key="r.id">
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-base-200/60 group/r">
                    <HexAvatar :name="r.full_name" :email="r.email" :size="28" :font-size="11" tint="secondary" />
                    <div class="flex-1 min-w-0 text-xs">
                      <div class="font-medium truncate">{{ r.full_name || r.email }}</div>
                      <div v-if="r.full_name && r.email" class="text-base-content/50 truncate">{{ r.email }}</div>
                    </div>
                    <button
                      type="button"
                      class="opacity-0 group-hover/r:opacity-100 transition-opacity text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline"
                      @click="addVa(r.id)"
                    >
                      Assign
                    </button>
                  </div>
                </li>
              </ul>
              <p v-else-if="vaSearchLoading" class="text-xs text-base-content/50 px-2 py-2">Searching…</p>
              <p v-else class="text-xs italic text-base-content/40 px-2 py-2">
                {{ vaSearch ? 'No matching VAs.' : 'No VAs available — type to search.' }}
              </p>
            </div>
          </Transition>
        </section>

        <!-- Notes -->
        <section class="px-6 py-4 border-t border-base-300/60">
          <div class="flex items-center gap-2 text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold mb-2">
            <StickyNote class="w-3 h-3" :stroke-width="1.75" />
            Internal notes
          </div>
          <textarea
            v-model="notes"
            rows="3"
            class="w-full bg-transparent outline-none text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-base-200/60 focus:bg-base-200/80 transition-colors"
            placeholder="Quirks, contacts, account preferences — only the team sees this."
            @blur="saveNotes"
          />
        </section>

        <div class="h-4"></div>
      </div>
    </aside>
  </Teleport>
</template>
