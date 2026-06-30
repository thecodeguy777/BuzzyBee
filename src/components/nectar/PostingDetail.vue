<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  X,
  Bookmark,
  Clock,
  Banknote,
  Flag,
  Users,
  Check,
  Sparkles,
  Target,
  Archive,
  IdCard
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { useAuthStore } from '@/stores/auth'
import { useTeamStore } from '@/stores/team'
import { useJobsStore, matchTone, POSTING_TYPES, type JobPosting, type JobApplication } from '@/stores/jobs'

const props = defineProps<{
  posting: JobPosting
  match: number | null
  applied: boolean
  saved: boolean
  applicants: number
  mySkills: Set<string>
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply'): void
  (e: 'save'): void
  (e: 'withdraw'): void
}>()

const auth = useAuthStore()
const team = useTeamStore()
const jobs = useJobsStore()
const router = useRouter()

const type = computed(() => POSTING_TYPES[props.posting.type])
const tone = computed(() => (props.match != null ? matchTone(props.match) : null))
const hasSkill = (s: string) => props.mySkills.has(s.trim().toLowerCase())

const poster = computed(() => (props.posting.posted_by ? team.profiles[props.posting.posted_by] : null))
watch(
  () => props.posting.posted_by,
  (id) => { if (id && !team.profiles[id]) void team.fetchProfiles([id]) },
  { immediate: true },
)

// Review side — RLS only returns rows to the poster/admins, so an empty
// result for a VA is expected, not an error.
const canReview = computed(() => auth.isAdmin || props.posting.posted_by === auth.user?.id)
const applications = ref<JobApplication[]>([])
watch(
  () => props.posting.id,
  async () => {
    applications.value = []
    if (!canReview.value) return
    applications.value = await jobs.fetchApplicants(props.posting.id)
    const missing = applications.value.map((a) => a.va_id).filter((id) => !team.profiles[id])
    if (missing.length) void team.fetchProfiles(missing)
  },
  { immediate: true },
)

function openApplicantProfile(vaId: string) {
  emit('close')
  void router.push({ name: 'workstation-va-profile', params: { userId: vaId } })
}

// ring geometry
const RING = 72
const r = (RING - 10) / 2
const circ = 2 * Math.PI * r

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onEsc))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] bg-black/30" @click="emit('close')" />
    <div class="fixed top-0 right-0 bottom-0 z-[71] w-[520px] max-w-[95vw] bg-base-100 border-l border-base-300 shadow-2xl flex flex-col nectar-slide">
      <!-- header -->
      <div class="flex items-center gap-2.5 px-4 py-3 border-b border-base-300">
        <span
          class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[7px] text-[0.72rem] font-bold"
          :style="{ background: `color-mix(in oklab, ${type.color} 12%, var(--color-base-100))`, color: type.color }"
        >{{ type.label }}</span>
        <span v-if="posting.status === 'closed'" class="inline-flex items-center px-2 py-0.5 rounded-[7px] text-[0.72rem] font-bold bg-base-200 text-base-content/50">Closed</span>
        <div class="flex-1" />
        <button
          v-if="canReview && posting.status === 'open'"
          type="button"
          class="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold text-base-content/60 hover:bg-base-200 hover:text-base-content"
          title="Close this posting"
          @click="jobs.setStatus(posting.id, 'closed')"
        >
          <Archive class="w-3.5 h-3.5" :stroke-width="1.75" /> Close posting
        </button>
        <button
          type="button"
          class="w-8 h-8 rounded-lg grid place-items-center"
          :class="saved ? 'text-primary' : 'text-base-content/50 hover:bg-base-200'"
          :title="saved ? 'Saved' : 'Save'"
          @click="emit('save')"
        >
          <Bookmark class="w-4 h-4" :stroke-width="2" :fill="saved ? 'currentColor' : 'none'" />
        </button>
        <button type="button" class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="Close" @click="emit('close')">
          <X class="w-[18px] h-[18px]" :stroke-width="2" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <!-- title -->
        <div class="flex items-start gap-3.5">
          <HexAvatar :name="posting.client_name || 'BuzzyHive'" :size="48" tint="primary" />
          <div class="flex-1 min-w-0">
            <h2 class="text-lg font-bold leading-snug">{{ posting.role_title }}</h2>
            <div class="text-[0.84rem] font-semibold text-base-content/60 mt-0.5">{{ posting.client_name || 'BuzzyHive' }}</div>
          </div>
          <div v-if="match != null && tone" class="relative shrink-0" :style="{ width: RING + 'px', height: RING + 'px' }">
            <svg :width="RING" :height="RING" class="-rotate-90">
              <circle :cx="RING / 2" :cy="RING / 2" :r="r" fill="none" class="stroke-base-200" stroke-width="7" />
              <circle
                :cx="RING / 2" :cy="RING / 2" :r="r" fill="none"
                :stroke="tone.fg" stroke-width="7" stroke-linecap="round"
                :stroke-dasharray="circ" :stroke-dashoffset="circ * (1 - match / 100)"
              />
            </svg>
            <div class="absolute inset-0 grid place-items-center text-base font-extrabold" :style="{ color: tone.fg }">{{ match }}<span class="text-[0.6rem]">%</span></div>
          </div>
        </div>

        <!-- meta grid -->
        <div class="grid grid-cols-2 gap-2.5 my-4">
          <div v-for="[icon, a, b] in ([[Clock, 'Commitment', posting.hours || '—'], [Banknote, 'Rate', posting.rate || '—'], [Flag, 'Start', posting.urgency || 'Flexible'], [Users, applicants + ' applicant' + (applicants === 1 ? '' : 's'), 'so far']] as const)" :key="a" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-base-300 bg-base-200/40">
            <component :is="icon" class="w-4 h-4 text-base-content/40 shrink-0" :stroke-width="1.75" />
            <div class="min-w-0">
              <div class="text-[0.8rem] font-bold truncate">{{ a }}</div>
              <div class="text-[0.68rem] text-base-content/45">{{ b }}</div>
            </div>
          </div>
        </div>

        <!-- match note -->
        <div v-if="match != null && tone" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-4" :style="{ background: tone.bg }">
          <Target class="w-4 h-4 shrink-0" :style="{ color: tone.fg }" :stroke-width="2" />
          <div class="text-[0.78rem] leading-snug">
            <strong :style="{ color: tone.fg }">{{ tone.label }} ({{ match }}%)</strong> — based on the skills &amp; tools in your VA Profile.
          </div>
        </div>
        <RouterLink
          v-else
          :to="{ name: 'workstation-va-profile' }"
          class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-4 bg-base-200/60 text-[0.78rem] hover:bg-base-200"
        >
          <IdCard class="w-4 h-4 shrink-0 text-primary" :stroke-width="1.75" />
          <span><strong class="text-primary">Set up your VA Profile</strong> to see match scores and unlock one-click apply.</span>
        </RouterLink>

        <!-- description -->
        <template v-if="posting.description">
          <div class="nectar-label">About this role</div>
          <p class="text-sm leading-relaxed text-base-content/70 mb-4 whitespace-pre-line">{{ posting.description }}</p>
        </template>

        <!-- responsibilities -->
        <template v-if="posting.responsibilities.length">
          <div class="nectar-label">What you'll do</div>
          <div class="space-y-2 mb-4">
            <div v-for="(rsp, i) in posting.responsibilities" :key="i" class="flex items-center gap-2.5 text-[0.84rem]">
              <span class="w-5 h-5 rounded-md shrink-0 grid place-items-center text-primary" style="background: var(--accent-soft)">
                <Check class="w-3 h-3" :stroke-width="2.5" />
              </span>
              {{ rsp }}
            </div>
          </div>
        </template>

        <!-- skills -->
        <template v-if="posting.skills.length">
          <div class="nectar-label">Skills required</div>
          <div class="flex flex-wrap gap-1.5 mb-4">
            <span
              v-for="s in posting.skills"
              :key="s"
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[0.78rem] font-semibold"
              :style="hasSkill(s)
                ? 'background: var(--st-done-bg); color: var(--st-done-fg)'
                : 'background: var(--color-base-200); color: var(--color-base-content); opacity: .7'"
            >
              <Check v-if="hasSkill(s)" class="w-3 h-3" :stroke-width="2.5" />{{ s }}
            </span>
          </div>
        </template>

        <!-- posted by -->
        <div v-if="poster" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-base-300">
          <HexAvatar :avatar-url="poster.avatar_url" :name="poster.full_name" :email="poster.email" :size="32" />
          <div class="min-w-0">
            <div class="text-[0.8rem] font-semibold truncate">Posted by {{ poster.full_name || poster.email }}</div>
            <div class="text-[0.7rem] text-base-content/45">{{ posting.client_name || 'BuzzyHive' }}</div>
          </div>
        </div>

        <!-- applicants (poster/admins only — RLS enforces this server-side) -->
        <template v-if="canReview && applications.length">
          <div class="nectar-label mt-5">Applicants</div>
          <div class="space-y-1.5">
            <button
              v-for="a in applications"
              :key="a.id"
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-base-300 hover:border-primary/40 text-left transition-colors"
              @click="openApplicantProfile(a.va_id)"
            >
              <HexAvatar
                :avatar-url="team.profiles[a.va_id]?.avatar_url"
                :name="team.profiles[a.va_id]?.full_name"
                :email="team.profiles[a.va_id]?.email"
                :size="30"
              />
              <div class="flex-1 min-w-0">
                <div class="text-[0.8rem] font-semibold truncate">{{ team.profiles[a.va_id]?.full_name || team.profiles[a.va_id]?.email || '…' }}</div>
                <div class="text-[0.68rem] text-base-content/45">applied {{ new Date(a.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }} · {{ a.status }}</div>
              </div>
              <IdCard class="w-4 h-4 text-base-content/35 shrink-0" :stroke-width="1.75" />
            </button>
          </div>
        </template>
      </div>

      <!-- footer -->
      <div class="px-4 py-3 border-t border-base-300 flex items-center gap-2.5">
        <button
          type="button"
          class="w-11 h-11 rounded-xl shrink-0 grid place-items-center border border-base-300"
          :class="saved ? 'text-primary' : 'text-base-content/50'"
          :style="saved ? 'background: var(--accent-soft)' : ''"
          @click="emit('save')"
        >
          <Bookmark class="w-[18px] h-[18px]" :stroke-width="2" :fill="saved ? 'currentColor' : 'none'" />
        </button>
        <div
          v-if="applied"
          class="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-bold"
          style="background: var(--st-done-bg); color: var(--st-done-fg)"
        >
          <Check class="w-4 h-4" :stroke-width="2.5" /> Applied — profile sent
        </div>
        <button
          v-else-if="posting.status === 'open' && !canReview"
          type="button"
          class="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-primary-content bg-primary hover:opacity-90"
          @click="emit('apply')"
        >
          <Sparkles class="w-4 h-4" :stroke-width="2" /> One-click apply with your profile
        </button>
        <div v-else class="flex-1 h-11 rounded-xl flex items-center justify-center text-sm font-semibold text-base-content/40 bg-base-200">
          {{ posting.status === 'closed' ? 'This posting is closed' : 'Your posting' }}
        </div>
        <button
          v-if="applied"
          type="button"
          class="h-11 px-3.5 rounded-xl text-xs font-semibold text-base-content/50 border border-base-300 hover:text-error hover:border-error/40"
          @click="emit('withdraw')"
        >
          Withdraw
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nectar-label {
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-base-content);
  opacity: 0.45;
  margin-bottom: 8px;
}
@keyframes nectar-in {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.nectar-slide { animation: nectar-in 0.22s cubic-bezier(0.2, 0.8, 0.3, 1) both; }
</style>
