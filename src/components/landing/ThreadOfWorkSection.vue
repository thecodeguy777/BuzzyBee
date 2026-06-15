<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  MessageCircle, CheckSquare, Handshake, Trophy, Video, Phone, Clock, Sparkles,
} from 'lucide-vue-next'

// "One thread of work" — the scroll-pinned story. A 480vh runway pins a stage
// while a golden thread draws down through five beats of real work: a client
// message becomes a task, the task becomes a CRM entry, the deal is won (and
// announces itself back in chat), and the kickoff meeting runs on the clock.
// Every beat is a faithful miniature of the actual product UI — same shapes,
// same chips — just staged. Self-contained: no app stores.

const wrap = ref<HTMLElement | null>(null)
const progress = ref(0)
let raf = 0
let reduced = false

function update() {
  raf = 0
  const el = wrap.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const total = r.height - window.innerHeight
  progress.value = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1
}
function onScroll() {
  if (!raf) raf = requestAnimationFrame(update)
}
onMounted(() => {
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) progress.value = 1
  else {
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
  }
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (raf) cancelAnimationFrame(raf)
})

// Five beats, each owning a window of the scroll runway (with a settle-in lead).
const STEPS = [
  { key: 'chat',  label: 'A message lands',      app: 'HiveChat',  icon: MessageCircle, start: 0.04, len: 0.17 },
  { key: 'task',  label: 'It becomes a task',    app: 'HiveFlow',  icon: CheckSquare,   start: 0.22, len: 0.17 },
  { key: 'crm',   label: 'The CRM remembers',    app: 'HiveCRM',   icon: Handshake,     start: 0.40, len: 0.17 },
  { key: 'won',   label: 'The deal closes',      app: 'Pipeline',  icon: Trophy,        start: 0.58, len: 0.17 },
  { key: 'meet',  label: 'Kickoff, on the clock', app: 'HiveMeet', icon: Video,         start: 0.76, len: 0.17 },
] as const

const sp = (i: number) => {
  const s = STEPS[i]
  return Math.min(1, Math.max(0, (progress.value - s.start) / s.len))
}
const activeStep = computed(() => {
  for (let i = STEPS.length - 1; i >= 0; i--) if (sp(i) > 0) return i
  return -1
})
const finale = computed(() => Math.min(1, Math.max(0, (progress.value - 0.94) / 0.05)))

// Beat 1: the client message types itself out.
const MSG = 'Can you chase the Henderson proposal? They went quiet on us.'
const typed = computed(() => {
  const p = sp(0)
  if (p <= 0.18) return ''
  return MSG.slice(0, Math.round(((p - 0.18) / 0.72) * MSG.length))
})
const typingDots = computed(() => sp(0) > 0.02 && typed.value.length < MSG.length)

// Beat 4: the stage chip walks Proposal → Negotiation → Won.
const wonStage = computed(() => {
  const p = sp(3)
  if (p < 0.3) return 0
  if (p < 0.55) return 1
  return 2
})
const STAGE_CHIPS = [
  { label: 'Proposal', dot: '#c2700c' },
  { label: 'Negotiation', dot: '#9b59d0' },
  { label: 'Won', dot: '#34c06b' },
]

// Beat 5: the meeting timer counts with scroll.
const meetClock = computed(() => {
  const secs = Math.round(sp(4) * 47)
  return `00:${String(secs).padStart(2, '0')}`
})

// A card's presence: rises in over the first 30% of its window, stays.
function cardStyle(i: number) {
  const p = sp(i)
  const enter = Math.min(1, p / 0.3)
  const e = 1 - Math.pow(1 - enter, 3) // easeOutCubic
  return {
    opacity: String(0.12 + e * 0.88),
    transform: `translateY(${(1 - e) * 34}px) scale(${0.94 + e * 0.06})`,
    filter: enter >= 1 ? 'none' : `blur(${(1 - e) * 5}px)`,
  }
}
const nodeLit = (i: number) => sp(i) > 0.08
</script>

<template>
  <section ref="wrap" class="thread relative border-t border-white/5" :style="{ height: '480vh' }">
    <!-- Rounded-hexagon clip (objectBoundingBox → scales to any hex size) -->
    <svg width="0" height="0" class="absolute" aria-hidden="true">
      <defs>
        <clipPath id="thr-hex-clip" clipPathUnits="objectBoundingBox">
          <path d="M 0.325 0.067 L 0.675 0.067 Q 0.75 0.067 0.788 0.132 L 0.963 0.435 Q 1 0.5 0.963 0.565 L 0.788 0.868 Q 0.75 0.933 0.675 0.933 L 0.325 0.933 Q 0.25 0.933 0.213 0.868 L 0.038 0.565 Q 0 0.5 0.038 0.435 L 0.213 0.132 Q 0.25 0.067 0.325 0.067 Z" />
        </clipPath>
      </defs>
    </svg>
    <div class="sticky top-0 h-screen overflow-hidden flex flex-col">
      <!-- atmosphere -->
      <div class="absolute inset-0 pointer-events-none">
        <div class="thr-glow" :style="{ opacity: 0.5 + progress * 0.5 }" />
      </div>

      <!-- header -->
      <div class="relative pt-10 md:pt-14 pb-4 text-center px-6">
        <div class="flex items-center gap-3 justify-center mb-3">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-[#a85be0]/0 to-[#a85be0]" />
          <span class="font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-[#a85be0]">One thread of work</span>
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-l from-[#a85be0]/0 to-[#a85be0]" />
        </div>
        <h2 class="font-display text-2xl md:text-4xl tracking-tight text-white">
          Watch one request travel the whole hive.
        </h2>
        <!-- progress counter -->
        <div class="absolute right-6 top-10 md:top-14 hidden md:flex items-baseline gap-1 font-mono text-white/30 text-sm tabular-nums">
          <span class="text-[#c79bef] text-xl">{{ String(Math.max(1, activeStep + 1)).padStart(2, '0') }}</span>
          <span>/ 05</span>
        </div>
      </div>

      <!-- stage -->
      <div class="relative flex-1 min-h-0 max-w-5xl w-full mx-auto px-6 pb-8 flex gap-8">
        <!-- left rail: the thread + step labels -->
        <div class="relative hidden md:flex flex-col w-56 shrink-0 pt-2">
          <svg class="absolute left-[9px] top-3 bottom-3 w-[2px] h-[calc(100%-24px)]" preserveAspectRatio="none" viewBox="0 0 2 100" aria-hidden="true">
            <line x1="1" y1="0" x2="1" y2="100" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
            <line x1="1" y1="0" x2="1" y2="100" stroke="url(#thr-gold)" stroke-width="2" pathLength="1"
              :style="{ strokeDasharray: 1, strokeDashoffset: 1 - Math.min(1, progress * 1.08) }" />
            <defs>
              <linearGradient id="thr-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#a85be0" />
                <stop offset="100%" stop-color="#6a4cdd" />
              </linearGradient>
            </defs>
          </svg>
          <div
            v-for="(s, i) in STEPS"
            :key="s.key"
            class="relative flex items-center gap-3 py-[4.5vh] transition-opacity duration-300"
            :class="activeStep === i ? 'opacity-100' : 'opacity-40'"
          >
            <span
              class="w-5 h-5 rounded-full grid place-items-center shrink-0 border transition-all duration-500 z-10"
              :class="nodeLit(i) ? 'bg-[#a85be0] border-[#c79bef] thr-node-lit' : 'bg-[#11141d] border-white/15'"
            >
              <component :is="s.icon" class="w-2.5 h-2.5" :class="nodeLit(i) ? 'text-white' : 'text-white/40'" />
            </span>
            <div class="min-w-0">
              <div class="font-mono text-[9px] uppercase tracking-[0.2em]" :class="activeStep === i ? 'text-[#c79bef]' : 'text-white/30'">{{ s.app }}</div>
              <div class="text-[13px] font-semibold leading-tight" :class="activeStep === i ? 'text-white' : 'text-white/50'">{{ s.label }}</div>
            </div>
          </div>
        </div>

        <!-- beats column -->
        <div class="relative flex-1 min-w-0 flex flex-col justify-center gap-2.5">
          <!-- 1 · chat message -->
          <div class="thr-card" :style="cardStyle(0)">
            <div class="thr-card-head"><MessageCircle class="w-3 h-3" /> #general · HiveChat</div>
            <div class="flex gap-2.5 px-3.5 pb-3">
              <span class="thr-hex bg-gradient-to-br from-rose-400 to-rose-600">RC</span>
              <div class="min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="text-[12.5px] font-bold text-rose-300">Rachel Cole</span>
                  <span class="text-[9.5px] text-white/30">9:14 AM · client</span>
                </div>
                <div class="text-[13px] text-white/85 leading-snug min-h-[1.3em]">
                  {{ typed }}<span v-if="typingDots" class="thr-caret" />
                </div>
              </div>
            </div>
          </div>

          <!-- 2 · task -->
          <div class="thr-card" :style="cardStyle(1)">
            <div class="thr-card-head"><CheckSquare class="w-3 h-3" /> Board · HiveFlow</div>
            <div class="flex items-center gap-2.5 px-3.5 pb-3">
              <span class="w-5 h-5 rounded-md grid place-items-center bg-[#a85be0]/15 text-[#c79bef] shrink-0"><CheckSquare class="w-3 h-3" /></span>
              <span class="font-mono text-[10px] font-semibold text-white/35">TASK-214</span>
              <span class="flex-1 text-[13px] font-semibold text-white/90 truncate">Chase Henderson proposal</span>
              <span class="thr-hex !w-[18px] !h-[18px] !text-[8px] bg-gradient-to-br from-[#a85be0] to-[#6a4cdd] !text-white">M</span>
              <span class="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-white/8 text-white/55">created from chat</span>
            </div>
          </div>

          <!-- 3 · CRM timeline -->
          <div class="thr-card" :style="cardStyle(2)">
            <div class="thr-card-head"><Handshake class="w-3 h-3" /> Henderson Group · HiveCRM</div>
            <div class="flex gap-2.5 px-3.5 pb-3">
              <span class="w-6 h-6 rounded-lg grid place-items-center shrink-0" style="background: rgba(13,148,136,.18); color:#2dd4bf"><Phone class="w-3 h-3" /></span>
              <div class="min-w-0 flex-1">
                <div class="text-[12.5px] text-white/85 leading-snug">
                  <strong class="font-bold text-white">Maya</strong> logged a call — “revised scope approved, send Thursday”
                </div>
                <div class="text-[9.5px] text-white/35 mt-0.5">just now · Last activity updated automatically</div>
              </div>
            </div>
          </div>

          <!-- 4 · deal won -->
          <div class="thr-card relative overflow-visible" :style="cardStyle(3)">
            <div v-if="wonStage === 2" class="thr-burst" aria-hidden="true" />
            <div class="thr-card-head"><Trophy class="w-3 h-3" /> Pipeline</div>
            <div class="px-3.5 pb-2 flex items-center gap-3">
              <span class="flex-1 text-[13px] font-semibold text-white/90 truncate">Henderson Group — 2 VAs</span>
              <span class="font-mono text-[12px] font-bold text-white/80">$1,600<span class="text-white/35">/mo</span></span>
              <span
                class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold transition-all duration-400"
                :style="{ background: STAGE_CHIPS[wonStage].dot + '26', color: STAGE_CHIPS[wonStage].dot, boxShadow: wonStage === 2 ? '0 0 16px rgba(52,192,107,.45)' : 'none' }"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-current" />{{ STAGE_CHIPS[wonStage].label }}
              </span>
            </div>
            <div class="mx-3.5 mb-3 flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-all duration-500"
              :class="wonStage === 2 ? 'bg-[#a85be0]/10 opacity-100 translate-y-0' : 'opacity-0 translate-y-1'">
              <span class="thr-hex !w-[18px] !h-[18px] !text-[8px] bg-gradient-to-br from-[#a85be0] to-[#6a4cdd] !text-white">🐝</span>
              <span class="text-[11.5px] text-[#d4b3f2]/90 font-medium">🏆 Deal won: Henderson Group — posted to #general by HiveMind</span>
            </div>
          </div>

          <!-- 5 · meeting -->
          <div class="thr-card" :style="cardStyle(4)">
            <div class="thr-card-head"><Video class="w-3 h-3" /> Kickoff · HiveMeet</div>
            <div class="flex items-center gap-2.5 px-3.5 pb-3">
              <span class="relative flex -space-x-1.5">
                <span class="thr-hex bg-gradient-to-br from-[#a85be0] to-[#6a4cdd] !text-white ring-2 ring-[#11141d]">M</span>
                <span class="thr-hex bg-gradient-to-br from-rose-400 to-rose-600 ring-2 ring-[#11141d]" :class="sp(4) > 0.45 ? 'thr-pop' : 'opacity-0'">RC</span>
              </span>
              <span class="text-[12px] text-white/70 truncate">meet/hd-7k2p · guest joined, no account needed</span>
              <span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[12px] font-bold text-emerald-300 tabular-nums">
                <Clock class="w-3 h-3 animate-pulse" /> {{ meetClock }}
              </span>
              <span class="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-white/8 text-white/55 hidden sm:block">→ HiveTrack</span>
            </div>
          </div>
        </div>
      </div>

      <!-- finale -->
      <div
        class="absolute inset-0 z-20 grid place-items-center text-center px-6 pointer-events-none transition-opacity duration-300"
        :style="{ opacity: finale, background: 'radial-gradient(ellipse at center, rgba(11,14,21,0.96) 30%, rgba(11,14,21,0.85))' }"
      >
        <div :style="{ transform: `scale(${0.92 + finale * 0.08})` }" class="transition-transform duration-300">
          <Sparkles class="w-7 h-7 text-[#c79bef] mx-auto mb-4" />
          <p class="font-display text-3xl md:text-5xl tracking-tight text-white leading-[1.1]">
            One hire. One thread.<br />
            <span class="bg-gradient-to-r from-[#c79bef] to-[#a85be0] bg-clip-text text-transparent">Nothing dropped.</span>
          </p>
          <p class="mt-4 text-white/55 max-w-md mx-auto text-sm leading-relaxed">
            Five tools' worth of work, connected end to end — by one VA who never had to leave the hive.
          </p>
          <a
            href="#contact"
            class="inline-flex items-center gap-2 mt-7 text-sm font-semibold bg-gradient-to-r from-[#6a4cdd] to-[#a85be0] text-white px-6 py-3 rounded-md hover:opacity-90 transition-opacity"
            :class="finale > 0.6 ? 'pointer-events-auto' : ''"
          >
            See it live — book a demo
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.thread {
  background: #160f1d;
}
.thr-glow {
  position: absolute;
  width: 760px; height: 560px;
  left: 50%; top: 55%;
  transform: translate(-50%, -50%);
  background: radial-gradient(ellipse, rgba(168, 91, 224, 0.07), transparent 65%);
  filter: blur(60px);
  transition: opacity 0.3s linear;
}

.thr-node-lit {
  box-shadow: 0 0 14px rgba(168, 91, 224, 0.55);
}

.thr-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: linear-gradient(170deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015));
  backdrop-filter: blur(6px);
  will-change: transform, opacity;
}
.thr-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px 7px;
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.32);
}

.thr-hex {
  width: 26px;
  height: 26px;
  flex: none;
  clip-path: url(#thr-hex-clip);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 800;
  color: #fff;
}

.thr-caret {
  display: inline-block;
  width: 7px;
  height: 13px;
  margin-left: 2px;
  background: #b673e8;
  vertical-align: text-bottom;
  animation: thr-blink 0.85s steps(1) infinite;
}
@keyframes thr-blink {
  50% { opacity: 0; }
}

.thr-pop {
  animation: thr-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes thr-pop-in {
  0% { opacity: 0; transform: translateY(-10px) scale(0.3); }
  60% { opacity: 1; transform: translateY(1px) scale(1.12); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* win burst: an expanding golden ring */
.thr-burst {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  border: 1.5px solid rgba(168, 91, 224, 0.8);
  animation: thr-burst 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) both;
  pointer-events: none;
}
@keyframes thr-burst {
  0% { opacity: 0.9; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.12); }
}

@media (prefers-reduced-motion: reduce) {
  .thread { height: auto !important; }
  .thread > div { position: static; height: auto; }
  .thr-caret, .thr-burst { animation: none; }
}
</style>
