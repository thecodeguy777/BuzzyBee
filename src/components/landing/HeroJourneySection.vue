<script setup lang="ts">
// Premium scroll-pinned hero: "watch one request travel the hive."
// A sticky stage stays put while you scroll; the active "beat" advances,
// crossfading bespoke glass cards as a honeycomb comb fills. Deep-plum + glass,
// Clash Display headlines. Falls back to a clean static stack when the user
// prefers reduced motion. Transform/opacity only → 60fps.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MessageSquare, CheckSquare, Sparkles, Trophy, ArrowDown } from 'lucide-vue-next'

const BEATS = 6 // 0 = cold open, 1..5 = the journey
const SCROLL_VH = 80 // scroll distance per beat
const sectionEl = ref<HTMLElement | null>(null)
const active = ref(0)
const reduced = ref(false)

const sectionStyle = computed(() => ({
  height: reduced.value ? 'auto' : `calc(100vh + ${(BEATS - 1) * SCROLL_VH}vh)`,
}))

let raf = 0
function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const el = sectionEl.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const total = el.offsetHeight - window.innerHeight
    const p = total > 0 ? Math.min(Math.max(-rect.top / total, 0), 1) : 0
    active.value = Math.round(p * (BEATS - 1))
  })
}

onMounted(() => {
  reduced.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (reduced.value) return
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  onScroll()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (raf) cancelAnimationFrame(raf)
})

// State helpers for a beat layer
const beatClass = (i: number) => ({
  'is-active': reduced.value || active.value === i,
  'is-past': !reduced.value && active.value > i,
})
</script>

<template>
  <section
    id="hero"
    ref="sectionEl"
    class="hj"
    :class="{ 'is-reduced': reduced }"
    :style="sectionStyle"
  >
    <div class="hj-stage">
      <!-- drifting plum aurora -->
      <div class="hj-aurora" aria-hidden="true">
        <span class="hj-blob hj-blob--1" />
        <span class="hj-blob hj-blob--2" />
        <span class="hj-blob hj-blob--3" />
      </div>

      <!-- hive mark, gently glowing -->
      <div class="hj-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" class="hj-hex">
          <defs>
            <linearGradient id="hj-head" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c4dff" />
              <stop offset="100%" stop-color="#c79bef" />
            </linearGradient>
          </defs>
          <polygon points="32,3 58,18 58,46 32,61 6,46 6,18" fill="none" stroke="url(#hj-head)" stroke-width="2.5" />
          <polygon points="32,16 45,24 45,40 32,48 19,40 19,24" fill="url(#hj-head)" opacity="0.9" />
        </svg>
      </div>

      <!-- ── BEAT 0 — cold open ── -->
      <div class="hj-beat hj-beat--open" :class="beatClass(0)">
        <p class="hj-eyebrow">Vetted VAs · one platform · zero software tax</p>
        <h1 class="hj-headline">
          <span>Don't manage</span>
          <span>the work.</span>
          <span class="hj-accent">Watch it happen.</span>
        </h1>
        <p class="hj-sub">One request — from a message to a closed deal — handled end to end while you simply watch it move.</p>
        <div class="hj-cue">
          <span>Scroll</span><ArrowDown class="hj-cue-icon" :size="16" :stroke-width="2" />
        </div>
      </div>

      <!-- ── BEAT 1 — message ── -->
      <div class="hj-beat" :class="beatClass(1)">
        <span class="hj-step">It starts as a message</span>
        <div class="hj-card hj-card--chat">
          <div class="hj-chat-row">
            <span class="hj-avatar" style="background:#a85be0">MS</span>
            <div>
              <div class="hj-chat-name">Maria Santos <span class="hj-chat-time">9:24</span></div>
              <div class="hj-bubble">Can we get the spring-campaign quote out to the client today?</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── BEAT 2 — becomes work ── -->
      <div class="hj-beat" :class="beatClass(2)">
        <span class="hj-step">It becomes tracked work</span>
        <div class="hj-card hj-card--task">
          <div class="hj-task-top">
            <span class="hj-dot" style="background:#a85be0" />
            <span class="hj-task-title">Draft spring-campaign quote</span>
          </div>
          <div class="hj-pill">In progress</div>
        </div>
      </div>

      <!-- ── BEAT 3 — owned + worked ── -->
      <div class="hj-beat" :class="beatClass(3)">
        <span class="hj-step">Someone owns it</span>
        <div class="hj-card hj-card--task">
          <div class="hj-task-top">
            <span class="hj-avatar hj-avatar--sm" style="background:#4f9cf9">MK</span>
            <span class="hj-task-title">Draft spring-campaign quote</span>
          </div>
          <ul class="hj-subs">
            <li class="is-done"><CheckSquare :size="13" :stroke-width="2.5" /> Pull last quarter's numbers</li>
            <li class="is-done"><CheckSquare :size="13" :stroke-width="2.5" /> Draft the line items</li>
            <li><span class="hj-checkbox" /> Send for review</li>
          </ul>
        </div>
      </div>

      <!-- ── BEAT 4 — closes the loop ── -->
      <div class="hj-beat" :class="beatClass(4)">
        <span class="hj-step">It turns into revenue</span>
        <div class="hj-card hj-card--deal">
          <div class="hj-deal-row">
            <span class="hj-deal-co">Acme Co — full-service</span>
            <span class="hj-deal-val">$9,500</span>
          </div>
          <div class="hj-won"><Trophy :size="14" :stroke-width="2" /> Deal won</div>
        </div>
      </div>

      <!-- ── BEAT 5 — payoff ── -->
      <div class="hj-beat hj-beat--payoff" :class="beatClass(5)">
        <h2 class="hj-headline hj-headline--sm">
          <span>You saw every step.</span>
          <span class="hj-accent">You managed no one.</span>
        </h2>
        <div class="hj-cta">
          <a href="#contact" class="hj-btn hj-btn--primary">Get started</a>
          <a href="#how" class="hj-btn hj-btn--ghost">See how it works</a>
        </div>
      </div>

      <!-- ── honeycomb progress comb ── -->
      <div class="hj-comb" aria-hidden="true">
        <span
          v-for="n in 5"
          :key="n"
          class="hj-comb-cell"
          :class="{ 'is-on': active >= n, 'is-now': active === n }"
        >
          <component
            :is="[MessageSquare, CheckSquare, Sparkles, Trophy, Sparkles][n - 1]"
            :size="13"
            :stroke-width="2"
          />
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hj {
  position: relative;
  background: #120a18;
  color: #f3ecfa;
}
.hj-stage {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

/* aurora */
.hj-aurora { position: absolute; inset: 0; pointer-events: none; }
.hj-blob {
  position: absolute;
  border-radius: 9999px;
  filter: blur(90px);
  opacity: 0.5;
}
.hj-blob--1 { width: 46vw; height: 46vw; left: -8vw; top: -10vw; background: #6a2bd9; animation: hj-drift1 18s ease-in-out infinite; }
.hj-blob--2 { width: 40vw; height: 40vw; right: -6vw; top: 8vw; background: #b25cff; opacity: 0.4; animation: hj-drift2 22s ease-in-out infinite; }
.hj-blob--3 { width: 38vw; height: 38vw; left: 30vw; bottom: -16vw; background: #3a1d6e; animation: hj-drift1 26s ease-in-out infinite reverse; }
@keyframes hj-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4vw,3vw) scale(1.08); } }
@keyframes hj-drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-5vw,2vw) scale(1.1); } }

/* hive mark */
.hj-mark { position: absolute; top: 6vh; left: 50%; transform: translateX(-50%); width: 46px; height: 46px; }
.hj-hex { width: 100%; height: 100%; filter: drop-shadow(0 0 14px rgba(168, 91, 224, 0.55)); animation: hj-pulse 3.4s ease-in-out infinite; }
@keyframes hj-pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }

/* beats — crossfade layers */
.hj-beat {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 0 1.5rem;
  opacity: 0;
  transform: translateY(26px) scale(0.985);
  transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.hj-beat.is-active { opacity: 1; transform: none; pointer-events: auto; }
.hj-beat.is-past { opacity: 0; transform: translateY(-26px) scale(0.985); }

.hj-eyebrow {
  font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase;
  color: #c79bef; font-weight: 600;
}
.hj-headline {
  font-family: 'Clash Display', 'Hanken Grotesk', system-ui, sans-serif;
  font-weight: 600;
  font-size: clamp(2.6rem, 7vw, 5.4rem);
  line-height: 0.98;
  letter-spacing: -0.02em;
  display: flex;
  flex-direction: column;
}
.hj-headline--sm { font-size: clamp(2rem, 5.5vw, 4rem); }
.hj-beat--open .hj-headline { text-transform: uppercase; letter-spacing: -0.015em; }
.hj-accent {
  background: linear-gradient(100deg, #b25cff, #e4c9ff);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hj-sub {
  max-width: 34rem; font-size: clamp(1rem, 1.6vw, 1.2rem);
  line-height: 1.5; color: rgba(243, 236, 250, 0.72);
}
.hj-cue {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(243, 236, 250, 0.5); margin-top: 0.5rem;
}
.hj-cue-icon { animation: hj-bob 1.8s ease-in-out infinite; }
@keyframes hj-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }

.hj-step {
  font-family: 'Clash Display', 'Hanken Grotesk', system-ui, sans-serif;
  font-weight: 600; font-size: clamp(1.6rem, 4vw, 2.8rem); letter-spacing: -0.01em;
}

/* glass cards */
.hj-card {
  width: min(28rem, 90vw);
  text-align: left;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(199, 155, 239, 0.28);
  border-radius: 1rem;
  padding: 1.1rem 1.2rem;
  backdrop-filter: blur(14px);
  box-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255,255,255,0.08);
}
.hj-avatar {
  width: 34px; height: 34px; border-radius: 9999px; flex: none;
  display: grid; place-items: center; color: #fff; font-size: 0.72rem; font-weight: 700;
}
.hj-avatar--sm { width: 26px; height: 26px; font-size: 0.62rem; }
.hj-chat-row { display: flex; gap: 0.7rem; }
.hj-chat-name { font-size: 0.8rem; font-weight: 700; margin-bottom: 0.25rem; }
.hj-chat-time { font-weight: 400; color: rgba(243,236,250,0.4); margin-left: 0.4rem; }
.hj-bubble { background: rgba(255,255,255,0.07); border-radius: 0.75rem; padding: 0.55rem 0.8rem; font-size: 0.92rem; line-height: 1.4; }
.hj-task-top { display: flex; align-items: center; gap: 0.55rem; }
.hj-dot { width: 9px; height: 9px; border-radius: 9999px; flex: none; }
.hj-task-title { font-weight: 600; font-size: 0.98rem; }
.hj-pill {
  display: inline-flex; margin-top: 0.7rem; padding: 0.2rem 0.6rem; border-radius: 9999px;
  font-size: 0.72rem; font-weight: 700; background: rgba(168,91,224,0.18); color: #d4b3f2;
}
.hj-subs { margin-top: 0.7rem; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.88rem; }
.hj-subs li { display: flex; align-items: center; gap: 0.5rem; color: rgba(243,236,250,0.85); }
.hj-subs li.is-done { color: rgba(243,236,250,0.45); text-decoration: line-through; }
.hj-subs li.is-done svg { color: #22c55e; }
.hj-checkbox { width: 13px; height: 13px; border-radius: 3px; border: 1.5px solid rgba(243,236,250,0.4); display: inline-block; }
.hj-deal-row { display: flex; align-items: center; justify-content: space-between; }
.hj-deal-co { font-weight: 600; }
.hj-deal-val { font-weight: 700; color: #d4b3f2; }
.hj-won {
  margin-top: 0.7rem; display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.25rem 0.65rem; border-radius: 9999px; font-size: 0.78rem; font-weight: 700;
  background: linear-gradient(100deg, rgba(234,179,8,0.2), rgba(234,179,8,0.08));
  color: #facc15; border: 1px solid rgba(234,179,8,0.35);
  box-shadow: 0 0 20px rgba(234,179,8,0.25);
}

/* payoff CTA */
.hj-cta { display: flex; gap: 0.8rem; flex-wrap: wrap; justify-content: center; }
.hj-btn { padding: 0.7rem 1.4rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.95rem; transition: all 0.15s; }
.hj-btn--primary { background: linear-gradient(135deg, #a85be0, #7c3fd1); color: #fff; box-shadow: 0 10px 30px -10px rgba(168,91,224,0.8); }
.hj-btn--primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
.hj-btn--ghost { color: #e4c9ff; border: 1px solid rgba(199,155,239,0.4); }
.hj-btn--ghost:hover { background: rgba(168,91,224,0.12); }

/* honeycomb progress comb */
.hj-comb {
  position: absolute; bottom: 5vh; left: 50%; transform: translateX(-50%);
  display: flex; gap: 0.55rem;
}
.hj-comb-cell {
  width: 30px; height: 34px; display: grid; place-items: center;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: rgba(255,255,255,0.06); color: rgba(243,236,250,0.35);
  transition: all 0.4s ease;
}
.hj-comb-cell.is-on { background: rgba(168,91,224,0.3); color: #e4c9ff; }
.hj-comb-cell.is-now {
  background: linear-gradient(135deg, #a85be0, #7c3fd1); color: #fff;
  transform: scale(1.12); box-shadow: 0 0 18px rgba(168,91,224,0.6);
}

/* ── reduced motion: clean static stack, no pinning ── */
.hj.is-reduced { height: auto !important; }
.hj.is-reduced .hj-stage { position: static; height: auto; display: block; padding: 7rem 1.5rem 4rem; }
.hj.is-reduced .hj-beat {
  position: static; inset: auto; opacity: 1; transform: none; pointer-events: auto;
  margin: 0 auto 3.5rem; max-width: 38rem;
}
.hj.is-reduced .hj-cue, .hj.is-reduced .hj-comb { display: none; }
.hj.is-reduced .hj-aurora { position: fixed; }
@media (prefers-reduced-motion: reduce) {
  .hj-blob, .hj-hex, .hj-cue-icon { animation: none; }
}
</style>
