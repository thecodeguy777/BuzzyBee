<script setup lang="ts">
// Premium scroll-pinned hero: "watch one request travel the hive."
// A sticky stage stays put while you scroll; the active beat advances,
// crossfading FAITHFUL recreations of the real product (comms, board, task,
// pipeline) as a honeycomb comb fills. Deep-plum stage, light "app" surfaces
// floating like product shots. Clash Display headlines. Static-stack fallback
// under prefers-reduced-motion. Transform/opacity only → 60fps.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MessageSquare, CheckSquare, Handshake, Trophy, Hash, MessageSquarePlus, Maximize2, ArrowDown } from 'lucide-vue-next'

const BEATS = 6 // 0 = cold open, 1..5 = the journey
const SCROLL_VH = 80
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

const beatClass = (i: number) => ({
  'is-active': reduced.value || active.value === i,
  'is-past': !reduced.value && active.value > i,
})
</script>

<template>
  <section id="hero" ref="sectionEl" class="hj" :class="{ 'is-reduced': reduced }" :style="sectionStyle">
    <div class="hj-stage">
      <!-- drifting plum aurora -->
      <div class="hj-aurora" aria-hidden="true">
        <span class="hj-blob hj-blob--1" />
        <span class="hj-blob hj-blob--2" />
        <span class="hj-blob hj-blob--3" />
      </div>

      <!-- hive mark -->
      <div class="hj-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" class="hj-hex">
          <defs>
            <linearGradient id="hj-head" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c4dff" /><stop offset="100%" stop-color="#c79bef" />
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
          <span>Don't manage</span><span>the work.</span><span class="hj-accent">Watch it happen.</span>
        </h1>
        <p class="hj-sub">One request — from a message to a closed deal — handled end to end while you simply watch it move.</p>
        <div class="hj-cue"><span>Scroll</span><ArrowDown class="hj-cue-icon" :size="16" :stroke-width="2" /></div>
      </div>

      <!-- ── BEAT 1 — message (Comms) ── -->
      <div class="hj-beat" :class="beatClass(1)">
        <span class="hj-step">It starts as a message</span>
        <div class="u-frame">
          <div class="u-bar"><i /><i /><i /><span class="u-bar-title"><Hash :size="11" :stroke-width="2.5" /> general</span></div>
          <div class="u-body">
            <div class="u-msg">
              <span class="hx" style="background:#a85be0">MS</span>
              <div>
                <div class="u-msg-head">Maria Santos <span class="u-time">9:24 AM</span></div>
                <div class="u-bubble">Can we get the spring-campaign quote out to the client today?</div>
                <span class="u-task-chip"><MessageSquarePlus :size="12" :stroke-width="2" /> Turn into task</span>
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
              <div class="u-col-h"><span class="u-d" style="background:#9aa3b2" /> To do <b>2</b></div>
              <div class="u-tcard u-muted">Update pricing sheet</div>
            </div>
            <div class="u-col">
              <div class="u-col-h"><span class="u-d" style="background:#2f6fed" /> In progress <b>1</b></div>
              <div class="u-tcard u-tcard--hot">
                Draft spring-campaign quote
                <span class="u-mini-pill">In progress</span>
              </div>
            </div>
            <div class="u-col">
              <div class="u-col-h"><span class="u-d" style="background:#15803d" /> Done <b>1</b></div>
              <div class="u-tcard u-muted">Onboard Acme Co</div>
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
            <span class="u-pill">In progress</span>
            <div class="u-sec">Assignees</div>
            <div class="u-ass"><span class="hx hx--sm" style="background:#4f9cf9">MK</span><span class="hx hx--sm" style="background:#a85be0">MS</span></div>
            <div class="u-sec">Subtasks · 1 / 3</div>
            <ul class="u-subs">
              <li class="is-done"><CheckSquare :size="14" :stroke-width="2.5" /> Pull last quarter's numbers</li>
              <li class="is-done"><CheckSquare :size="14" :stroke-width="2.5" /> Draft the line items</li>
              <li><span class="u-box" /> Send for review</li>
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
              <div class="u-col-h"><span class="u-d" style="background:#7b2d86" /> Negotiation <b>1</b></div>
              <div class="u-dcard u-muted"><span>Globex — annual</span><b>$12,000</b></div>
            </div>
            <div class="u-col u-col--won">
              <div class="u-col-h"><span class="u-d" style="background:#15803d" /> Won <b>1</b></div>
              <div class="u-dcard u-dcard--won">
                <div><span>Acme Co — full-service</span><b>$9,500</b></div>
                <span class="u-won"><Trophy :size="12" :stroke-width="2" /> Deal won</span>
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

      <!-- ── honeycomb progress comb ── -->
      <div class="hj-comb" aria-hidden="true">
        <span v-for="n in 5" :key="n" class="hj-comb-cell" :class="{ 'is-on': active >= n, 'is-now': active === n }">
          <component :is="[MessageSquare, CheckSquare, CheckSquare, Trophy, Maximize2][n - 1]" :size="13" :stroke-width="2" />
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hj { position: relative; background: #120a18; color: #f3ecfa; }
.hj-stage { position: sticky; top: 0; height: 100vh; overflow: hidden; display: flex; align-items: center; justify-content: center; text-align: center; }

.hj-aurora { position: absolute; inset: 0; pointer-events: none; }
.hj-blob { position: absolute; border-radius: 9999px; filter: blur(90px); opacity: 0.5; }
.hj-blob--1 { width: 46vw; height: 46vw; left: -8vw; top: -10vw; background: #6a2bd9; animation: hj-drift1 18s ease-in-out infinite; }
.hj-blob--2 { width: 40vw; height: 40vw; right: -6vw; top: 8vw; background: #b25cff; opacity: 0.4; animation: hj-drift2 22s ease-in-out infinite; }
.hj-blob--3 { width: 38vw; height: 38vw; left: 30vw; bottom: -16vw; background: #3a1d6e; animation: hj-drift1 26s ease-in-out infinite reverse; }
@keyframes hj-drift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4vw,3vw) scale(1.08); } }
@keyframes hj-drift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-5vw,2vw) scale(1.1); } }

.hj-mark { position: absolute; top: 6vh; left: 50%; transform: translateX(-50%); width: 46px; height: 46px; }
.hj-hex { width: 100%; height: 100%; filter: drop-shadow(0 0 14px rgba(168,91,224,0.55)); animation: hj-pulse 3.4s ease-in-out infinite; }
@keyframes hj-pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }

.hj-beat {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.6rem; padding: 0 1.5rem; opacity: 0; transform: translateY(26px) scale(0.985);
  transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.22,1,0.36,1); pointer-events: none;
}
.hj-beat.is-active { opacity: 1; transform: none; pointer-events: auto; }
.hj-beat.is-past { opacity: 0; transform: translateY(-26px) scale(0.985); }

.hj-eyebrow { font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase; color: #c79bef; font-weight: 600; }
.hj-headline { font-family: 'Clash Display','Hanken Grotesk',system-ui,sans-serif; font-weight: 600; font-size: clamp(2.6rem,7vw,5.4rem); line-height: 0.98; letter-spacing: -0.02em; display: flex; flex-direction: column; }
.hj-headline--sm { font-size: clamp(2rem,5.5vw,4rem); }
.hj-beat--open .hj-headline { text-transform: uppercase; letter-spacing: -0.015em; }
.hj-accent { background: linear-gradient(100deg,#b25cff,#e4c9ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hj-sub { max-width: 34rem; font-size: clamp(1rem,1.6vw,1.2rem); line-height: 1.5; color: rgba(243,236,250,0.72); }
.hj-cue { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(243,236,250,0.5); margin-top: 0.5rem; }
.hj-cue-icon { animation: hj-bob 1.8s ease-in-out infinite; }
@keyframes hj-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(4px); } }
.hj-step { font-family: 'Clash Display','Hanken Grotesk',system-ui,sans-serif; font-weight: 600; font-size: clamp(1.5rem,3.6vw,2.5rem); letter-spacing: -0.01em; }

/* ── faithful "real app" surfaces (light, floating like product shots) ── */
.u-frame {
  width: min(34rem, 92vw); text-align: left; color: #1a1722; background: #fbfbfd;
  border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 36px 80px -28px rgba(0,0,0,0.75), 0 6px 20px -8px rgba(0,0,0,0.45);
}
.u-bar { height: 30px; display: flex; align-items: center; gap: 6px; padding: 0 12px; background: #eef0f3; border-bottom: 1px solid #e2e5ea; }
.u-bar i { width: 8px; height: 8px; border-radius: 9999px; background: #cfd4db; }
.u-bar i:nth-child(1) { background: #f0a5a0; } .u-bar i:nth-child(2) { background: #f4cf8a; } .u-bar i:nth-child(3) { background: #a8d8a0; }
.u-bar-title { margin-left: 8px; display: inline-flex; align-items: center; gap: 4px; font-size: 0.66rem; font-weight: 600; color: #8a8794; }
.u-body { padding: 0.95rem 1.05rem; }

.hx { width: 34px; height: 34px; flex: none; display: grid; place-items: center; color: #fff; font-size: 0.7rem; font-weight: 700;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); }
.hx--sm { width: 26px; height: 26px; font-size: 0.6rem; }

/* comms */
.u-msg { display: flex; gap: 0.7rem; }
.u-msg-head { font-size: 0.82rem; font-weight: 700; margin-bottom: 0.25rem; }
.u-time { font-weight: 400; color: #a4a1ad; margin-left: 0.4rem; }
.u-bubble { font-size: 0.9rem; line-height: 1.45; color: #2c2935; }
.u-task-chip { display: inline-flex; align-items: center; gap: 4px; margin-top: 0.5rem; padding: 0.18rem 0.5rem; border-radius: 9999px; font-size: 0.68rem; font-weight: 600; color: #611f69; background: #f3e9f5; border: 1px solid #e7d4ec; }

/* board / pipeline columns */
.u-board { display: flex; gap: 0.55rem; }
.u-col { flex: 1; min-width: 0; background: #f3f4f7; border: 1px solid #e6e8ec; border-radius: 10px; padding: 0.5rem; }
.u-col--won { background: #f0f8f2; border-color: #cfe8d6; }
.u-col-h { display: flex; align-items: center; gap: 5px; font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #6c6976; margin-bottom: 0.45rem; }
.u-col-h b { margin-left: auto; color: #a4a1ad; }
.u-d { width: 7px; height: 7px; border-radius: 9999px; flex: none; }
.u-tcard, .u-dcard { background: #fff; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0.5rem 0.55rem; font-size: 0.76rem; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.u-tcard + .u-tcard, .u-dcard + .u-dcard { margin-top: 0.4rem; }
.u-muted { color: #9a97a3; font-weight: 500; }
.u-tcard--hot { border-color: #d8c2dd; box-shadow: 0 4px 14px -6px rgba(97,31,105,0.3); }
.u-mini-pill { display: inline-flex; margin-top: 0.4rem; padding: 0.1rem 0.45rem; border-radius: 9999px; font-size: 0.62rem; font-weight: 700; color: #2f6fed; background: #e8f0fe; }
.u-dcard { display: flex; flex-direction: column; gap: 0.3rem; }
.u-dcard > div { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.u-dcard b { color: #6c6976; } .u-dcard--won b { color: #15803d; }
.u-won { display: inline-flex; align-items: center; gap: 4px; padding: 0.12rem 0.45rem; border-radius: 9999px; font-size: 0.62rem; font-weight: 700; color: #15803d; background: #e3f4e8; align-self: flex-start; }

/* task detail */
.u-task-title { font-size: 1.05rem; font-weight: 700; }
.u-pill { display: inline-flex; margin-top: 0.45rem; padding: 0.15rem 0.55rem; border-radius: 9999px; font-size: 0.66rem; font-weight: 700; color: #611f69; background: #f3e9f5; }
.u-sec { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9a97a3; margin: 0.85rem 0 0.4rem; }
.u-ass { display: flex; gap: 0.35rem; }
.u-subs { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.82rem; }
.u-subs li { display: flex; align-items: center; gap: 0.5rem; color: #2c2935; }
.u-subs li.is-done { color: #a4a1ad; text-decoration: line-through; }
.u-subs li.is-done svg { color: #15803d; }
.u-box { width: 14px; height: 14px; border-radius: 3px; border: 1.5px solid #c4c1cd; display: inline-block; }

/* payoff */
.hj-cta { display: flex; gap: 0.8rem; flex-wrap: wrap; justify-content: center; }
.hj-btn { padding: 0.7rem 1.4rem; border-radius: 0.75rem; font-weight: 600; font-size: 0.95rem; transition: all 0.15s; }
.hj-btn--primary { background: linear-gradient(135deg,#a85be0,#7c3fd1); color: #fff; box-shadow: 0 10px 30px -10px rgba(168,91,224,0.8); }
.hj-btn--primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
.hj-btn--ghost { color: #e4c9ff; border: 1px solid rgba(199,155,239,0.4); }
.hj-btn--ghost:hover { background: rgba(168,91,224,0.12); }

/* comb */
.hj-comb { position: absolute; bottom: 5vh; left: 50%; transform: translateX(-50%); display: flex; gap: 0.55rem; }
.hj-comb-cell { width: 30px; height: 34px; display: grid; place-items: center; clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%); background: rgba(255,255,255,0.06); color: rgba(243,236,250,0.35); transition: all 0.4s ease; }
.hj-comb-cell.is-on { background: rgba(168,91,224,0.3); color: #e4c9ff; }
.hj-comb-cell.is-now { background: linear-gradient(135deg,#a85be0,#7c3fd1); color: #fff; transform: scale(1.12); box-shadow: 0 0 18px rgba(168,91,224,0.6); }

/* reduced motion: clean static stack */
.hj.is-reduced { height: auto !important; }
.hj.is-reduced .hj-stage { position: static; height: auto; display: block; padding: 7rem 1.5rem 4rem; }
.hj.is-reduced .hj-beat { position: static; inset: auto; opacity: 1; transform: none; pointer-events: auto; margin: 0 auto 3.5rem; max-width: 38rem; }
.hj.is-reduced .hj-cue, .hj.is-reduced .hj-comb { display: none; }
.hj.is-reduced .hj-aurora { position: fixed; }
@media (prefers-reduced-motion: reduce) { .hj-blob, .hj-hex, .hj-cue-icon { animation: none; } }
</style>
