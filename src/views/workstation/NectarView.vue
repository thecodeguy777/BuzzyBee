<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Target, Search, Sparkles, Megaphone, Check } from 'lucide-vue-next'
import PostingCard from '@/components/nectar/PostingCard.vue'
import PostingDetail from '@/components/nectar/PostingDetail.vue'
import PostingComposer from '@/components/nectar/PostingComposer.vue'
import { useAuthStore } from '@/stores/auth'
import { useJobsStore, matchScore, type JobPosting, type PostingType } from '@/stores/jobs'
import { useVaProfileStore } from '@/stores/vaProfile'

const auth = useAuthStore()
const jobs = useJobsStore()
const vaProfiles = useVaProfileStore()

const canPost = computed(() => auth.role === 'pm' || auth.isAdmin)

onMounted(() => {
  void jobs.fetchAll()
  if (auth.user) void vaProfiles.fetchFor(auth.user.id)
})

// My skills + tools (lowercased) — the engine behind match scores.
const mySkills = computed(() => {
  const p = auth.user ? vaProfiles.byUser[auth.user.id] : null
  const names = [
    ...(p?.skills ?? []).map((s) => s.name),
    ...(p?.tools ?? []).map((t) => t.name),
  ]
  return new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))
})
const matchOf = (p: JobPosting) => matchScore(p, mySkills.value)

// ── Tabs / filters / sort ─────────────────────────────────────────────────────
const tab = ref<'all' | 'match' | 'saved' | 'applied'>('all')
const search = ref('')
const typeFilter = ref<'all' | PostingType>('all')
const sort = ref<'match' | 'newest' | 'applicants'>('match')

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'match', label: 'Best match' },
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
] as const
const TYPE_TABS = [
  { value: 'all', label: 'All types' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'project', label: 'Projects' },
  { value: 'task', label: 'Tasks' },
  { value: 'trial', label: 'Trials' },
] as const
const SORTS = { match: 'Best match', newest: 'Newest', applicants: 'Fewest applicants' }

const counts = computed(() => ({
  all: jobs.postings.filter((p) => p.status === 'open').length,
  match: jobs.postings.filter((p) => p.status === 'open' && (matchOf(p) ?? 0) >= 85).length,
  saved: jobs.savedIds.size,
  applied: jobs.appliedIds.size,
}))

const shown = computed(() => {
  let list = jobs.postings.filter((p) => {
    // Closed postings only surface under Applied/Saved (history), or to managers.
    if (p.status === 'closed' && tab.value !== 'applied' && tab.value !== 'saved' && !canPost.value) return false
    if (tab.value === 'saved' && !jobs.savedIds.has(p.id)) return false
    if (tab.value === 'applied' && !jobs.appliedIds.has(p.id)) return false
    if (tab.value === 'match' && (matchOf(p) ?? 0) < 70) return false
    if (typeFilter.value !== 'all' && p.type !== typeFilter.value) return false
    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase()
      const hay = `${p.role_title} ${p.client_name ?? ''} ${p.skills.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const cmp: Record<typeof sort.value, (a: JobPosting, b: JobPosting) => number> = {
    match: (a, b) => (matchOf(b) ?? -1) - (matchOf(a) ?? -1),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    applicants: (a, b) => (jobs.applicantCounts[a.id] ?? 0) - (jobs.applicantCounts[b.id] ?? 0),
  }
  return [...list].sort(tab.value === 'match' ? cmp.match : cmp[sort.value])
})

// ── Detail / apply / composer ─────────────────────────────────────────────────
const activeId = ref<string | null>(null)
const active = computed(() => jobs.postings.find((p) => p.id === activeId.value) ?? null)
const composing = ref(false)

const toast = ref<{ title: string; sub: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
function fireToast(title: string, sub: string) {
  toast.value = { title, sub }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 3800)
}

async function apply(p: JobPosting) {
  if (await jobs.apply(p.id)) {
    const m = matchOf(p)
    fireToast(`Applied to ${p.role_title}`, `Your VA Profile was sent to ${p.client_name ?? 'the team'}${m != null ? ` · ${m}% match` : ''}`)
  } else if (jobs.error) {
    fireToast('Could not apply', jobs.error)
  }
}
async function withdraw(p: JobPosting) {
  if (!window.confirm(`Withdraw your application to “${p.role_title}”?`)) return
  if (await jobs.withdraw(p.id)) fireToast('Application withdrawn', p.role_title)
  else if (jobs.error) fireToast('Could not withdraw', jobs.error)
}
function onCreated(roleTitle: string) {
  composing.value = false
  fireToast('Posted to Nectar', `“${roleTitle}” is now visible to every VA.`)
}
</script>

<template>
  <div class="space-y-4">
    <!-- header -->
    <header class="flex items-center gap-3 flex-wrap">
      <span class="w-10 h-10 rounded-xl grid place-items-center text-primary shrink-0" style="background: var(--accent-soft)">
        <Target class="w-5 h-5" :stroke-width="1.9" />
      </span>
      <div class="flex-1 min-w-0">
        <h1 class="font-display text-xl font-bold leading-tight">Nectar</h1>
        <p class="text-xs text-base-content/60 mt-0.5">Open client work, matched to your skills, tools &amp; availability.</p>
      </div>
      <span
        v-if="counts.match > 0"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.82rem] font-semibold whitespace-nowrap"
        style="background: var(--st-done-bg); color: var(--st-done-fg)"
      >
        <Sparkles class="w-4 h-4" :stroke-width="2" /> {{ counts.match }} great match{{ counts.match === 1 ? '' : 'es' }} for you
      </span>
      <button v-if="canPost" type="button" class="btn btn-primary btn-sm gap-1.5" @click="composing = true">
        <Megaphone class="w-4 h-4" :stroke-width="2" /> New posting
      </button>
    </header>

    <!-- tabs -->
    <div class="flex items-center gap-1 border-b border-base-300">
      <button
        v-for="t in TABS"
        :key="t.value"
        type="button"
        class="relative flex items-center gap-1.5 px-3.5 py-2.5 text-[0.84rem] font-semibold transition-colors"
        :class="tab === t.value ? 'text-primary' : 'text-base-content/60 hover:text-base-content'"
        @click="tab = t.value"
      >
        {{ t.label }}
        <span
          class="text-[0.7rem] font-bold px-1.5 py-px rounded-full"
          :class="tab === t.value ? 'text-primary' : 'bg-base-200 text-base-content/50'"
          :style="tab === t.value ? 'background: var(--accent-soft)' : ''"
        >{{ counts[t.value] }}</span>
        <span v-if="tab === t.value" class="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-t" />
      </button>
    </div>

    <!-- toolbar -->
    <div class="flex items-center gap-2.5 flex-wrap">
      <label class="flex items-center gap-2 w-60 px-3 h-9 rounded-lg border border-base-300 bg-base-100 focus-within:border-primary">
        <Search class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
        <input v-model="search" type="text" placeholder="Search role, client, skill" class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40 min-w-0" />
      </label>
      <div class="flex gap-0.5 bg-base-200 p-[3px] rounded-lg">
        <button
          v-for="t in TYPE_TABS"
          :key="t.value"
          type="button"
          class="px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all"
          :class="typeFilter === t.value ? 'bg-base-100 shadow-sm text-base-content' : 'text-base-content/60'"
          @click="typeFilter = t.value"
        >{{ t.label }}</button>
      </div>
      <div class="flex-1" />
      <select v-model="sort" class="select select-bordered select-sm w-44" :disabled="tab === 'match'">
        <option v-for="(label, k) in SORTS" :key="k" :value="k">{{ label }}</option>
      </select>
    </div>

    <!-- grid -->
    <div v-if="jobs.loading && !jobs.loaded" class="py-16 text-center text-sm text-base-content/50">Loading postings…</div>
    <div v-else-if="shown.length === 0" class="py-14 text-center text-base-content/50">
      <Target class="w-8 h-8 mx-auto text-base-content/30" :stroke-width="1.5" />
      <p class="mt-3 text-sm font-medium">
        {{ tab === 'saved' ? 'No saved postings yet — tap the bookmark on any card.'
          : tab === 'applied' ? "You haven't applied to anything yet."
          : jobs.postings.length === 0 ? (canPost ? 'The pool is empty — create the first posting.' : 'No open postings right now — check back soon.')
          : 'No postings match your filters.' }}
      </p>
    </div>
    <div v-else class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))">
      <PostingCard
        v-for="p in shown"
        :key="p.id"
        :posting="p"
        :match="matchOf(p)"
        :applied="jobs.appliedIds.has(p.id)"
        :saved="jobs.savedIds.has(p.id)"
        :applicants="jobs.applicantCounts[p.id] ?? 0"
        :my-skills="mySkills"
        @open="activeId = p.id"
        @apply="apply(p)"
        @save="jobs.toggleSave(p.id)"
      />
    </div>

    <PostingDetail
      v-if="active"
      :posting="active"
      :match="matchOf(active)"
      :applied="jobs.appliedIds.has(active.id)"
      :saved="jobs.savedIds.has(active.id)"
      :applicants="jobs.applicantCounts[active.id] ?? 0"
      :my-skills="mySkills"
      @close="activeId = null"
      @apply="apply(active)"
      @save="jobs.toggleSave(active.id)"
      @withdraw="withdraw(active)"
    />

    <PostingComposer v-if="composing" @close="composing = false" @created="onCreated" />

    <!-- toast -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0 translate-y-2"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <div
          v-if="toast"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-xl text-white shadow-2xl"
          style="background: #211c24"
        >
          <span class="w-6 h-6 rounded-lg grid place-items-center" style="background: rgba(255,255,255,.14)">
            <Check class="w-4 h-4" :stroke-width="2.4" />
          </span>
          <div>
            <div class="text-[0.8rem] font-bold leading-tight">{{ toast.title }}</div>
            <div class="text-[0.7rem] text-white/60">{{ toast.sub }}</div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
