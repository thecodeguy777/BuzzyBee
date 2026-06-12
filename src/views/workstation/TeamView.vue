<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  UsersRound,
  Search,
  Clock,
  ListTodo,
  Mail,
  Filter,
  UserPlus,
  Send,
  RotateCw,
  X,
  UserX,
  UserCheck,
  AlertTriangle
} from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import { useTasksStore } from '@/stores/tasks'
import { useStatusesStore } from '@/stores/statuses'
import { useTeamStore, type MemberProfile } from '@/stores/team'
import { useInvitesStore, type InviteRole } from '@/stores/invites'
import VADetail from '@/components/workstation/VADetail.vue'
import HexAvatar from '@/components/shared/HexAvatar.vue'

const props = defineProps<{ vaId?: string }>()

const auth = useAuthStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const statusesStore = useStatusesStore()
const team = useTeamStore()
const invites = useInvitesStore()
const router = useRouter()

// ── Invitations + deactivation (admin only) ──────────────────────────────────
const toast = ref<{ msg: string; error?: boolean } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
function fireToast(msg: string, error = false) {
  toast.value = { msg, error }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 4200)
}
watch(() => invites.error, (msg) => {
  if (!msg) return
  fireToast(msg, true)
  invites.error = null
})

const inviteOpen = ref(false)
const inviteSending = ref(false)
const inviteForm = ref({ email: '', fullName: '', role: 'va' as InviteRole, clientId: '' })
const inviteEmailEl = ref<HTMLInputElement | null>(null)

function openInvite() {
  inviteOpen.value = true
  void nextTick(() => inviteEmailEl.value?.focus())
}
function onInviteKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && inviteOpen.value) inviteOpen.value = false
}
watch(inviteOpen, (open) => {
  if (typeof document === 'undefined') return
  if (open) document.addEventListener('keydown', onInviteKey)
  else document.removeEventListener('keydown', onInviteKey)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onInviteKey))

const roleOptions = computed<{ value: InviteRole; label: string }[]>(() => {
  const base: { value: InviteRole; label: string }[] = [
    { value: 'va', label: 'VA' },
    { value: 'pm', label: 'Project manager' },
    { value: 'sales', label: 'Sales' },
    { value: 'client', label: 'Client user' },
  ]
  if (auth.isSuperadmin) base.push({ value: 'admin', label: 'Admin' })
  return base
})

const pendingInvites = computed(() => invites.invites.filter((i) => i.status === 'sent'))

async function submitInvite() {
  const f = inviteForm.value
  if (!f.email.trim() || inviteSending.value) return
  if (f.role === 'client' && !f.clientId) return
  inviteSending.value = true
  try {
    const ok = await invites.invite({
      email: f.email,
      role: f.role,
      clientId: f.role === 'client' ? f.clientId : null,
      fullName: f.fullName,
    })
    if (ok) {
      fireToast('Invitation sent to ' + f.email.trim())
      inviteOpen.value = false
      inviteForm.value = { email: '', fullName: '', role: 'va', clientId: '' }
    }
  } finally {
    inviteSending.value = false
  }
}
async function revokeInvite(id: string, email: string) {
  if (!window.confirm('Revoke the invitation to ' + email + '?')) return
  if (await invites.revoke(id)) fireToast('Invitation revoked')
}
async function resendInvite(id: string, email: string) {
  if (await invites.resend(id)) fireToast('Invitation re-sent to ' + email)
}

async function toggleActive(m: MemberProfile) {
  const next = m.is_active === false
  const verb = next ? 'Reactivate' : 'Deactivate'
  if (!window.confirm(verb + ' ' + (m.full_name || m.email || 'this person') + '?'
      + (next ? '' : ' They lose all access immediately; history is kept.'))) return
  if (await invites.setActive(m.id, next)) {
    // fetchProfiles caches by id — patch the roster entry directly.
    team.profiles[m.id] = { ...m, is_active: next }
    fireToast((m.full_name || m.email || 'Account') + (next ? ' reactivated' : ' deactivated'))
  }
}

watch(
  () => auth.isAdmin,
  (is) => { if (is) void invites.load() },
  { immediate: true }
)

// Hours-this-week per VA (for the master list).
const hoursByVa = ref<Record<string, number>>({})
const hoursLoading = ref(false)

async function loadHoursThisWeek() {
  hoursLoading.value = true
  try {
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - monday.getDay())
    const { data, error } = await supabase
      .from('time_entries')
      .select('va_id, started_at, ended_at')
      .gte('started_at', monday.toISOString())
    if (error) throw error
    const map: Record<string, number> = {}
    for (const e of (data ?? []) as any[]) {
      if (!e.va_id) continue
      const start = new Date(e.started_at).getTime()
      const end = e.ended_at ? new Date(e.ended_at).getTime() : Date.now()
      const seconds = Math.max(0, Math.floor((end - start) / 1000))
      map[e.va_id] = (map[e.va_id] ?? 0) + seconds
    }
    hoursByVa.value = map
  } catch (e) {
    console.warn('[team] hours:', (e as Error).message)
  } finally {
    hoursLoading.value = false
  }
}

watch(
  () => auth.isAuthenticated,
  (is) => {
    if (is) void loadHoursThisWeek()
  },
  { immediate: true }
)

const openTasksByVa = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const t of tasks.tasks) {
    if (!t.assignee_id) continue
    if (!statusesStore.isOpen(t.project_id, t.status)) continue
    m[t.assignee_id] = (m[t.assignee_id] ?? 0) + 1
  }
  return m
})

// Filtering
const search = ref('')
const clientFilter = ref<'all' | string>('all')

const filtered = computed(() => {
  return team.myTeam.filter((m) => {
    if (clientFilter.value !== 'all') {
      const list = team.assignmentsByVa[m.id] ?? []
      if (!list.some((a) => a.client_id === clientFilter.value)) return false
    }
    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase()
      const hay = `${m.full_name ?? ''} ${m.email ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

const totalVAs = computed(() => team.myTeam.length)
const totalHours = computed(() =>
  Object.values(hoursByVa.value).reduce((a, b) => a + b, 0)
)

// -----------------------------------------------------------------------------
// Selection — synced to /app/team/:vaId
// -----------------------------------------------------------------------------
const selectedId = computed(() => props.vaId ?? null)
const selectedVa = computed(() =>
  selectedId.value ? team.profiles[selectedId.value] ?? team.myTeam.find((x) => x.id === selectedId.value) ?? null : null
)

function selectVa(id: string) {
  router.push({ name: 'workstation-team', params: { vaId: id } })
}
function clearSelection() {
  router.push({ name: 'workstation-team', params: {} })
}

// Auto-select the first filtered VA on wide screens for a populated initial state.
watch(
  [filtered, selectedId],
  ([list, sel]) => {
    if (sel) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(min-width: 1024px)').matches && list.length > 0) {
      router.replace({ name: 'workstation-team', params: { vaId: list[0].id } })
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full -mx-6 -my-6 flex flex-col">
    <!-- Page header -->
    <header
      class="px-6 py-4 border-b border-base-300 flex items-end justify-between gap-4 flex-wrap shrink-0"
    >
      <div>
        <h1 class="font-display text-xl font-semibold flex items-center gap-2">
          <UsersRound class="w-5 h-5 text-base-content/70" :stroke-width="1.75" />
          Team
        </h1>
        <p class="text-xs text-base-content/60 mt-0.5">
          {{ auth.isAdmin ? 'All VAs across the agency.' : 'VAs you manage.' }}
        </p>
      </div>
      <div class="flex items-center gap-3 text-xs text-base-content/60">
        <span class="flex items-center gap-1.5">
          <UsersRound class="w-3.5 h-3.5" :stroke-width="1.75" />
          {{ totalVAs }} VA{{ totalVAs === 1 ? '' : 's' }}
        </span>
        <span class="flex items-center gap-1.5">
          <Clock class="w-3.5 h-3.5" :stroke-width="1.75" />
          {{ formatHours(totalHours) }} this week
        </span>
        <button
          v-if="auth.isAdmin"
          type="button"
          class="btn btn-primary btn-sm gap-1.5"
          @click="openInvite"
        >
          <UserPlus class="w-3.5 h-3.5" :stroke-width="2" />
          Invite
        </button>
      </div>
    </header>

    <!-- Pending invitations (admin) -->
    <div
      v-if="auth.isAdmin && pendingInvites.length"
      class="px-6 py-2 border-b border-base-300 bg-base-200/40 flex items-center gap-2 flex-wrap shrink-0"
    >
      <span class="text-[0.65rem] uppercase tracking-wider font-semibold text-base-content/50">
        Pending invites
      </span>
      <span
        v-for="i in pendingInvites"
        :key="i.id"
        class="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full border border-base-300 bg-base-100 text-xs"
      >
        <Send class="w-3 h-3 text-base-content/40" :stroke-width="1.75" />
        <span class="font-medium">{{ i.email }}</span>
        <span class="text-base-content/40 uppercase text-[0.6rem] font-semibold">{{ i.role }}</span>
        <button
          type="button"
          class="w-5 h-5 rounded-full grid place-items-center text-base-content/40 hover:text-base-content hover:bg-base-200"
          title="Resend invitation"
          @click="resendInvite(i.id, i.email)"
        >
          <RotateCw class="w-3 h-3" :stroke-width="2" />
        </button>
        <button
          type="button"
          class="w-5 h-5 rounded-full grid place-items-center text-base-content/40 hover:text-error hover:bg-base-200"
          title="Revoke invitation"
          @click="revokeInvite(i.id, i.email)"
        >
          <X class="w-3 h-3" :stroke-width="2" />
        </button>
      </span>
    </div>

    <!-- Master + detail -->
    <div class="flex-1 min-h-0 flex">
      <!-- Master (roster) -->
      <aside
        :class="[
          'w-full lg:w-80 lg:shrink-0 lg:border-r border-base-300 bg-base-100 flex flex-col min-h-0',
          selectedId ? 'hidden lg:flex' : 'flex'
        ]"
      >
        <!-- Filters -->
        <div class="px-3 py-2.5 border-b border-base-300 space-y-2 shrink-0">
          <label
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-base-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/40"
          >
            <Search class="w-4 h-4 text-base-content/50" :stroke-width="1.75" />
            <input
              v-model="search"
              type="text"
              placeholder="Search name or email"
              class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40 min-w-0"
            />
          </label>
          <div class="flex items-center gap-1.5">
            <Filter class="w-3.5 h-3.5 text-base-content/50" :stroke-width="1.75" />
            <select v-model="clientFilter" class="select select-bordered select-xs flex-1">
              <option value="all">All clients</option>
              <option v-for="c in clients.clients" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Roster list -->
        <ul class="flex-1 overflow-y-auto py-1">
          <li v-if="!filtered.length" class="px-4 py-8 text-center text-xs text-base-content/50">
            <UsersRound class="w-6 h-6 mx-auto text-base-content/30" :stroke-width="1.5" />
            <p class="mt-2" v-if="team.myTeam.length === 0">
              {{ auth.isAdmin ? 'No VAs in the system yet.' : 'No VAs assigned to you yet.' }}
            </p>
            <p class="mt-2" v-else>No matches.</p>
          </li>
          <li
            v-for="m in filtered"
            :key="m.id"
            class="px-2"
          >
            <button
              type="button"
              class="group/row w-full text-left px-2.5 py-2 rounded-lg flex items-start gap-2.5 transition-colors"
              :class="[
                selectedId === m.id
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-base-200',
                m.is_active === false && 'opacity-50'
              ]"
              @click="selectVa(m.id)"
            >
              <HexAvatar
                :avatar-url="m.avatar_url"
                :name="m.full_name"
                :email="m.email"
                :size="36"
                tint="primary"
              />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate flex items-center gap-1.5">
                  <span class="truncate">{{ m.full_name || m.email || 'Unknown' }}</span>
                  <span
                    v-if="m.is_active === false"
                    class="text-[0.6rem] font-bold uppercase px-1.5 py-px rounded bg-base-200 text-base-content/50 shrink-0"
                  >Inactive</span>
                </div>
                <div class="text-[0.65rem] text-base-content/50 truncate flex items-center gap-1">
                  <Mail class="w-2.5 h-2.5" :stroke-width="1.75" />
                  {{ m.email ?? '—' }}
                </div>
                <div class="flex items-center gap-2 mt-1 text-[0.65rem] text-base-content/60">
                  <span class="inline-flex items-center gap-0.5 tabular-nums">
                    <Clock class="w-2.5 h-2.5" :stroke-width="1.75" />
                    {{ formatHours(hoursByVa[m.id] ?? 0) }}
                  </span>
                  <span class="text-base-content/30">·</span>
                  <span class="inline-flex items-center gap-0.5 tabular-nums">
                    <ListTodo class="w-2.5 h-2.5" :stroke-width="1.75" />
                    {{ openTasksByVa[m.id] ?? 0 }} open
                  </span>
                </div>
              </div>
              <span
                v-if="auth.isAdmin"
                role="button"
                class="opacity-0 group-hover/row:opacity-100 w-6 h-6 rounded-md grid place-items-center shrink-0 transition-opacity"
                :class="m.is_active === false
                  ? 'text-success hover:bg-base-300/60'
                  : 'text-base-content/30 hover:text-error hover:bg-base-300/60'"
                :title="m.is_active === false ? 'Reactivate account' : 'Deactivate account'"
                @click.stop="toggleActive(m)"
              >
                <component :is="m.is_active === false ? UserCheck : UserX" class="w-3.5 h-3.5" :stroke-width="1.75" />
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Detail -->
      <section
        :class="[
          'flex-1 min-w-0',
          selectedId ? 'flex' : 'hidden lg:flex'
        ]"
      >
        <VADetail
          v-if="selectedVa"
          :key="selectedId ?? 'none'"
          :va-id="selectedId!"
          @back="clearSelection"
        />
        <div
          v-else
          class="flex-1 flex items-center justify-center text-center text-sm text-base-content/50 px-6"
        >
          <div>
            <UsersRound class="w-10 h-10 mx-auto text-base-content/20" :stroke-width="1.5" />
            <p class="mt-3">Pick a VA from the list to see assignments, hours, and recent activity.</p>
          </div>
        </div>
      </section>
    </div>

    <!-- Invite modal -->
    <Teleport to="body">
      <Transition name="tv-fade">
        <div v-if="inviteOpen" class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" @click="inviteOpen = false" />
      </Transition>
      <Transition name="tv-pop">
        <div v-if="inviteOpen" class="fixed inset-0 z-[51] grid place-items-center p-4 pointer-events-none">
          <div
            class="pointer-events-auto w-[26rem] max-w-full max-h-[90vh] overflow-y-auto bg-base-100 rounded-2xl border border-base-300 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Invite someone"
          >
            <form class="p-5" @submit.prevent="submitInvite">
              <div class="flex items-center gap-3 mb-5">
                <span class="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <UserPlus class="w-5 h-5" :stroke-width="2" />
                </span>
                <div class="flex-1 min-w-0">
                  <h2 class="font-display text-base font-semibold leading-tight">Invite someone</h2>
                  <p class="text-xs text-base-content/60 mt-0.5">They get an email link to set up their account.</p>
                </div>
                <button type="button" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label="Close" @click="inviteOpen = false">
                  <X class="w-4 h-4" :stroke-width="2" />
                </button>
              </div>

              <div class="space-y-4">
                <div>
                  <label for="tv-inv-email" class="block text-xs font-medium text-base-content/70 mb-1.5">
                    Email <span class="text-error">*</span>
                  </label>
                  <input
                    id="tv-inv-email"
                    ref="inviteEmailEl"
                    v-model="inviteForm.email"
                    type="email"
                    required
                    class="input input-bordered input-sm w-full"
                    placeholder="person@example.com"
                  />
                </div>

                <div>
                  <label for="tv-inv-name" class="block text-xs font-medium text-base-content/70 mb-1.5">
                    Full name
                  </label>
                  <input
                    id="tv-inv-name"
                    v-model="inviteForm.fullName"
                    type="text"
                    class="input input-bordered input-sm w-full"
                    placeholder="Optional — they can set it later"
                  />
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div :class="inviteForm.role !== 'client' && 'col-span-2'">
                    <label for="tv-inv-role" class="block text-xs font-medium text-base-content/70 mb-1.5">
                      Role <span class="text-error">*</span>
                    </label>
                    <select id="tv-inv-role" v-model="inviteForm.role" class="select select-bordered select-sm w-full">
                      <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                    </select>
                  </div>
                  <div v-if="inviteForm.role === 'client'">
                    <label for="tv-inv-client" class="block text-xs font-medium text-base-content/70 mb-1.5">
                      Workspace <span class="text-error">*</span>
                    </label>
                    <select id="tv-inv-client" v-model="inviteForm.clientId" class="select select-bordered select-sm w-full">
                      <option value="" disabled>Pick a client</option>
                      <option v-for="c in clients.clients" :key="c.id" :value="c.id">{{ c.name }}</option>
                    </select>
                  </div>
                </div>

                <p v-if="inviteForm.role === 'client'" class="text-[0.7rem] text-base-content/50 leading-relaxed rounded-lg bg-base-200/60 px-3 py-2">
                  Heads up: the client portal is still in progress — client users will have very limited access until it ships.
                </p>
              </div>

              <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-base-300/60">
                <button type="button" class="btn btn-ghost btn-sm" @click="inviteOpen = false">Cancel</button>
                <button
                  type="submit"
                  class="btn btn-primary btn-sm gap-1.5"
                  :disabled="!inviteForm.email.trim() || (inviteForm.role === 'client' && !inviteForm.clientId) || inviteSending"
                >
                  <Send class="w-3.5 h-3.5" :stroke-width="2" />
                  {{ inviteSending ? 'Sending…' : 'Send invite' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>

      <!-- toast -->
      <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <div
          v-if="toast"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl border border-base-300 bg-base-100 shadow-2xl"
        >
          <AlertTriangle v-if="toast.error" class="w-4 h-4 text-error shrink-0" :stroke-width="2" />
          <Send v-else class="w-4 h-4 text-success shrink-0" :stroke-width="2" />
          <span class="text-sm">{{ toast.msg }}</span>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tv-fade-enter-active,
.tv-fade-leave-active { transition: opacity 0.18s ease; }
.tv-fade-enter-from,
.tv-fade-leave-to { opacity: 0; }

.tv-pop-enter-active { transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.15); }
.tv-pop-leave-active { transition: opacity 0.14s ease-in, transform 0.14s ease-in; }
.tv-pop-enter-from,
.tv-pop-leave-to { opacity: 0; transform: scale(0.96) translateY(8px); }
</style>
