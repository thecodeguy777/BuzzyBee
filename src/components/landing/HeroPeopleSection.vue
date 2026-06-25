<script setup lang="ts">
import { ref, computed } from 'vue'

// Budget calculator — reframed (per the design) as the customer's OWN spend, not
// HiveMind's price: drag the slider and every figure updates live, so "$4,500"
// can never read as a fixed fee. Tools & PM are $0 with HiveMind, so the ~46%
// that usually leaks to software now buys real work.
const MIN = 2000
const MAX = 12000
const budget = ref(4500)

const fmt = (n: number) => n.toLocaleString('en-US')
const oldPeople = computed(() => Math.round(budget.value * 0.54))
const lost = computed(() => budget.value - oldPeople.value)
const fillPct = computed(() => ((budget.value - MIN) / (MAX - MIN)) * 100)
</script>

<template>
  <section class="hps relative overflow-hidden">
    <!-- Honeycomb motif + ambient glows -->
    <div class="hexbg" aria-hidden="true"></div>
    <div class="glow a" aria-hidden="true"></div>
    <div class="glow b" aria-hidden="true"></div>
    <div class="glow c" aria-hidden="true"></div>

    <div class="relative z-[2] max-w-6xl mx-auto px-6 pt-28 md:pt-36 pb-16 md:pb-20">
      <div class="hero-grid">
        <!-- Left: copy -->
        <div>
          <span class="eyebrow"><span class="dot"></span>No software tax</span>

          <h1 class="font-display">Every dollar buys<br /><span class="accent">work</span>, not software.</h1>

          <p class="lede">
            Most services charge you for the assistant, then you bolt on Slack, Asana, and a time
            tracker. <b>HiveMind includes all of it</b> &mdash; so 100% of your budget pays for
            people, not per-seat fees.
          </p>

          <div class="cta-row">
            <a class="btn btn-primary btn-hero" href="#contact">
              Put my budget on people
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
            <a class="btn btn-ghost btn-hero" href="#platform">See what's included</a>
          </div>

          <!-- Trust row -->
          <div class="trust">
            <div class="avs">
              <div class="av" style="background: linear-gradient(135deg, #7b2d86, #b066c0)">RM</div>
              <div class="av" style="background: linear-gradient(135deg, #2f6fed, #74a4f5)">TH</div>
              <div class="av" style="background: linear-gradient(135deg, #0d9488, #3fcabb)">CD</div>
              <div class="av" style="background: linear-gradient(135deg, #c2700c, #e8a64a)">AT</div>
            </div>
            <div class="trust-txt">
              <span class="stars" aria-hidden="true">★★★★★</span>&nbsp;<b>Trusted by 200+ real-estate teams</b><br />placing pre-screened VAs in under 7 days.
            </div>
          </div>
        </div>

        <!-- Right: budget calculator -->
        <div class="card">
          <div class="float-badge"><span class="pct">$0</span> to software</div>
          <div class="card-eyebrow">Your money — not our price</div>

          <div class="budget-pick">
            <div>
              <div class="bp-label">What you spend today</div>
              <div class="bp-amt">$<span>{{ fmt(budget) }}</span><span class="bp-mo">/mo</span></div>
            </div>
            <span class="bp-hint">drag to match yours</span>
          </div>
          <input
            v-model.number="budget"
            class="bslider"
            type="range"
            :min="MIN"
            :max="MAX"
            step="500"
            :style="{ '--fill': fillPct + '%' }"
            aria-label="Your monthly VA budget"
            :aria-valuetext="'$' + fmt(budget) + ' per month — $' + fmt(lost) + ' now buys real work'"
          />

          <div class="blk-label">
            <span>Typical VA setup</span>
            <span class="tag">${{ fmt(lost) }} wasted</span>
          </div>
          <div class="bar">
            <div class="seg stripe" style="flex: 0.28">Tools</div>
            <div class="seg stripe" style="flex: 0.18">PM</div>
            <div class="seg people-old" style="flex: 0.54">People&nbsp;<b>${{ fmt(oldPeople) }}</b></div>
          </div>

          <div class="blk-label">
            <span>With HiveMind</span>
            <span class="tag">tools &amp; PM included</span>
          </div>
          <div class="bar hm">
            <div class="seg thin"></div>
            <div class="seg people-new">People&nbsp;<b>${{ fmt(budget) }}</b></div>
          </div>

          <div class="card-note">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7L9 18l-5-5" /></svg>
            <span>HiveMind's tools &amp; PM cost <b>$0</b> &mdash; so <b>${{ fmt(lost) }}</b> that used to vanish now buys real work.</span>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="stats">
        <div class="stat"><div class="v">100<span class="u">%</span></div><div class="k">Spend on people</div></div>
        <div class="stat"><div class="v"><span class="u">$</span>0</div><div class="k">Software &amp; PM</div></div>
        <div class="stat"><div class="v">6-in-<span class="u">1</span></div><div class="k">Tools included</div></div>
        <div class="stat"><div class="v">7 <span class="u">days</span></div><div class="k">To live</div></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hps {
  /* HiveMind brand palette (aubergine + indigo→violet) — scoped to this section. */
  --ink: #1a1722;
  --ink-2: #56525f;
  --ink-3: #8b8794;
  --plum: #5e1b57;
  --plum-deep: #46123f;
  --plum-bright: #8a3a83;
  --bg: #f6f4fb;
  --bg-2: #efeaf7;
  --card: #ffffff;
  --border: #ebe6f2;
  --border-2: #e0d9ec;
  --g2: #6a4cdd;
  --g3: #a85be0;
  --shadow-sm: 0 1px 2px rgba(40, 20, 50, 0.05), 0 1px 1px rgba(40, 20, 50, 0.04);
  --shadow-md: 0 4px 14px -4px rgba(60, 30, 70, 0.16), 0 2px 6px -2px rgba(60, 30, 70, 0.08);
  --shadow-lg: 0 30px 70px -24px rgba(60, 25, 75, 0.34), 0 8px 24px -10px rgba(60, 25, 75, 0.2);
  background: var(--bg);
  color: var(--ink);
}

.hexbg {
  position: absolute;
  inset: 0;
  opacity: 0.5;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='96' viewBox='0 0 56 96'%3E%3Cpath fill='none' stroke='%23c9b8d8' stroke-width='1' d='M28 0l24 14v28L28 56 4 42V14zM28 56l24 14v28M28 56L4 70v28'/%3E%3C/svg%3E");
  background-size: 56px 96px;
  -webkit-mask-image: radial-gradient(120% 90% at 70% 10%, #000 0%, transparent 62%);
  mask-image: radial-gradient(120% 90% at 70% 10%, #000 0%, transparent 62%);
}
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  pointer-events: none;
  z-index: 0;
}
.glow.a { width: 680px; height: 680px; top: -260px; right: -160px; background: radial-gradient(circle, rgba(120, 90, 224, 0.34), transparent 66%); }
.glow.b { width: 540px; height: 540px; top: 120px; left: -220px; background: radial-gradient(circle, rgba(200, 130, 224, 0.26), transparent 66%); }
.glow.c { width: 460px; height: 460px; bottom: -200px; right: 18%; background: radial-gradient(circle, rgba(74, 18, 63, 0.12), transparent 66%); }

.hero-grid {
  display: grid;
  grid-template-columns: 1.04fr 0.96fr;
  gap: 56px;
  align-items: center;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 15px 7px 13px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--border-2);
  border-radius: 100px;
  font-size: 13.5px;
  font-weight: 650;
  color: var(--plum);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(6px);
}
.eyebrow .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--plum-bright); box-shadow: 0 0 0 4px rgba(138, 58, 131, 0.18); }

h1 {
  margin: 24px 0 0;
  font-size: clamp(44px, 5.6vw, 78px);
  line-height: 0.98;
  letter-spacing: -2.4px;
  font-weight: 800;
  color: var(--ink);
}
h1 .accent { background: linear-gradient(110deg, var(--plum-bright), var(--plum)); -webkit-background-clip: text; background-clip: text; color: transparent; }

.lede { margin: 26px 0 0; font-size: 19px; line-height: 1.58; color: var(--ink-2); max-width: 520px; font-weight: 450; }
.lede b { color: var(--ink); font-weight: 700; }

.cta-row { display: flex; flex-wrap: wrap; gap: 13px; margin-top: 34px; }
.btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-family: inherit;
  font-weight: 700;
  border: none;
  cursor: pointer;
  border-radius: 14px;
  transition: transform 0.14s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.15s ease, border-color 0.15s ease;
  white-space: nowrap;
}
.btn svg { transition: transform 0.18s ease; }
.btn-hero { padding: 16px 26px; font-size: 16px; }
.btn-primary { background: var(--plum); color: #fff; box-shadow: 0 6px 18px -6px rgba(94, 27, 87, 0.6); }
.btn-primary:hover { background: var(--plum-deep); transform: translateY(-1px); box-shadow: 0 10px 26px -8px rgba(94, 27, 87, 0.7); }
.btn-primary:hover svg { transform: translateX(3px); }
.btn-ghost { background: #fff; border: 1px solid var(--border-2); color: var(--ink); box-shadow: var(--shadow-sm); }
.btn-ghost:hover { border-color: var(--plum); color: var(--plum); transform: translateY(-1px); }

.trust { display: flex; align-items: center; gap: 14px; margin-top: 34px; }
.avs { display: flex; }
.avs .av { width: 38px; height: 38px; border-radius: 50%; border: 2.5px solid var(--bg); margin-left: -10px; background-size: cover; background-position: center; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; }
.avs .av:first-child { margin-left: 0; }
.trust-txt { font-size: 13.5px; color: var(--ink-2); line-height: 1.45; }
.trust-txt b { color: var(--ink); font-weight: 750; }
.stars { color: #e0a818; letter-spacing: 1px; font-size: 13px; }

/* Budget card */
.card { position: relative; z-index: 2; background: var(--card); border: 1px solid var(--border); border-radius: 26px; box-shadow: var(--shadow-lg); padding: 30px 30px 26px; }
.card-eyebrow { font-size: 12px; font-weight: 750; letter-spacing: 1.4px; color: var(--ink-3); text-transform: uppercase; }
.blk-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 22px 0 9px; }
.blk-label span { font-size: 13.5px; font-weight: 700; color: var(--ink); white-space: nowrap; }
.blk-label .tag { font-size: 11px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; }
.bar { display: flex; height: 46px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: #faf8fd; }
.seg { display: grid; place-items: center; font-size: 12.5px; font-weight: 700; color: var(--ink-2); white-space: nowrap; overflow: hidden; }
.seg.stripe { background: repeating-linear-gradient(135deg, #efeaf6, #efeaf6 7px, #e6dff0 7px, #e6dff0 14px); }
.seg.people-old { background: var(--plum); color: #fff; }
.bar.hm .seg.people-new { flex: 1; background: linear-gradient(100deg, var(--plum), var(--plum-bright)); color: #fff; position: relative; overflow: hidden; }
.bar.hm .seg.people-new::after { content: ""; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent); animation: hps-sheen 3.4s ease-in-out infinite; }
@keyframes hps-sheen { 0% { left: -40%; } 55% { left: 120%; } 100% { left: 120%; } }
.bar.hm .seg.thin { flex: none; width: 26px; background: repeating-linear-gradient(135deg, #efeaf6, #efeaf6 7px, #e6dff0 7px, #e6dff0 14px); }
.card-note { display: flex; align-items: flex-start; gap: 9px; margin-top: 20px; padding: 13px 15px; background: #f1faf4; border: 1px solid #d5ecdd; border-radius: 13px; font-size: 13.5px; line-height: 1.5; color: var(--ink-2); }
.card-note svg { flex: none; margin-top: 1px; }
.card-note b { color: var(--ink); font-weight: 750; }
.float-badge { position: absolute; top: -18px; right: 24px; display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--border); border-radius: 13px; padding: 9px 14px; box-shadow: var(--shadow-md); font-size: 13px; font-weight: 750; }
.float-badge .pct { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, var(--g2), var(--g3)); color: #fff; display: grid; place-items: center; font-size: 11px; font-weight: 800; }

/* Budget slider */
.budget-pick { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 14px; }
.budget-pick > div { min-width: 0; }
.bp-label { font-size: 12.5px; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.bp-amt { font-size: 38px; font-weight: 800; letter-spacing: -1.6px; line-height: 1; margin-top: 4px; color: var(--ink); }
.bp-mo { font-size: 16px; font-weight: 700; color: var(--ink-3); letter-spacing: 0; }
.bp-hint { font-size: 11.5px; font-weight: 650; color: var(--plum-bright); white-space: nowrap; padding-bottom: 4px; }
.bslider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 6px;
  margin: 14px 0 4px;
  cursor: pointer;
  background: linear-gradient(90deg, var(--plum), var(--plum-bright) var(--fill, 31%), #e9e1f1 var(--fill, 31%), #e9e1f1);
}
.bslider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid var(--plum); box-shadow: 0 3px 8px rgba(94, 27, 87, 0.4); cursor: grab; transition: transform 0.12s; }
.bslider::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.12); }
.bslider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid var(--plum); box-shadow: 0 3px 8px rgba(94, 27, 87, 0.4); cursor: grab; }

/* Stat strip */
.stats { position: relative; z-index: 2; margin-top: 54px; display: grid; grid-template-columns: repeat(4, 1fr); background: #fff; border: 1px solid var(--border); border-radius: 20px; box-shadow: var(--shadow-md); overflow: hidden; }
.stat { padding: 24px 26px; border-right: 1px solid var(--border); }
.stat:last-child { border-right: none; }
.stat .v { font-size: 34px; font-weight: 800; letter-spacing: -1.4px; line-height: 1; color: var(--ink); }
.stat .v .u { color: var(--plum-bright); }
.stat .k { margin-top: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase; color: var(--ink-3); }

@media (max-width: 980px) {
  .hero-grid { grid-template-columns: 1fr; gap: 40px; }
}
@media (max-width: 680px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .stat:nth-child(2) { border-right: none; }
  .stat:nth-child(1), .stat:nth-child(2) { border-bottom: 1px solid var(--border); }
}
@media (prefers-reduced-motion: reduce) {
  .bar.hm .seg.people-new::after { animation: none; }
  .btn { transition: none; }
}
</style>
