<script setup lang="ts">
// "Done for you" — merged from the old TheMatch + HowItWorks sections.
// Part 1: a pinned card-stack hook — the reject pile flies away and your single
// best-fit match (Maria) remains. Part 2: the concrete 7-day path timeline.
// One best-fit match is the canonical promise (no "shortlist of 3").
import { ref, computed } from 'vue'
import AmbientGradient from './AmbientGradient.vue'
import { Phone, Users, Rocket, Headphones, TrendingUp } from 'lucide-vue-next'
import { useScrollProgress } from '@/composables/useScrollProgress'
import { useInViewProgress } from '@/composables/useInViewProgress'
import discoveryImg from '@/assets/landing/how-discovery-call.webp'
import managedImg from '@/assets/landing/how-managed-call.webp'
import teamImg from '@/assets/landing/how-team-call.webp'

const prefersReduced =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

// ── Part 1: pinned card-stack ──────────────────────────────────────
const sectionEl = ref<HTMLElement | null>(null)
const { progress } = useScrollProgress(sectionEl)
// When reduced-motion is on, jump straight to the resolved match (no scrub).
const p = computed(() => (prefersReduced ? 1 : progress.value))

// Candidates the matching process filters out — neutral fit/mismatch reasons,
// not character verdicts. They're capable people who don't fit THIS role.
const rejects = [
  { name: 'Jordan P.', role: 'General VA', flaw: 'New to real estate' },
  { name: 'Alex R.', role: 'Admin assistant', flaw: 'Time-zone mismatch' },
  { name: 'Sam T.', role: 'Freelancer', flaw: 'Different specialty' },
  { name: 'Casey M.', role: 'Generalist', flaw: 'Outside your budget' },
  { name: 'Riley K.', role: 'Junior VA', flaw: 'Needs ramp-up time' },
  { name: 'Drew L.', role: 'Generalist', flaw: 'Skills not a fit' }
]
const N = rejects.length
const REJECT_END = 0.58

const initials = (name: string) =>
  name.split(' ').map((s) => s[0]).join('').slice(0, 2)

const rejectLocal = (i: number) => {
  const step = REJECT_END / N
  return clamp((p.value - i * step) / step)
}

// Inner-card transform/opacity (z-index lives on the wrapper).
const cardStyle = (i: number) => {
  const local = rejectLocal(i)
  const restY = i * 9
  const restScale = 1 - i * 0.035
  const restRot = (i % 2 ? 1 : -1) * (i * 1.3)
  const ejX = local * 600
  const ejRot = local * 14 * (i % 2 ? 1 : -1)
  const op = 1 - clamp((local - 0.25) / 0.55)
  return {
    transform: `translate(${ejX}px, ${restY}px) rotate(${restRot + ejRot}deg) scale(${restScale})`,
    opacity: String(op)
  }
}
const rejectStamp = (i: number) => clamp((rejectLocal(i) - 0.05) / 0.12)

const matchReveal = computed(() => clamp((p.value - 0.5) / 0.3))
const matchStyle = computed(() => ({ transform: `scale(${0.9 + matchReveal.value * 0.1})` }))
const glow = computed(() => matchReveal.value)
const stampStyle = computed(() => {
  const s = clamp((p.value - 0.72) / 0.18)
  return { opacity: String(s), transform: `rotate(-8deg) scale(${0.6 + s * 0.4})` }
})

const remaining = computed(() => Math.max(1, Math.round(47 - clamp(p.value / REJECT_END) * 46)))
const statusLabel = computed(() => {
  if (p.value < REJECT_END) return `Reviewing ${remaining.value} applicants…`
  if (p.value < 0.82) return 'Best-fit match found'
  return 'Ready to start in 72 hours'
})
const matched = computed(() => p.value >= REJECT_END)

const skipSteps = [
  { at: 0.1, label: 'Write & post the job' },
  { at: 0.24, label: 'Screen dozens of applicants' },
  { at: 0.4, label: 'Run interview rounds' },
  { at: 0.54, label: 'Skills & reference checks' }
]
const skipDone = (at: number) => p.value >= at

// ── Part 2: the 7-day path timeline ────────────────────────────────
const steps = [
  { num: '01', title: 'Discovery call', body: 'A 20-minute call to understand your business: team size, transaction volume, tools you use, and what\'s eating your time.', icon: Phone },
  { num: '02', title: 'Your best-fit match', body: 'Within 72 hours, we hand you your one best-fit VA — pre-vetted, and already fluent in real-estate workflows, your CRM, and your time zone.', icon: Users },
  { num: '03', title: '7-day onboarding', body: 'Your VA learns your playbook, brokerage systems, and communication style. By day 7, they\'re handling tasks independently.', icon: Rocket },
  { num: '04', title: 'Managed support', body: 'A project manager runs daily check-ins, weekly reports, and quarterly reviews. Problems get caught before you feel them.', icon: Headphones },
  { num: '05', title: 'Scale your team', body: 'Add a transaction coordinator, a marketing VA, or a second admin as your production grows. One platform, unlimited growth.', icon: TrendingUp }
]

const stepsEl = ref<HTMLElement | null>(null)
const { progress: stepProgress } = useInViewProgress(stepsEl)
const sp = computed(() => (prefersReduced ? 1 : stepProgress.value))
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
// The connector line draws across, and each step lights up as the line reaches it.
const lineProgress = computed(() => smooth(0.12, 0.72, sp.value))
const stepActive = (i: number) => sp.value > (i + 0.35) / steps.length
</script>

<template>
  <!-- ── Part 1: pinned card-stack hook ── -->
  <section
    ref="sectionEl"
    id="match"
    class="relative bg-base-200"
    :class="prefersReduced ? '' : 'h-[300svh]'"
  >
    <div class="sticky top-0 min-h-[100svh] flex items-center overflow-hidden border-t border-base-300 bg-base-200">
      <div class="absolute inset-0 pointer-events-none">
        <AmbientGradient :opacity="0.14" tone="mixed" />
      </div>

      <div class="relative w-full max-w-6xl mx-auto px-6 py-12 lg:py-20 grid lg:grid-cols-2 gap-12 items-center">
        <!-- Left: copy + "what you skip" checklist -->
        <div>
          <div class="flex items-center gap-3 mb-3">
            <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-plum"></div>
            <span class="text-xs font-medium uppercase tracking-wider text-primary">Done for you</span>
          </div>
          <h2 class="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.1] text-base-content">
            Skip the hiring process entirely.
          </h2>
          <p class="mt-5 text-base text-base-content/60 leading-relaxed max-w-md">
            No job posts. No résumé piles. No interview marathons. Tell us what you need &mdash; we run the search, the vetting, and the matching, then hand you one best-fit candidate. Usually within 72 hours.
          </p>

          <!-- Live status chip -->
          <div
            class="mt-7 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-300"
            :class="matched ? 'border-primary/40 bg-primary/10 text-primary' : 'border-base-300 bg-base-100 text-base-content/60'"
          >
            <span
              class="w-1.5 h-1.5 rounded-full transition-colors duration-300"
              :class="matched ? 'bg-primary' : 'bg-base-content/30 animate-pulse'"
            ></span>
            {{ statusLabel }}
          </div>

          <!-- What you skip -->
          <ul class="mt-8 space-y-3">
            <li v-for="s in skipSteps" :key="s.label" class="flex items-center gap-3">
              <span
                class="shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors duration-300"
                :class="skipDone(s.at) ? 'bg-primary border-primary text-white' : 'border-base-300 text-transparent'"
              >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span
                class="text-sm transition-all duration-300"
                :class="skipDone(s.at) ? 'line-through text-base-content/40' : 'text-base-content/70'"
              >{{ s.label }}</span>
            </li>
          </ul>
          <p class="mt-6 text-sm text-base-content/55">We do all of it. You just meet your match.</p>
        </div>

        <!-- Right: the card stack -->
        <div class="relative h-[300px] sm:h-[420px]">
          <!-- Match card (behind the pile) -->
          <div class="absolute inset-0 flex items-center justify-center" style="z-index: 1">
            <div class="relative w-[300px] max-w-full rounded-2xl border-2 border-primary bg-base-100 shadow-2xl shadow-primary/25 p-5 will-change-transform" :style="matchStyle">
              <div class="absolute -inset-3 rounded-3xl bg-primary/20 blur-2xl -z-10" :style="{ opacity: glow }"></div>

              <div class="flex items-center gap-3">
                <div class="relative w-12 h-12 rounded-full bg-gradient-to-br from-primary/15 to-plum/15 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  MS
                  <span class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center border-2 border-base-100">
                    <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-base-content">Maria Santos</div>
                  <div class="text-[11px] text-base-content/55">Real Estate VA · 6 yrs</div>
                </div>
                <span class="ml-auto text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-1 rounded">98% fit</span>
              </div>

              <div class="mt-4 space-y-2">
                <div v-for="t in ['Knows Follow Up Boss & Dotloop', '9am–5pm PST overlap', 'Top 3% · skills-tested']" :key="t" class="flex items-center gap-2 text-xs text-base-content/70">
                  <svg class="w-3.5 h-3.5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  {{ t }}
                </div>
              </div>

              <div class="mt-5 flex items-center justify-between">
                <span class="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-1 rounded">Ready in 72h</span>
                <a href="#contact" class="text-xs font-medium text-primary inline-flex items-center gap-1 hover:gap-1.5 transition-all">
                  Meet Maria
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </a>
              </div>

              <!-- Best-fit stamp -->
              <div class="absolute -top-3.5 -right-3.5 pointer-events-none" :style="stampStyle">
                <div class="bg-primary text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-md shadow-lg border-2 border-base-100">★ Best-fit match</div>
              </div>
            </div>
          </div>

          <!-- Reject pile (on top, flies away on scroll) -->
          <div
            v-for="(r, i) in rejects"
            :key="r.name"
            class="absolute inset-0 flex items-center justify-center"
            :style="{ zIndex: N - i + 1 }"
          >
            <div class="relative w-[270px] max-w-full rounded-xl border border-base-300 bg-base-100 shadow-lg p-4 will-change-transform" :style="cardStyle(i)">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-base-200 border border-base-300 flex items-center justify-center text-xs font-bold text-base-content/50">{{ initials(r.name) }}</div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-base-content truncate">{{ r.name }}</div>
                  <div class="text-[11px] text-base-content/50 truncate">{{ r.role }}</div>
                </div>
              </div>
              <div class="mt-3 flex items-center gap-1.5 text-[11px] text-base-content/45">
                <span class="inline-block w-1.5 h-1.5 rounded-full bg-base-300"></span>{{ r.flaw }}
              </div>

              <!-- Rejected ✗ -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none" :style="{ opacity: rejectStamp(i) }">
                <div class="w-12 h-12 rounded-full bg-red-500/90 text-white flex items-center justify-center shadow-lg rotate-[-8deg]">
                  <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Part 2: the 7-day path (formerly How It Works) ── -->
  <section id="how" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="blue" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="max-w-2xl mb-14">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-plum"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">How it works</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          From first call to a working VA in seven days.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          We handle the matching, onboarding, and ongoing management. You just delegate.
        </p>
      </div>

      <!-- Steps with a connector line that draws on scroll -->
      <div ref="stepsEl" v-reveal="150" class="relative">
        <!-- Connector track + animated fill (desktop) -->
        <div class="hidden md:block absolute top-8 left-[10%] right-[10%] h-0.5 rounded-full bg-base-300"></div>
        <div class="hidden md:block absolute top-8 left-[10%] h-0.5 rounded-full bg-gradient-to-r from-primary via-plum to-primary origin-left" :style="{ width: '80%', transform: `scaleX(${lineProgress})` }"></div>

        <div class="grid gap-6 md:grid-cols-5">
          <div
            v-for="(step, i) in steps"
            :key="step.num"
            class="relative text-center"
          >
            <!-- Step icon circle (lights up as the line reaches it) -->
            <div
              class="relative mx-auto w-16 h-16 rounded-full border bg-base-100 flex items-center justify-center mb-4 transition-all duration-500"
              :class="stepActive(i) ? 'border-primary shadow-md shadow-primary/15' : 'border-base-300'"
            >
              <component :is="step.icon" class="w-6 h-6 transition-colors duration-500" :class="stepActive(i) ? 'text-primary' : 'text-base-content/35'" />
            </div>
            <div class="font-mono text-[10px] tracking-wider mb-1 transition-colors duration-500" :class="stepActive(i) ? 'text-primary' : 'text-primary/40'">{{ step.num }}</div>
            <h3 class="text-sm font-semibold text-base-content mb-2">{{ step.title }}</h3>
            <p class="text-xs text-base-content/55 leading-relaxed">{{ step.body }}</p>
          </div>
        </div>
      </div>

      <!-- Three supporting visuals: discovery, managed, scale -->
      <div v-reveal="200" class="mt-14 grid md:grid-cols-3 gap-5">
        <div class="relative rounded-xl overflow-hidden border border-base-300 shadow-sm aspect-[4/3] group">
          <img :src="discoveryImg" alt="Discovery call" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-t from-base-content/70 to-transparent"></div>
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="text-[10px] uppercase tracking-wider text-white/70 mb-1">Step 01</div>
            <div class="text-sm font-semibold text-white">Discovery Call</div>
          </div>
        </div>
        <div class="relative rounded-xl overflow-hidden border border-base-300 shadow-sm aspect-[4/3] group">
          <img :src="managedImg" alt="Managed support video call" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-t from-base-content/70 to-transparent"></div>
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="text-[10px] uppercase tracking-wider text-white/70 mb-1">Step 04</div>
            <div class="text-sm font-semibold text-white">Managed Support</div>
          </div>
        </div>
        <div class="relative rounded-xl overflow-hidden border border-base-300 shadow-sm aspect-[4/3] group">
          <img :src="teamImg" alt="Scaled team meeting" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-t from-base-content/70 to-transparent"></div>
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="text-[10px] uppercase tracking-wider text-white/70 mb-1">Step 05</div>
            <div class="text-sm font-semibold text-white">Scale Your Team</div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="mt-12 flex flex-wrap items-center gap-4 justify-center">
        <a href="#contact" class="inline-flex items-center gap-2 bg-primary text-primary-content font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm">
          Start with a discovery call
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
        <span class="text-xs text-base-content/50">20 minutes · No commitment · Free</span>
      </div>
    </div>
  </section>
</template>
