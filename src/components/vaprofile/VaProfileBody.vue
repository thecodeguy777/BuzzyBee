<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  BadgeCheck,
  MapPin,
  Clock,
  Calendar,
  MessageSquare,
  User as UserIcon,
  Sparkles,
  Briefcase,
  Image as ImageIcon,
  Trophy,
  Gauge,
  CheckCircle2,
  Globe2,
  Plus,
  X,
  Camera,
  Star
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { uploadPortfolioImage } from '@/lib/avatarUpload'
import type { VaProfile, VaStats, VaPortfolioItem } from '@/stores/vaProfile'

const props = defineProps<{
  profile: VaProfile
  identity: { name: string; avatarUrl: string | null; timezone: string | null }
  stats: VaStats | null
  /** Edit mode (only ever true on the owner's workstation view). */
  editing?: boolean
}>()
const emit = defineEmits<{
  (e: 'patch', patch: Partial<VaProfile>): void
  (e: 'message'): void
  (e: 'change-photo'): void
}>()

// Local working copies for array sections — committed wholesale on change.
// JSON round-trip, not structuredClone: these come in as Vue reactive proxies,
// which structuredClone refuses to clone (DataCloneError).
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const skills = ref(clone(props.profile.skills ?? []))
const tools = ref(clone(props.profile.tools ?? []))
const experience = ref(clone(props.profile.experience ?? []))
const portfolio = ref(clone(props.profile.portfolio ?? []))
watch(() => props.profile, (p) => {
  skills.value = clone(p.skills ?? [])
  tools.value = clone(p.tools ?? [])
  experience.value = clone(p.experience ?? [])
  portfolio.value = clone(p.portfolio ?? [])
})

const commit = {
  skills: () => emit('patch', { skills: skills.value }),
  tools: () => emit('patch', { tools: tools.value }),
  experience: () => emit('patch', { experience: experience.value }),
  portfolio: () => emit('patch', { portfolio: portfolio.value }),
}

function text(e: Event) {
  return (e.target as HTMLInputElement | HTMLTextAreaElement).value
}

const AVAIL = {
  open: { label: 'Open', fg: 'var(--st-done-fg)', bg: 'var(--st-done-bg)', dot: '#2bb673' },
  limited: { label: 'Limited', fg: 'var(--st-prog-fg)', bg: 'var(--st-prog-bg)', dot: '#d9a531' },
  closed: { label: 'Fully booked', fg: 'var(--st-todo-fg)', bg: 'var(--st-todo-bg)', dot: '#9a98a3' },
} as const
const avail = computed(() => AVAIL[props.profile.availability_status] ?? AVAIL.open)

const TOOL_TONE: Record<string, string> = {
  Expert: '#15803d', Advanced: '#2f6fed', Proficient: '#c2700c', Daily: '#7b2d86', Familiar: '#6b7280',
}
const SKILL_TAGS = ['Expert', 'Advanced', 'Proficient']
const TOOL_LEVELS = ['Expert', 'Advanced', 'Proficient', 'Daily', 'Familiar']

// ── Stats / badges (live platform data — no vanity numbers) ──────────────────
function fmtHours(seconds: number) {
  const h = Math.round(seconds / 3600)
  return h.toLocaleString()
}
const statCards = computed(() => {
  const s = props.stats
  if (!s) return []
  const cards: { label: string; value: string; sub: string; icon: any; accent?: string }[] = [
    { label: 'Hours delivered', value: fmtHours(s.hours_12mo_seconds), sub: 'last 12 months', icon: Clock },
    { label: 'Tasks shipped', value: s.tasks_done.toLocaleString(), sub: 'on the platform', icon: CheckCircle2 },
  ]
  if (s.ontime_90d_pct != null) {
    cards.push({ label: 'On-time rate', value: s.ontime_90d_pct + '%', sub: 'last 90 days', icon: Gauge, accent: '#15803d' })
  }
  if (s.member_since) {
    cards.push({ label: 'Member since', value: s.member_since, sub: 'on BuzzyHive', icon: Star, accent: '#c2700c' })
  }
  return cards
})

/** Badges are earned from real platform stats, never hand-entered. */
const badges = computed(() => {
  const s = props.stats
  if (!s) return []
  const out: { name: string; issuer: string; icon: any; color: string }[] = []
  const hours = s.hours_12mo_seconds / 3600
  if (s.tasks_done >= 500) out.push({ name: '500+ tasks shipped', issuer: 'Platform milestone', icon: CheckCircle2, color: '#15803d' })
  else if (s.tasks_done >= 100) out.push({ name: '100+ tasks shipped', issuer: 'Platform milestone', icon: CheckCircle2, color: '#15803d' })
  if (hours >= 1000) out.push({ name: '1,000+ hours delivered', issuer: 'Last 12 months', icon: Clock, color: '#2f6fed' })
  else if (hours >= 500) out.push({ name: '500+ hours delivered', issuer: 'Last 12 months', icon: Clock, color: '#2f6fed' })
  if (s.ontime_90d_pct != null && s.ontime_90d_pct >= 95) out.push({ name: 'On-time machine', issuer: `${s.ontime_90d_pct}% on-time, last 90 days`, icon: Trophy, color: '#c2700c' })
  if (s.member_since) out.push({ name: `Since ${s.member_since}`, issuer: 'BuzzyHive Agency', icon: BadgeCheck, color: '#7b2d86' })
  return out
})

// ── Portfolio editing ─────────────────────────────────────────────────────────
const portFile = ref<HTMLInputElement | null>(null)
const portTarget = ref<string | null>(null)
const portError = ref<string | null>(null)

function pickPortfolioImage(id: string) {
  portTarget.value = id
  portFile.value?.click()
}
async function onPortfolioFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  const id = portTarget.value
  if (!file || !id) return
  portError.value = null
  try {
    const url = await uploadPortfolioImage(props.profile.user_id, file)
    const item = portfolio.value.find((w) => w.id === id)
    if (item) {
      item.image_url = url
      commit.portfolio()
    }
  } catch (err) {
    portError.value = (err as Error).message
  }
}
function addPortfolioItem() {
  const item: VaPortfolioItem = { id: crypto.randomUUID(), title: 'New work sample', tag: 'Design', image_url: null }
  portfolio.value.push(item)
  commit.portfolio()
}
function removePortfolioItem(id: string) {
  portfolio.value = portfolio.value.filter((w) => w.id !== id)
  commit.portfolio()
}

const languagesText = computed(() => (props.profile.languages ?? []).join(', '))
function commitLanguages(e: Event) {
  emit('patch', { languages: text(e).split(',').map((s) => s.trim()).filter(Boolean) })
}
</script>

<template>
  <div class="space-y-4">
    <!-- ── HERO ─────────────────────────────────────────────────────────── -->
    <div class="relative rounded-[18px] overflow-hidden border border-base-300 bg-base-100 shadow-[var(--sh-card)]">
      <div class="h-32 relative vap-cover" />
      <div class="px-7 pb-6">
        <div class="flex items-end gap-4 -mt-11">
          <button
            type="button"
            class="relative shrink-0 rounded-full group/photo"
            :class="!editing && 'cursor-default'"
            :disabled="!editing"
            :title="editing ? 'Change photo' : undefined"
            @click="emit('change-photo')"
          >
            <span class="block rounded-full ring-[5px] ring-base-100">
              <HexAvatar :avatar-url="identity.avatarUrl" :name="identity.name" :size="104" tint="primary" />
            </span>
            <span
              v-if="editing"
              class="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 group-hover/photo:opacity-100 transition-opacity"
            >
              <Camera class="w-6 h-6" :stroke-width="1.9" />
            </span>
          </button>
          <div class="flex-1 min-w-0 pb-1">
            <div class="flex items-center gap-2.5 mt-3.5 flex-wrap">
              <h1 class="text-2xl font-extrabold tracking-tight whitespace-nowrap">{{ identity.name }}</h1>
              <BadgeCheck class="w-5 h-5 shrink-0" style="color: #2f6fed" :stroke-width="2" title="Verified by BuzzyHive" />
              <input
                v-if="editing"
                class="vap-edit text-sm w-24"
                :value="profile.pronouns ?? ''"
                placeholder="pronouns"
                @blur="emit('patch', { pronouns: text($event) || null })"
              />
              <span v-else-if="profile.pronouns" class="text-sm text-base-content/50">{{ profile.pronouns }}</span>
            </div>
            <div class="flex items-center gap-2.5 mt-1 flex-wrap">
              <input
                v-if="editing"
                class="vap-edit text-[0.95rem] font-bold text-primary w-52"
                :value="profile.role_title ?? ''"
                placeholder="Role title — e.g. Design Specialist"
                @blur="emit('patch', { role_title: text($event) || null })"
              />
              <span v-else-if="profile.role_title" class="text-[0.95rem] font-bold text-primary whitespace-nowrap">{{ profile.role_title }}</span>
              <span v-if="profile.location || editing" class="w-[3px] h-[3px] rounded-full bg-base-content/30" />
              <span class="inline-flex items-center gap-1.5 text-[0.82rem] text-base-content/60 whitespace-nowrap">
                <MapPin class="w-3.5 h-3.5 shrink-0" :stroke-width="1.75" />
                <input
                  v-if="editing"
                  class="vap-edit w-40"
                  :value="profile.location ?? ''"
                  placeholder="Location"
                  @blur="emit('patch', { location: text($event) || null })"
                />
                <template v-else>{{ profile.location }}</template>
              </span>
              <span v-if="identity.timezone" class="inline-flex items-center gap-1.5 text-[0.82rem] text-base-content/40 whitespace-nowrap">
                <Clock class="w-3 h-3" :stroke-width="1.75" /> {{ identity.timezone }}
              </span>
            </div>
          </div>
        </div>

        <!-- tagline -->
        <textarea
          v-if="editing"
          class="vap-edit block w-full max-w-2xl mt-4 text-base font-medium leading-normal resize-none"
          rows="2"
          :value="profile.tagline ?? ''"
          placeholder="One line that sells you — e.g. “I help founders turn rough ideas into clean, on-brand visuals — fast.”"
          @blur="emit('patch', { tagline: text($event) || null })"
        />
        <p v-else-if="profile.tagline" class="mt-4 text-base font-medium leading-normal max-w-2xl">{{ profile.tagline }}</p>

        <!-- availability + CTAs -->
        <div class="flex items-center gap-3 mt-4 flex-wrap">
          <span
            class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[0.82rem] font-semibold"
            :style="{ background: avail.bg, color: avail.fg }"
          >
            <span class="w-2 h-2 rounded-full" :style="{ background: avail.dot }" />
            {{ profile.availability_note || `${avail.label} · ~${profile.availability_hours} hrs/week` }}
          </span>
          <div class="flex-1" />
          <a
            v-if="profile.contact_email"
            :href="`mailto:${profile.contact_email}?subject=Working with ${identity.name}`"
            class="btn btn-primary btn-sm gap-1.5"
          >
            <Calendar class="w-4 h-4" :stroke-width="2" /> Book a call
          </a>
          <button type="button" class="btn btn-outline btn-sm gap-1.5" @click="emit('message')">
            <MessageSquare class="w-4 h-4" :stroke-width="1.9" /> Message
          </button>
        </div>
      </div>
    </div>

    <!-- ── STATS BAND ───────────────────────────────────────────────────── -->
    <div v-if="statCards.length" class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      <div v-for="s in statCards" :key="s.label" class="vap-card p-4">
        <div class="flex items-center gap-1.5 text-base-content/40 mb-2.5">
          <component :is="s.icon" class="w-3.5 h-3.5" :stroke-width="1.75" />
          <span class="text-[0.65rem] font-bold uppercase tracking-wider">{{ s.label }}</span>
        </div>
        <div class="text-[1.7rem] font-extrabold tracking-tight leading-none tabular-nums" :style="s.accent ? { color: s.accent } : {}">{{ s.value }}</div>
        <div class="text-[0.72rem] text-base-content/45 mt-1.5">{{ s.sub }}</div>
      </div>
    </div>

    <div class="grid lg:grid-cols-[1fr_330px] gap-4 items-start">
      <div class="space-y-4 min-w-0">
        <!-- ── ABOUT ────────────────────────────────────────────────────── -->
        <div class="vap-card p-6">
          <div class="vap-title"><span class="vap-title-icon"><UserIcon class="w-4 h-4" :stroke-width="1.9" /></span><h2>About</h2></div>
          <textarea
            v-if="editing"
            class="vap-edit block w-full text-sm leading-relaxed text-base-content/80 resize-y min-h-24"
            rows="4"
            :value="profile.about ?? ''"
            placeholder="Who you are, what you own end-to-end, and how you like to work."
            @blur="emit('patch', { about: text($event) || null })"
          />
          <p v-else-if="profile.about" class="text-sm leading-relaxed text-base-content/80 whitespace-pre-line">{{ profile.about }}</p>
          <p v-else class="text-sm italic text-base-content/40">No bio yet.</p>

          <div class="flex gap-2 mt-4 flex-wrap items-center">
            <template v-if="editing">
              <Globe2 class="w-3.5 h-3.5 text-base-content/40" :stroke-width="1.75" />
              <input
                class="vap-edit flex-1 min-w-48 text-[0.82rem]"
                :value="languagesText"
                placeholder="Languages, comma-separated — English (fluent), Filipino (native)"
                @blur="commitLanguages"
              />
            </template>
            <span
              v-for="l in profile.languages"
              v-else
              :key="l"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-200 text-base-content/70 text-[0.78rem] font-semibold"
            >
              <Globe2 class="w-3 h-3" :stroke-width="1.75" /> {{ l }}
            </span>
          </div>
        </div>

        <!-- ── SKILLS & TOOLS ───────────────────────────────────────────── -->
        <div class="vap-card p-6">
          <div class="vap-title">
            <span class="vap-title-icon"><Sparkles class="w-4 h-4" :stroke-width="1.9" /></span><h2>Skills &amp; tools</h2>
            <button v-if="editing" type="button" class="vap-add" @click="skills.push({ name: '', level: 70, tag: 'Proficient' }); commit.skills()">
              <Plus class="w-3.5 h-3.5" :stroke-width="2" /> Add skill
            </button>
          </div>

          <div class="space-y-3.5 mb-5">
            <div v-for="(s, i) in skills" :key="i">
              <div class="flex items-baseline gap-2 mb-1.5">
                <input v-if="editing" v-model="s.name" class="vap-edit text-[0.84rem] font-semibold flex-1" placeholder="Skill name" @blur="commit.skills()" />
                <span v-else class="text-[0.84rem] font-semibold">{{ s.name }}</span>
                <template v-if="editing">
                  <input v-model.number="s.level" type="number" min="0" max="100" class="vap-edit w-14 text-[0.72rem] text-right" @blur="commit.skills()" />
                  <select v-model="s.tag" class="select select-bordered select-xs" @change="commit.skills()">
                    <option v-for="t in SKILL_TAGS" :key="t" :value="t">{{ t }}</option>
                  </select>
                  <button type="button" class="vap-x" @click="skills.splice(i, 1); commit.skills()"><X class="w-3 h-3" :stroke-width="2" /></button>
                </template>
                <span v-else class="ml-auto text-[0.72rem] font-bold text-primary">{{ s.tag }}</span>
              </div>
              <div class="h-[7px] rounded-full bg-base-200 overflow-hidden">
                <div class="h-full rounded-full vap-skillbar" :style="{ width: Math.min(Math.max(s.level, 0), 100) + '%' }" />
              </div>
            </div>
            <p v-if="!skills.length" class="text-sm italic text-base-content/40">No skills listed yet.</p>
          </div>

          <div class="flex items-center gap-2 mb-2.5">
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40">Tools</div>
            <button v-if="editing" type="button" class="vap-add" @click="tools.push({ name: '', level: 'Proficient' }); commit.tools()">
              <Plus class="w-3 h-3" :stroke-width="2" /> Add
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(t, i) in tools"
              :key="i"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border border-base-300 bg-base-200/40 text-[0.82rem] font-semibold"
            >
              <span class="w-[7px] h-[7px] rounded-full shrink-0" :style="{ background: TOOL_TONE[t.level] ?? 'var(--color-base-content)' }" />
              <input v-if="editing" v-model="t.name" class="vap-edit w-24" placeholder="Tool" @blur="commit.tools()" />
              <template v-else>{{ t.name }}</template>
              <select v-if="editing" v-model="t.level" class="select select-ghost select-xs px-1" @change="commit.tools()">
                <option v-for="lv in TOOL_LEVELS" :key="lv" :value="lv">{{ lv }}</option>
              </select>
              <span v-else class="text-[0.68rem] text-base-content/45 font-semibold">{{ t.level }}</span>
              <button v-if="editing" type="button" class="vap-x" @click="tools.splice(i, 1); commit.tools()"><X class="w-3 h-3" :stroke-width="2" /></button>
            </span>
            <p v-if="!tools.length && !editing" class="text-sm italic text-base-content/40">No tools listed yet.</p>
          </div>
        </div>

        <!-- ── EXPERIENCE ───────────────────────────────────────────────── -->
        <div class="vap-card p-6">
          <div class="vap-title">
            <span class="vap-title-icon"><Briefcase class="w-4 h-4" :stroke-width="1.9" /></span><h2>Experience &amp; clients</h2>
            <button v-if="editing" type="button" class="vap-add" @click="experience.push({ client: '', role: '', period: '', blurb: '' }); commit.experience()">
              <Plus class="w-3.5 h-3.5" :stroke-width="2" /> Add
            </button>
          </div>
          <div class="relative">
            <div v-if="experience.length > 1" class="absolute left-[19px] top-1.5 bottom-1.5 w-px bg-base-300" />
            <div v-for="(e, i) in experience" :key="i" class="relative flex gap-3.5" :class="i < experience.length - 1 && 'mb-5'">
              <div class="z-[1] shrink-0"><HexAvatar :name="e.client || '?'" :size="40" /></div>
              <div class="flex-1 min-w-0 pt-px">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <input v-if="editing" v-model="e.client" class="vap-edit text-[0.88rem] font-bold w-36" placeholder="Client" @blur="commit.experience()" />
                  <span v-else class="text-[0.88rem] font-bold">{{ e.client }}</span>
                  <input v-if="editing" v-model="e.role" class="vap-edit text-[0.8rem] text-primary font-semibold w-44" placeholder="What you did" @blur="commit.experience()" />
                  <span v-else class="text-[0.8rem] text-primary font-semibold">{{ e.role }}</span>
                  <input v-if="editing" v-model="e.period" class="vap-edit ml-auto text-xs w-28 text-right" placeholder="2025 — present" @blur="commit.experience()" />
                  <span v-else class="ml-auto text-xs text-base-content/45 font-semibold">{{ e.period }}</span>
                  <button v-if="editing" type="button" class="vap-x" @click="experience.splice(i, 1); commit.experience()"><X class="w-3 h-3" :stroke-width="2" /></button>
                </div>
                <textarea
                  v-if="editing"
                  v-model="e.blurb"
                  class="vap-edit block w-full mt-1 text-[0.8rem] leading-relaxed text-base-content/70 resize-none"
                  rows="2"
                  placeholder="What you owned and shipped."
                  @blur="commit.experience()"
                />
                <div v-else class="text-[0.8rem] leading-relaxed text-base-content/70 mt-1">{{ e.blurb }}</div>
              </div>
            </div>
            <p v-if="!experience.length" class="text-sm italic text-base-content/40">No experience entries yet.</p>
          </div>
        </div>

        <!-- ── PORTFOLIO ────────────────────────────────────────────────── -->
        <div v-if="portfolio.length || editing" class="vap-card p-6">
          <div class="vap-title">
            <span class="vap-title-icon"><ImageIcon class="w-4 h-4" :stroke-width="1.9" /></span><h2>Portfolio</h2>
            <button v-if="editing" type="button" class="vap-add" @click="addPortfolioItem">
              <Plus class="w-3.5 h-3.5" :stroke-width="2" /> Add work
            </button>
          </div>
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div v-for="w in portfolio" :key="w.id" class="relative rounded-xl overflow-hidden border border-base-300 bg-base-200/40 group/tile">
              <button
                type="button"
                class="block w-full aspect-[4/3] bg-base-200"
                :class="!editing && 'cursor-default'"
                :disabled="!editing"
                :title="editing ? 'Upload work sample' : undefined"
                @click="pickPortfolioImage(w.id)"
              >
                <img v-if="w.image_url" :src="w.image_url" :alt="w.title" class="w-full h-full object-cover" loading="lazy" />
                <span v-else class="w-full h-full grid place-items-center text-base-content/30">
                  <span class="flex flex-col items-center gap-1.5 text-[0.7rem] font-semibold">
                    <ImageIcon class="w-6 h-6" :stroke-width="1.5" />
                    {{ editing ? 'Click to upload' : 'No image' }}
                  </span>
                </span>
              </button>
              <div class="px-3 py-2.5">
                <input v-if="editing" v-model="w.title" class="vap-edit w-full text-[0.8rem] font-semibold" placeholder="Title" @blur="commit.portfolio()" />
                <div v-else class="text-[0.8rem] font-semibold truncate">{{ w.title }}</div>
                <div class="flex items-center gap-1.5 mt-1">
                  <input
                    v-if="editing"
                    v-model="w.tag"
                    class="vap-edit text-[0.65rem] font-bold w-20"
                    placeholder="Tag"
                    @blur="commit.portfolio()"
                  />
                  <span v-else class="inline-block px-2 py-px rounded-md text-[0.65rem] font-bold text-primary" style="background: var(--accent-soft)">{{ w.tag }}</span>
                  <button v-if="editing" type="button" class="vap-x ml-auto" @click="removePortfolioItem(w.id)"><X class="w-3 h-3" :stroke-width="2" /></button>
                </div>
              </div>
            </div>
          </div>
          <p v-if="portError" class="text-xs text-error mt-2">{{ portError }}</p>
          <input ref="portFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" @change="onPortfolioFile" />
        </div>
      </div>

      <!-- ── SIDEBAR ──────────────────────────────────────────────────────── -->
      <div class="space-y-4 lg:sticky lg:top-4">
        <!-- availability -->
        <div class="vap-card p-6">
          <div class="vap-title"><span class="vap-title-icon"><Gauge class="w-4 h-4" :stroke-width="1.9" /></span><h2>Availability</h2></div>
          <div class="flex items-baseline gap-2 mb-2">
            <span class="text-[1.8rem] font-extrabold tracking-tight">
              <input
                v-if="editing"
                :value="profile.availability_hours"
                type="number"
                min="0"
                max="60"
                class="vap-edit w-16 text-[1.8rem] font-extrabold"
                @blur="emit('patch', { availability_hours: Number(text($event)) || 0 })"
              />
              <template v-else>{{ profile.availability_hours }}</template>
              <span class="text-[0.85rem] text-base-content/45 font-semibold"> hrs/wk</span>
            </span>
            <span class="ml-auto inline-flex items-center gap-1.5 text-[0.78rem] font-semibold" :style="{ color: avail.fg }">
              <span class="w-[7px] h-[7px] rounded-full" :style="{ background: avail.dot }" />{{ avail.label }}
            </span>
          </div>
          <select
            v-if="editing"
            :value="profile.availability_status"
            class="select select-bordered select-sm w-full mb-2"
            @change="emit('patch', { availability_status: text($event) as VaProfile['availability_status'] })"
          >
            <option value="open">Open — taking new work</option>
            <option value="limited">Limited slots</option>
            <option value="closed">Fully booked</option>
          </select>
          <input
            v-if="editing"
            class="vap-edit w-full text-[0.78rem]"
            :value="profile.availability_note ?? ''"
            placeholder="Note — e.g. Open to ~10 hrs/week · 2 slots left"
            @blur="emit('patch', { availability_note: text($event) || null })"
          />
          <p v-else-if="profile.availability_note" class="text-[0.78rem] text-base-content/60 leading-relaxed">{{ profile.availability_note }}</p>
          <a
            v-if="profile.contact_email && !editing"
            :href="`mailto:${profile.contact_email}?subject=Requesting ${identity.name}`"
            class="btn btn-primary btn-sm w-full mt-3.5 gap-1.5"
          >
            <Calendar class="w-3.5 h-3.5" :stroke-width="2" /> Request {{ identity.name.split(' ')[0] }}
          </a>
          <label v-if="editing" class="block mt-3.5">
            <span class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40">Contact email (powers the CTAs)</span>
            <input
              type="email"
              class="input input-bordered input-sm w-full mt-1"
              :value="profile.contact_email ?? ''"
              placeholder="you@hivemind.com"
              @blur="emit('patch', { contact_email: text($event) || null })"
            />
          </label>
        </div>

        <!-- badges (earned, computed from live stats) -->
        <div v-if="badges.length" class="vap-card p-6">
          <div class="vap-title"><span class="vap-title-icon"><Trophy class="w-4 h-4" :stroke-width="1.9" /></span><h2>Badges</h2></div>
          <div class="space-y-2.5">
            <div v-for="b in badges" :key="b.name" class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-base-300 bg-base-200/40">
              <span class="w-9 h-9 rounded-[10px] shrink-0 grid place-items-center" :style="{ background: `color-mix(in oklab, ${b.color} 13%, var(--color-base-100))`, color: b.color }">
                <component :is="b.icon" class="w-[18px] h-[18px]" :stroke-width="1.9" />
              </span>
              <div class="min-w-0">
                <div class="text-[0.84rem] font-bold truncate">{{ b.name }}</div>
                <div class="text-[0.72rem] text-base-content/45 truncate">{{ b.issuer }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vap-cover {
  background: linear-gradient(120deg, color-mix(in oklab, var(--accent) 78%, #000) 0%, var(--accent) 45%, color-mix(in oklab, var(--accent) 55%, #c98fcf) 100%);
}
.vap-cover::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0);
  background-size: 18px 18px;
}
.vap-card {
  background: var(--color-base-100);
  border: 1px solid var(--color-base-300);
  border-radius: 16px;
  box-shadow: var(--sh-card);
}
.vap-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 16px;
}
.vap-title h2 {
  font-size: 1rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.vap-title-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent-fg);
  display: grid;
  place-items: center;
  flex: none;
}
.vap-add {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--accent-fg);
}
.vap-x {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--color-base-content);
  opacity: 0.35;
  flex: none;
}
.vap-x:hover {
  opacity: 1;
  color: var(--color-error, #c2253c);
  background: var(--color-base-200);
}
.vap-skillbar {
  background: linear-gradient(90deg, color-mix(in oklab, var(--accent) 60%, #c98fcf), var(--accent));
}
/* Inline-editable fields: invisible until edit mode highlights them. */
.vap-edit {
  background: transparent;
  outline: none;
  border: 1px dashed color-mix(in oklab, var(--accent) 35%, transparent);
  border-radius: 6px;
  padding: 1px 6px;
  min-width: 0;
}
.vap-edit:focus {
  border-color: var(--accent);
  background: var(--color-base-200);
}
</style>
