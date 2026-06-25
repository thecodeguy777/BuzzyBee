<script setup lang="ts">
// Premium scroll-pinned hero: "watch one request travel the hive."
// A sticky stage stays put while you scroll; the active beat advances,
// crossfading FAITHFUL recreations of the real product (comms, board, task,
// pipeline) as a honeycomb comb fills. Deep-plum stage, DARK "app" surfaces
// rendered in the workstation's real dark palette (base-100/200/300, status
// tokens) and the same rounded flat-top honeycomb avatars the app uses
// (shared clip-path url(#hc-hex-clip) via HexClipDef). Clash Display headlines.
// Static-stack fallback under prefers-reduced-motion. Transform/opacity → 60fps.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MessageSquare, CheckSquare, Users, Handshake, Trophy, Hash, Calendar, ListChecks, Check, UserPlus, ArrowDown } from 'lucide-vue-next'
import HexClipDef from '@/components/shared/HexClipDef.vue'

const BEATS = 6 // 0 = cold open, 1..5 = the journey
const SCROLL_VH = 80
const sectionEl = ref<HTMLElement | null>(null)
const progress = ref(0)
const reduced = ref(false)

const sectionStyle = computed(() => ({
  height: reduced.value ? 'auto' : `calc(100svh + ${(BEATS - 1) * SCROLL_VH}svh)`,
}))

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const active = computed(() => Math.round(progress.value * (BEATS - 1)))
// progress through the cold-open's own scroll share (0..1) — drives chip exit
const coldp = computed(() => clamp(progress.value * (BEATS - 1)))

// ── pointer parallax: the hero reacts to the cursor at rest ──
const mx = ref(0) // -1..1
const my = ref(0)
const cx = ref(0) // px within the stage (cursor light)
const cy = ref(0)
let praf = 0
function onPointer(e: PointerEvent) {
  if (reduced.value || praf) return
  praf = requestAnimationFrame(() => {
    praf = 0
    const el = sectionEl.value
    if (!el) return
    const r = el.getBoundingClientRect()
    cx.value = e.clientX - r.left
    cy.value = e.clientY - r.top
    mx.value = clamp((cx.value / (r.width || 1)) * 2 - 1, -1, 1)
    my.value = clamp((cy.value / (window.innerHeight || 1)) * 2 - 1, -1, 1)
  })
}

const stageStyle = computed(() => ({
  '--mx': String(mx.value),
  '--my': String(my.value),
  '--cx': cx.value + 'px',
  '--cy': cy.value + 'px',
}))
const fieldStyle = computed(() => ({ opacity: String(reduced.value ? 0.5 : 1 - coldp.value * 0.7) }))

// honeycomb field cells — deterministic layout (no Math.random)
const CELLS = (() => {
  const out: { x: number; y: number; d: number }[] = []
  const cols = 8
  const rows = 5
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: (c / (cols - 1)) * 104 - 2 + (r % 2 ? 6 : 0), y: (r / (rows - 1)) * 100, d: ((r * 3 + c) % 7) * 0.45 })
    }
  }
  return out
})()

// floating glass chips: mouse parallax (by depth) + scroll exit (toward corners)
const CHIPS = [
  { depth: 1.0, ex: -54, ey: -34 },
  { depth: 1.7, ex: 54, ey: -30 },
  { depth: 1.3, ex: -48, ey: 36 },
  { depth: 1.9, ex: 52, ey: 34 },
]
function chipStyle(i: number) {
  if (reduced.value) return {}
  const ch = CHIPS[i]
  const px = mx.value * ch.depth * 18 + coldp.value * ch.ex
  const py = my.value * ch.depth * 18 + coldp.value * ch.ey
  return { transform: `translate(${px}px, ${py}px)`, opacity: String(clamp(1 - coldp.value * 1.7)) }
}

let raf = 0
function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const el = sectionEl.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const total = el.offsetHeight - window.innerHeight
    progress.value = total > 0 ? clamp(-rect.top / total) : 0
  })
}

onMounted(() => {
  reduced.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  if (reduced.value) return
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  window.addEventListener('pointermove', onPointer, { passive: true })
  onScroll()
  const el = sectionEl.value
  if (el) { cx.value = el.getBoundingClientRect().width / 2; cy.value = window.innerHeight * 0.4 }
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  window.removeEventListener('pointermove', onPointer)
  if (raf) cancelAnimationFrame(raf)
  if (praf) cancelAnimationFrame(praf)
})

const beatClass = (i: number) => ({
  'is-active': reduced.value || active.value === i,
  'is-past': !reduced.value && active.value > i,
})
</script>

<template>
  <section id="hero" ref="sectionEl" class="hj" :class="{ 'is-reduced': reduced }" :style="sectionStyle">
    <!-- shared rounded-hexagon clip def (same geometry the app uses for avatars) -->
    <HexClipDef />

    <div class="hj-stage" :style="stageStyle">
      <!-- drifting plum aurora -->
      <div class="hj-aurora" aria-hidden="true">
        <span class="hj-blob hj-blob--1" />
        <span class="hj-blob hj-blob--2" />
        <span class="hj-blob hj-blob--3" />
      </div>

      <!-- living honeycomb field + cursor light -->
      <div class="hj-hive" :style="fieldStyle" aria-hidden="true">
        <span v-for="(cell, i) in CELLS" :key="i" class="hj-cell" :style="{ left: cell.x + '%', top: cell.y + '%', animationDelay: cell.d + 's' }" />
      </div>
      <div class="hj-glow" aria-hidden="true" />

      <!-- hive mark (rounded hexagons) -->
      <div class="hj-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" class="hj-hex">
          <defs>
            <linearGradient id="hj-head" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c4dff" /><stop offset="100%" stop-color="#c79bef" />
            </linearGradient>
          </defs>
          <path d="M 35.64 5.10 L 53.48 15.40 Q 57.11 17.50 57.11 21.70 L 57.11 42.30 Q 57.11 46.50 53.48 48.60 L 35.64 58.90 Q 32.00 61.00 28.36 58.90 L 10.52 48.60 Q 6.89 46.50 6.89 42.30 L 6.89 21.70 Q 6.89 17.50 10.52 15.40 L 28.36 5.10 Q 32.00 3.00 35.64 5.10 Z" fill="none" stroke="url(#hj-head)" stroke-width="2.5" stroke-linejoin="round" />
          <path d="M 34.25 17.30 L 43.60 22.70 Q 45.86 24.00 45.86 26.60 L 45.86 37.40 Q 45.86 40.00 43.60 41.30 L 34.25 46.70 Q 32.00 48.00 29.75 46.70 L 20.40 41.30 Q 18.14 40.00 18.14 37.40 L 18.14 26.60 Q 18.14 24.00 20.40 22.70 L 29.75 17.30 Q 32.00 16.00 34.25 17.30 Z" fill="url(#hj-head)" opacity="0.9" />
        </svg>
      </div>

      <!-- ── BEAT 0 — cold open ── -->
      <div class="hj-beat hj-beat--open" :class="beatClass(0)">
        <p class="hj-eyebrow">A screened professional · one platform · zero software tax</p>
        <h1 class="hj-headline">
          <span>Your screened VA</span><span>does the work.</span><span class="hj-accent">You just watch.</span>
        </h1>
        <p class="hj-sub">A trained professional handles every request — from the first message to a closed deal — while you watch each step move through the hive.</p>
        <div class="hj-cue"><span>Scroll</span><ArrowDown class="hj-cue-icon" :size="16" :stroke-width="2" /></div>
      </div>

      <!-- ── BEAT 1 — message (Comms) ── -->
      <div class="hj-beat" :class="beatClass(1)">
        <span class="hj-step">It starts as a message</span>
        <div class="u-frame">
          <div class="u-bar"><i /><i /><i /><span class="u-bar-title"><Hash :size="11" :stroke-width="2.5" /> general</span></div>
          <div class="u-body">
            <div class="u-msg">
              <span class="hx" style="background:#D6409F">MS</span>
              <div class="u-msg-main">
                <div class="u-msg-head"><span class="u-name" style="color:#e879c2">Maria Santos</span><span class="u-time">9:24 AM</span></div>
                <div class="u-text">Can we get the spring-campaign quote out to the client today?</div>
                <span class="u-task-chip"><CheckSquare :size="12" :stroke-width="2" /> Turn into task</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── BEAT 2 — becomes work (Board) ── -->
      <div class="hj-beat" :class="beatClass(2)">
        <span class="hj-step">It becomes tracked work</span>
        <div class="u-frame">
          <div class="u-bar"><i /><i /><i /><span class="u-bar-title"><CheckSquare :size="11" :stroke-width="2.5" /> Tasks · Spring Campaign</span></div>
          <div class="u-body u-board">
            <div class="u-col">
              <div class="u-col-h u-h-todo"><span class="u-d" style="background:#b9b7c0" /> To do <b>2</b></div>
              <div class="u-tcard u-muted"><div class="u-tcard-title">Update pricing sheet</div><div class="u-tcard-meta"><span class="u-ref">TKT-0007</span></div></div>
            </div>
            <div class="u-col">
              <div class="u-col-h u-h-prog"><span class="u-d" style="background:#e3a24a" /> In progress <b>1</b></div>
              <div class="u-tcard u-tcard--hot">
                <div class="u-tcard-title">Draft spring-campaign quote</div>
                <div class="u-tcard-meta">
                  <span class="u-ref">TKT-0001</span>
                  <span class="u-meta-i"><ListChecks :size="11" :stroke-width="2" /> 1/3</span>
                  <span class="u-spacer" />
                  <span class="hx hx--xs" style="background:#8A6B9A">MS</span>
                </div>
              </div>
            </div>
            <div class="u-col">
              <div class="u-col-h u-h-done"><span class="u-d" style="background:#6cc788" /> Done <b>1</b></div>
              <div class="u-tcard u-muted"><div class="u-tcard-title u-strike">Onboard Acme Co</div><div class="u-tcard-meta"><span class="u-ref">TKT-0004</span></div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── BEAT 3 — your VA takes it (Task detail) ── -->
      <div class="hj-beat" :class="beatClass(3)">
        <span class="hj-step">Your VA takes it</span>
        <div class="u-frame">
          <div class="u-bar"><i /><i /><i /><span class="u-bar-title"><CheckSquare :size="11" :stroke-width="2.5" /> Task · TASK-0001</span></div>
          <div class="u-body">
            <div class="u-task-title">Draft spring-campaign quote</div>
            <span class="u-pill"><span class="u-pd" style="background:#e3a24a" /> In progress</span>
            <div class="u-sec">Assignees</div>
            <div class="u-ass">
              <span class="hx-stack"><span class="hx-ring"><span class="hx hx--sm" style="background:#C8741A">MK</span></span><span class="u-done"><Check :size="9" :stroke-width="3.5" /></span></span>
              <span class="hx-stack hx-stack--ov"><span class="hx-ring"><span class="hx hx--sm" style="background:#8A6B9A">MS</span></span></span>
              <span class="u-add-ass"><UserPlus :size="13" :stroke-width="2" /></span>
            </div>
            <div class="u-sec">Subtasks · 1 / 3</div>
            <div class="u-prog"><i /></div>
            <ul class="u-subs">
              <li class="is-done"><span class="u-check"><Check :size="11" :stroke-width="3.5" /></span><span class="u-sub-t">Pull last quarter's numbers</span></li>
              <li class="is-done"><span class="u-check"><Check :size="11" :stroke-width="3.5" /></span><span class="u-sub-t">Draft the line items</span></li>
              <li><span class="u-check" /><span class="u-sub-t">Send for review</span></li>
            </ul>
          </div>
        </div>
      </div>

      <!-- ── BEAT 4 — turns into revenue (Pipeline) ── -->
      <div class="hj-beat" :class="beatClass(4)">
        <span class="hj-step">It turns into revenue</span>
        <div class="u-frame">
          <div class="u-bar"><i /><i /><i /><span class="u-bar-title"><Handshake :size="11" :stroke-width="2.5" /> CRM · Pipeline</span></div>
          <div class="u-body u-board">
            <div class="u-col">
              <div class="u-col-h u-h-nego"><span class="u-d" style="background:#a24fae" /> Negotiation <b>1</b></div>
              <div class="u-dcard">
                <div class="u-dcard-top"><span class="sq" style="background:#3E63DD">GX</span><span class="u-co">Globex</span></div>
                <div class="u-deal-title">Annual contract</div>
                <div class="u-dcard-foot"><b class="u-val">$12,000</b><span class="u-date"><Calendar :size="11" :stroke-width="2" /> Jun 30</span></div>
              </div>
            </div>
            <div class="u-col u-col--won">
              <div class="u-col-h u-h-won"><span class="u-d" style="background:#22a35a" /> Won <b>1</b></div>
              <div class="u-dcard u-dcard--won">
                <div class="u-dcard-top"><span class="sq" style="background:#46A758">AC</span><span class="u-co">Acme Co</span><span class="u-won"><Trophy :size="11" :stroke-width="2" /> Won</span></div>
                <div class="u-deal-title">Full-service retainer</div>
                <div class="u-dcard-foot"><b class="u-val u-val--won">$9,500</b><span class="u-date"><Calendar :size="11" :stroke-width="2" /> Jun 14</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── BEAT 5 — payoff ── -->
      <div class="hj-beat hj-beat--payoff" :class="beatClass(5)">
        <h2 class="hj-headline hj-headline--sm"><span>You saw every step.</span><span class="hj-accent">You managed no one.</span></h2>
        <div class="hj-cta">
          <a href="#contact" class="hj-btn hj-btn--primary">Get started</a>
          <a href="#how" class="hj-btn hj-btn--ghost">See how it works</a>
        </div>
      </div>

      <!-- floating glass chips — mouse parallax + scroll exit -->
      <div class="hj-chips" aria-hidden="true">
        <div class="hj-chip hj-chip--a" :style="chipStyle(0)">
          <div class="hj-chip-in"><span class="hj-chip-hx" style="background:#D6409F">MS</span><span class="hj-chip-msg">Get the spring quote out today?</span></div>
        </div>
        <div class="hj-chip hj-chip--b" :style="chipStyle(1)">
          <div class="hj-chip-in hj-chip-task"><CheckSquare :size="13" :stroke-width="2" /> Turn into task</div>
        </div>
        <div class="hj-chip hj-chip--c" :style="chipStyle(2)">
          <div class="hj-chip-in"><span class="hj-chip-hx" style="background:#8E4EC6">MS</span><span class="hj-chip-name">Maria · VA<span class="hj-on" /></span></div>
        </div>
        <div class="hj-chip hj-chip--d" :style="chipStyle(3)">
          <div class="hj-chip-in hj-chip-won"><Trophy :size="13" :stroke-width="2" /> Deal won · $9,500</div>
        </div>
      </div>

      <!-- ── honeycomb progress comb ── -->
      <div class="hj-comb" aria-hidden="true">
        <span v-for="n in 5" :key="n" class="hj-comb-cell" :class="{ 'is-on': active >= n, 'is-now': active === n }">
          <component :is="[MessageSquare, CheckSquare, Users, Handshake, Trophy][n - 1]" :size="12" :stroke-width="2" />
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hj { position: relative; background: #120a18; color: #f3ecfa; }
.hj-stage { position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden; display: flex; align-items: center; justify-content: center; text-align: center; }

.hj-aurora { position: absolute; inset: 0; pointer-events: none; transform: translate(calc(var(--mx, 0) * -12px), calc(var(--my, 0) * -12px)); transition: transform 0.3s ease-out; }
.hj-blob { position: absolute; border-radius: 9999px; filter: blur(90px); opacity: 0.5; }
.hj-blob--1 { width: 46vw; height: 46vw; left: -8vw; top: -10vw; background: #6a2bd9; animation: hj-drift1 18s ease-in-out infinite; }
.hj-blob--2 { width: 40vw; height: 40vw; right: -6vw; top: 8vw; background: #b25cff; opacity: 0.4; animation: hj-drift2 22s ease-in-out infinite; }
.hj-blob--3 { width: 38vw; height: 38vw; left: 30vw; bottom: -16vw; background: #3a1d6e; animation: hj-drift1 26s ease-in-out infinite reverse; }
@keyframes hj-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4vw,3vw) scale(1.08); } }
@keyframes hj-drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-5vw,2vw) scale(1.1); } }

.hj-mark { position: absolute; top: 6vh; left: 50%; z-index: 2; transform: translateX(-50%) translate(calc(var(--mx, 0) * 16px), calc(var(--my, 0) * 16px)); transition: transform 0.3s ease-out; width: 46px; height: 46px; }
.hj-hex { width: 100%; height: 100%; filter: drop-shadow(0 0 14px rgba(168,91,224,0.55)); animation: hj-pulse 3.4s ease-in-out infinite; }
@keyframes hj-pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }

.hj-beat {
  position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.6rem; padding: 0 1.5rem; opacity: 0; transform: translateY(26px) scale(0.985);
  transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.22,1,0.36,1); pointer-events: none;
}
.hj-beat.is-active { opacity: 1; transform: none; pointer-events: auto; }
.hj-beat.is-past { opacity: 0; transform: translateY(-26px) scale(0.985); }

.hj-eyebrow { font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase; color: #c79bef; font-weight: 600; }
.hj-headline { font-family: 'Clash Display','Hanken Grotesk',system-ui,sans-serif; font-weight: 600; font-size: clamp(2rem,8.5vw,5.4rem); line-height: 0.98; letter-spacing: -0.02em; display: flex; flex-direction: column; }
.hj-headline--sm { font-size: clamp(2rem,5.5vw,4rem); }
.hj-beat--open .hj-headline { text-transform: uppercase; letter-spacing: -0.015em; }
.hj-accent { background: linear-gradient(100deg,#b25cff,#e4c9ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hj-sub { max-width: 34rem; font-size: clamp(1rem,1.6vw,1.2rem); line-height: 1.5; color: rgba(243,236,250,0.72); }
.hj-cue { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(243,236,250,0.5); margin-top: 0.5rem; }
.hj-cue-icon { animation: hj-bob 1.8s ease-in-out infinite; }
@keyframes hj-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
.hj-step { font-family: 'Clash Display','Hanken Grotesk',system-ui,sans-serif; font-weight: 600; font-size: clamp(1.5rem,3.6vw,2.5rem); letter-spacing: -0.01em; }

/* ── faithful "real app" surfaces — the workstation's DARK palette ──
   tokens mirror src/style.css [data-theme="dark"]:
   base-100 #16181d (canvas) · base-200 #1e2127 (surfaces) · base-300 #2b2e36
   (borders) · text #eef0f2 · primary #b266bb · status tokens below.
   People avatars use the app's own rounded flat-top hexagon (url(#hc-hex-clip));
   CRM company avatars are rounded squares, exactly as the app distinguishes them. */
.hj {
  --b100: #16181d; --b200: #1e2127; --b300: #2b2e36; --ink: #eef0f2;
  --pri: #b266bb;
  --hex: url(#hc-hex-clip);
}
.u-frame {
  width: min(34rem, 92vw); text-align: left; color: var(--ink); background: var(--b100);
  border-radius: 14px; overflow: hidden; border: 1px solid var(--b300);
  box-shadow:
    0 40px 90px -30px rgba(0,0,0,0.85),
    0 10px 26px -12px rgba(0,0,0,0.6),
    0 0 0 1px rgba(255,255,255,0.04),
    0 0 64px -16px rgba(168,91,224,0.32);
}
.u-bar { height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 12px; background: var(--b200); border-bottom: 1px solid var(--b300); }
.u-bar i { width: 8px; height: 8px; border-radius: 9999px; background: #3a3e47; }
.u-bar-title { margin-left: 8px; display: inline-flex; align-items: center; gap: 4px; font-size: 0.66rem; font-weight: 600; color: rgba(238,240,242,0.55); }
.u-body { padding: 0.95rem 1.05rem; }

/* people avatar = rounded flat-top honeycomb cell (same shape as the app) */
.hx { width: 34px; height: 34px; flex: none; display: grid; place-items: center; color: #fff; font-size: 0.7rem; font-weight: 700;
  clip-path: var(--hex); -webkit-clip-path: var(--hex); }
.hx--sm { width: 26px; height: 26px; font-size: 0.58rem; }
.hx--xs { width: 18px; height: 18px; font-size: 0.44rem; }
/* CRM company/owner avatar = rounded square tile (the app's deliberate contrast) */
.sq { width: 22px; height: 22px; flex: none; display: grid; place-items: center; color: #fff; font-size: 0.56rem; font-weight: 700; border-radius: 6px; }

/* comms — Slack-style flat rows, no bubble */
.u-msg { display: flex; gap: 0.7rem; }
.u-msg-main { min-width: 0; }
.u-msg-head { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.2rem; }
.u-name { font-size: 0.82rem; font-weight: 700; }
.u-time { font-weight: 400; font-size: 0.7rem; color: rgba(238,240,242,0.4); }
.u-text { font-size: 0.88rem; line-height: 1.46; color: rgba(238,240,242,0.9); }
.u-task-chip { display: inline-flex; align-items: center; gap: 4px; margin-top: 0.55rem; padding: 0.2rem 0.55rem; border-radius: 9999px; font-size: 0.68rem; font-weight: 600; color: #d59bdb; background: rgba(178,102,187,0.13); border: 1px solid rgba(178,102,187,0.3); }

/* board / pipeline columns */
.u-board { display: flex; gap: 0.55rem; }
.u-col { flex: 1; min-width: 0; background: var(--b200); border: 1px solid var(--b300); border-radius: 12px; padding: 0.45rem; }
.u-col-h { display: flex; align-items: center; gap: 5px; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(238,240,242,0.7); margin: -0.45rem -0.45rem 0.45rem; padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--b300); border-radius: 12px 12px 0 0; }
.u-col-h b { margin-left: auto; color: rgba(238,240,242,0.45); }
.u-h-todo { background: rgba(255,255,255,0.04); }
.u-h-prog { background: rgba(227,162,74,0.13); }
.u-h-done { background: rgba(108,199,136,0.13); }
.u-h-nego { background: rgba(178,102,187,0.14); }
.u-h-won { background: rgba(34,163,90,0.15); }
.u-d { width: 7px; height: 7px; border-radius: 9999px; flex: none; }
.u-tcard, .u-dcard { background: var(--b100); border: 1px solid var(--b300); border-radius: 8px; padding: 0.5rem 0.55rem; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
.u-dcard { border-radius: 11px; }
.u-tcard + .u-tcard, .u-dcard + .u-dcard { margin-top: 0.4rem; }
.u-tcard-title { font-size: 0.76rem; font-weight: 600; line-height: 1.3; color: var(--ink); }
.u-tcard-title.u-strike { text-decoration: line-through; }
.u-muted .u-tcard-title { color: rgba(238,240,242,0.5); font-weight: 500; }
.u-tcard-meta { display: flex; align-items: center; gap: 6px; margin-top: 0.45rem; font-size: 0.6rem; color: rgba(238,240,242,0.45); }
.u-ref { font-family: 'Geist Mono','JetBrains Mono',ui-monospace,monospace; font-size: 0.58rem; letter-spacing: 0.02em; }
.u-meta-i { display: inline-flex; align-items: center; gap: 3px; }
.u-spacer { flex: 1; }
.u-tcard--hot { border-color: rgba(178,102,187,0.5); box-shadow: 0 6px 18px -8px rgba(178,102,187,0.4); }

/* deal cards */
.u-dcard-top { display: flex; align-items: center; gap: 0.4rem; }
.u-co { font-size: 0.64rem; font-weight: 700; color: rgba(238,240,242,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.u-deal-title { font-size: 0.8rem; font-weight: 600; color: var(--ink); margin-top: 0.4rem; line-height: 1.3; }
.u-dcard-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.45rem; }
.u-val { font-size: 0.86rem; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); }
.u-val--won { color: #6cc788; }
.u-date { display: inline-flex; align-items: center; gap: 3px; font-size: 0.6rem; color: rgba(238,240,242,0.4); }
.u-won { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; padding: 0.1rem 0.4rem; border-radius: 9999px; font-size: 0.58rem; font-weight: 700; color: #6cc788; background: rgba(34,163,90,0.16); }
.u-dcard--won { border-color: rgba(34,163,90,0.35); }

/* task detail */
.u-task-title { font-family: 'Hanken Grotesk','Inter',system-ui,sans-serif; font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; color: var(--ink); }
.u-pill { display: inline-flex; align-items: center; gap: 5px; margin-top: 0.5rem; padding: 0.18rem 0.55rem; border-radius: 6px; font-size: 0.66rem; font-weight: 600; color: #e3a24a; background: rgba(227,162,74,0.15); }
.u-pd { width: 6px; height: 6px; border-radius: 9999px; flex: none; }
.u-sec { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(238,240,242,0.55); margin: 0.9rem 0 0.45rem; }
.u-ass { display: flex; align-items: center; }
.hx-stack { position: relative; line-height: 0; }
.hx-stack--ov { margin-left: -7px; }
.hx-ring { width: 30px; height: 30px; display: grid; place-items: center; background: var(--b100); clip-path: var(--hex); -webkit-clip-path: var(--hex); }
.u-done { position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; border-radius: 9999px; background: #15803d; border: 2px solid var(--b100); color: #fff; display: grid; place-items: center; }
.u-add-ass { width: 26px; height: 26px; margin-left: 6px; border-radius: 9999px; border: 1px dashed rgba(178,102,187,0.45); color: var(--pri); display: grid; place-items: center; }
.u-prog { height: 6px; border-radius: 9999px; background: rgba(43,46,54,0.7); overflow: hidden; margin-bottom: 0.55rem; }
.u-prog > i { display: block; height: 100%; width: 33%; background: #15803d; border-radius: 9999px; }
.u-subs { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.82rem; }
.u-subs li { display: flex; align-items: center; gap: 0.55rem; color: rgba(238,240,242,0.9); }
.u-check { width: 16px; height: 16px; flex: none; border-radius: 9999px; border: 1.5px solid rgba(238,240,242,0.3); display: grid; place-items: center; }
.is-done .u-check { background: #15803d; border-color: #15803d; color: #fff; }
.u-sub-t { line-height: 1.3; }
.is-done .u-sub-t { color: rgba(238,240,242,0.4); text-decoration: line-through; }

/* payoff */
.hj-cta { display: flex; gap: 0.8rem; flex-wrap: wrap; justify-content: center; }
.hj-btn { padding: 0.7rem 1.4rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.95rem; transition: all 0.15s; }
.hj-btn--primary { background: linear-gradient(135deg,#a85be0,#7c3fd1); color: #fff; box-shadow: 0 10px 30px -10px rgba(168,91,224,0.8); }
.hj-btn--primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
.hj-btn--ghost { color: #e4c9ff; border: 1px solid rgba(199,155,239,0.4); }
.hj-btn--ghost:hover { background: rgba(168,91,224,0.12); }

/* comb */
.hj-comb { position: absolute; bottom: 5vh; left: 50%; z-index: 4; transform: translateX(-50%); display: flex; gap: 0.55rem; }

/* ── living honeycomb field + cursor light ── */
.hj-hive { position: absolute; inset: -6%; z-index: 1; pointer-events: none; transform: translate(calc(var(--mx, 0) * 10px), calc(var(--my, 0) * 10px)); transition: transform 0.3s ease-out, opacity 0.2s linear; }
.hj-cell { position: absolute; width: 56px; height: 56px; margin: -28px 0 0 -28px; clip-path: url(#hc-hex-clip); -webkit-clip-path: url(#hc-hex-clip); background: rgba(199,155,239,0.06); animation: hj-cellfloat 7s ease-in-out infinite; }
@keyframes hj-cellfloat { 0%, 100% { opacity: 0.45; transform: translateY(0); } 50% { opacity: 0.9; transform: translateY(-4px); } }
.hj-glow { position: absolute; inset: 0; z-index: 1; pointer-events: none; mix-blend-mode: plus-lighter; background: radial-gradient(circle 240px at var(--cx, 50%) var(--cy, 50%), rgba(168,91,224,0.30), rgba(168,91,224,0) 65%); }

/* ── floating glass chips ── */
.hj-chips { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.hj-chip { position: absolute; will-change: transform, opacity; }
.hj-chip--a { left: 8%; top: 33%; }
.hj-chip--b { right: 10%; top: 28%; }
.hj-chip--c { left: 12%; bottom: 27%; }
.hj-chip--d { right: 9%; bottom: 25%; }
.hj-chip-in { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 14px; background: rgba(26,18,36,0.5); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border: 1px solid rgba(199,155,239,0.2); box-shadow: 0 18px 44px -18px rgba(0,0,0,0.7); font-size: 0.8rem; color: #f3ecfa; white-space: nowrap; animation: hj-float 6s ease-in-out infinite; }
.hj-chip--b .hj-chip-in { animation-delay: -1.5s; }
.hj-chip--c .hj-chip-in { animation-delay: -3s; }
.hj-chip--d .hj-chip-in { animation-delay: -4.2s; }
@keyframes hj-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
.hj-chip-hx { width: 24px; height: 24px; flex: none; display: grid; place-items: center; color: #fff; font-size: 0.56rem; font-weight: 700; clip-path: url(#hc-hex-clip); -webkit-clip-path: url(#hc-hex-clip); }
.hj-chip-msg { color: rgba(243,236,250,0.9); }
.hj-chip-name { font-weight: 600; display: inline-flex; align-items: center; }
.hj-on { display: inline-block; width: 7px; height: 7px; border-radius: 9999px; background: #6cc788; margin-left: 6px; }
.hj-chip-task { color: #d59bdb; background: rgba(178,102,187,0.18); border-color: rgba(178,102,187,0.45); font-weight: 600; }
.hj-chip-won { color: #6cc788; background: rgba(34,163,90,0.16); border-color: rgba(34,163,90,0.4); font-weight: 600; }
.hj-comb-cell { width: 32px; height: 32px; display: grid; place-items: center; clip-path: var(--hex); -webkit-clip-path: var(--hex); background: rgba(255,255,255,0.06); color: rgba(243,236,250,0.35); transition: all 0.4s ease; }
.hj-comb-cell.is-on { background: rgba(168,91,224,0.3); color: #e4c9ff; }
.hj-comb-cell.is-now { background: linear-gradient(135deg,#a85be0,#7c3fd1); color: #fff; transform: scale(1.12); box-shadow: 0 0 18px rgba(168,91,224,0.6); }

/* reduced motion: clean static stack */
.hj.is-reduced { height: auto !important; }
.hj.is-reduced .hj-stage { position: static; height: auto; display: block; padding: 7rem 1.5rem 4rem; }
.hj.is-reduced .hj-beat { position: static; inset: auto; opacity: 1; transform: none; pointer-events: auto; margin: 0 auto 3.5rem; max-width: 38rem; }
.hj.is-reduced .hj-cue, .hj.is-reduced .hj-comb { display: none; }
.hj.is-reduced .hj-hive, .hj.is-reduced .hj-glow, .hj.is-reduced .hj-chips { display: none; }
.hj.is-reduced .hj-aurora { position: fixed; }
@media (max-width: 480px) {
  .hj-chips { display: none; } /* decorative chips clip/clutter at phone width */
  .hj-beat { gap: 1.1rem; }
}
@media (prefers-reduced-motion: reduce) { .hj-blob, .hj-hex, .hj-cue-icon, .hj-cell, .hj-chip-in { animation: none; } }
</style>
