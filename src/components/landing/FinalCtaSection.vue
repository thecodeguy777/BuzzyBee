<script setup lang="ts">
</script>

<template>
  <section id="contact" class="fcs py-16 md:py-24">
    <div class="max-w-6xl mx-auto px-6">
      <div v-reveal class="cta">
        <div class="hexw" aria-hidden="true"></div>
        <div class="orb" aria-hidden="true"></div>

        <div class="cta-grid">
          <!-- Left: copy -->
          <div>
            <div class="cta-eyebrow">Free discovery call</div>
            <h2 class="font-display">Your next closing pays for a full year.</h2>
            <p>
              Twenty minutes on a call. You leave with a scoped role, a VA shortlist, and a plan
              for week one &mdash; no commitment, no pressure.
            </p>
            <div class="cta-btns">
              <a class="btn btn-white" href="mailto:hello@hivemind.co">
                Book a discovery call
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
              <a class="btn btn-clear" href="#platform">See the platform</a>
            </div>
            <div class="cta-checks">
              <span class="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7L9 18l-5-5" /></svg>VA working in 7 days</span>
              <span class="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7L9 18l-5-5" /></svg>Cancel anytime after 3 months</span>
              <span class="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7L9 18l-5-5" /></svg>Swap guarantee</span>
            </div>
          </div>

          <!-- Right: call card -->
          <div class="callcard">
            <div class="big">20 min</div>
            <div class="row">
              <div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" /></svg></div>
              <div><div class="rt">Pick a time that works</div><div class="rs">Same-week slots, your timezone</div></div>
            </div>
            <div class="row">
              <div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4A7.5 7.5 0 1 1 20 11.5Z" /></svg></div>
              <div><div class="rt">Scope the role together</div><div class="rs">We map the tasks to offload first</div></div>
            </div>
            <div class="row">
              <div class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6a3 3 0 0 1 0 6" /></svg></div>
              <div><div class="rt">Meet your shortlist</div><div class="rs">Hand-picked, pre-vetted VAs</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fcs {
  --ink: #1a1722;
  --plum: #5e1b57;
  --plum-deep: #46123f;
  --border: #ebe6f2;
  --shadow-md: 0 4px 14px -4px rgba(60, 30, 70, 0.16), 0 2px 6px -2px rgba(60, 30, 70, 0.08);
}

.cta {
  position: relative;
  overflow: hidden;
  border-radius: 32px;
  padding: 64px;
  color: #fff;
  background: linear-gradient(118deg, #2f2bb8 0%, #5a3fd6 42%, #9a55df 78%, #bd6ad9 100%);
}
.cta .hexw {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='96' viewBox='0 0 56 96'%3E%3Cpath fill='none' stroke='%23ffffff' stroke-width='1' d='M28 0l24 14v28L28 56 4 42V14zM28 56l24 14v28M28 56L4 70v28'/%3E%3C/svg%3E");
  background-size: 56px 96px;
}
.cta .orb {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  right: -160px;
  top: -160px;
  pointer-events: none;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.22), transparent 60%);
  filter: blur(10px);
}
.cta-grid { position: relative; z-index: 2; display: grid; grid-template-columns: 1.25fr 0.75fr; gap: 48px; align-items: center; }
.cta-eyebrow { font-size: 12.5px; font-weight: 750; letter-spacing: 1.8px; text-transform: uppercase; color: rgba(255, 255, 255, 0.78); }
.cta h2 { margin: 16px 0 0; font-size: clamp(34px, 4.2vw, 52px); line-height: 1.04; letter-spacing: -1.6px; font-weight: 800; max-width: 600px; color: #fff; }
.cta p { margin: 18px 0 0; font-size: 18px; line-height: 1.55; color: rgba(255, 255, 255, 0.84); max-width: 480px; }

.cta-btns { display: flex; flex-wrap: wrap; gap: 13px; margin-top: 30px; }
.btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-family: inherit;
  font-weight: 700;
  border: none;
  cursor: pointer;
  border-radius: 14px;
  transition: transform 0.14s ease, box-shadow 0.18s ease, background 0.18s ease;
  white-space: nowrap;
}
.btn svg { transition: transform 0.18s ease; }
.btn-white { background: #fff; color: var(--plum-deep); padding: 16px 26px; font-size: 16px; box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4); }
.btn-white:hover { transform: translateY(-1px); }
.btn-white:hover svg { transform: translateX(3px); }
.btn-clear { background: rgba(255, 255, 255, 0.12); color: #fff; border: 1px solid rgba(255, 255, 255, 0.4); padding: 16px 24px; font-size: 16px; backdrop-filter: blur(4px); }
.btn-clear:hover { background: rgba(255, 255, 255, 0.2); }

.cta-checks { display: flex; flex-wrap: wrap; gap: 10px 26px; margin-top: 28px; }
.chk { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.9); }
.chk svg { flex: none; width: 18px; height: 18px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); padding: 3px; }

/* Call card */
.callcard { position: relative; background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.28); border-radius: 22px; padding: 24px; backdrop-filter: blur(8px); box-shadow: 0 24px 50px -20px rgba(20, 10, 50, 0.5); }
.callcard .row { display: flex; align-items: center; gap: 13px; padding: 13px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.16); }
.callcard .row:last-child { border-bottom: none; }
.callcard .ic { width: 42px; height: 42px; border-radius: 12px; background: rgba(255, 255, 255, 0.16); display: grid; place-items: center; flex: none; }
.callcard .rt { font-size: 14.5px; font-weight: 700; line-height: 1.3; }
.callcard .rs { font-size: 12.5px; color: rgba(255, 255, 255, 0.72); margin-top: 2px; }
.callcard .big { position: absolute; top: -16px; right: -12px; background: #fff; color: var(--plum); border-radius: 13px; padding: 8px 14px; font-weight: 800; font-size: 14px; box-shadow: var(--shadow-md); }

@media (max-width: 980px) {
  .cta-grid { grid-template-columns: 1fr; gap: 36px; }
  .callcard { max-width: 420px; }
}
@media (max-width: 680px) {
  .cta { padding: 44px 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
}
</style>
