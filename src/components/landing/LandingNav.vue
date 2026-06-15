<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import hivemindMark from '@/assets/landing/hivemind-mark.svg'
import hivemindMarkLight from '@/assets/landing/hivemind-mark-dark.svg'

// A dark-hero page passes `flush-dark` so the transparent top state uses light
// text + the white mark; the scrolled white pill reverts to the dark treatment.
const props = defineProps<{ flushDark?: boolean }>()

// Spline-style nav: sits flush + transparent at the top, then on scroll it
// "lifts" into a centered floating frosted pill (narrower, blurred, bordered,
// shadowed, fully rounded). Shared across the landing-family pages.
const mobileOpen = ref(false)
const scrolled = ref(false)
const markSrc = computed(() => (props.flushDark && !scrolled.value ? hivemindMarkLight : hivemindMark))
let raf = 0

function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const y = window.scrollY
    // Hysteresis: enter the pill past 24px, only leave below 8px — avoids
    // flicker when momentum/rubber-band scrolling hovers around the threshold.
    scrolled.value = scrolled.value ? y > 8 : y > 24
  })
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') mobileOpen.value = false
}
function onResize() {
  if (window.innerWidth >= 768) mobileOpen.value = false
}
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  if (raf) cancelAnimationFrame(raf)
})

const LINKS = [
  { href: '#professionals', label: 'The People' },
  { href: '#software-tax', label: 'Why HiveMind' },
  { href: '#platform', label: 'Platform' },
  { href: '#how', label: 'How It Works' }
]
</script>

<template>
  <header class="ln-root fixed inset-x-0 top-0 z-50" :class="{ 'is-scrolled': scrolled }">
    <div class="ln-shell mx-auto flex items-center justify-between" :class="[scrolled ? 'is-pill' : 'is-flush', { 'is-flush-dark': flushDark && !scrolled }]">
      <a href="/" class="flex items-center gap-2 shrink-0">
        <img :src="markSrc" alt="HiveMind" class="w-7 h-auto" />
        <span class="ln-brand text-base font-semibold tracking-tight">HiveMind</span>
      </a>

      <nav class="hidden md:flex items-center gap-7 text-[13px]" aria-label="Primary">
        <a v-for="l in LINKS" :key="l.href" :href="l.href" class="ln-link">{{ l.label }}</a>
      </nav>

      <div class="flex items-center gap-2">
        <a href="/login" class="ln-login hidden sm:inline-flex items-center text-[13px] font-medium px-3.5 py-1.5 rounded-full">
          Log In
        </a>
        <a href="#contact" class="ln-cta inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-full">
          Get Started
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
        <button
          class="ln-burger md:hidden w-8 h-8 flex items-center justify-center rounded-full"
          :aria-expanded="mobileOpen"
          aria-controls="ln-mobile-menu"
          aria-label="Toggle menu"
          @click="mobileOpen = !mobileOpen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path v-if="!mobileOpen" d="M4 6h16M4 12h16M4 18h16" />
            <path v-else d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile menu -->
    <Transition name="ln-menu">
      <div v-if="mobileOpen" id="ln-mobile-menu" class="ln-mobile md:hidden mx-auto">
        <a
          v-for="l in LINKS"
          :key="l.href"
          :href="l.href"
          class="ln-link block py-2 text-sm"
          @click="mobileOpen = false"
        >
          {{ l.label }}
        </a>
        <a href="/login" class="ln-brand block py-2 text-sm font-medium" @click="mobileOpen = false">Log In</a>
        <a
          href="#contact"
          class="ln-cta mt-2 inline-flex w-full items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full"
          @click="mobileOpen = false"
        >
          Get Started
        </a>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.ln-root {
  --ln-plum: #5e1b57;
  --ln-plum-deep: #46123f;
  --ln-ink: #1a1722;
  --ln-ink-2: #56525f;
  /* The outer gap grows on scroll so the pill detaches from the screen edges. */
  padding: 0;
  transition: padding 0.3s ease;
}
.ln-root.is-scrolled {
  padding: 12px 16px 0;
}

.ln-shell {
  max-width: 72rem;
  height: 64px;
  padding: 0 24px;
  border-radius: 0;
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
  transition:
    max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.3s ease,
    padding 0.3s ease,
    background 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease,
    border-radius 0.4s ease;
}
.ln-shell.is-pill {
  max-width: 58rem;
  height: 54px;
  padding: 0 12px 0 18px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  backdrop-filter: blur(14px) saturate(140%);
  border-color: rgba(94, 27, 87, 0.1);
  box-shadow: 0 14px 34px -14px rgba(60, 25, 75, 0.28), 0 2px 8px -3px rgba(60, 25, 75, 0.12);
}

.ln-brand { color: var(--ln-ink); }
.ln-link {
  color: var(--ln-ink-2);
  transition: color 0.15s ease;
}
.ln-link:hover { color: var(--ln-plum); }

.ln-login {
  color: var(--ln-ink);
  border: 1px solid rgba(26, 23, 34, 0.14);
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}
.ln-login:hover {
  color: var(--ln-plum);
  border-color: rgba(94, 27, 87, 0.4);
  background: rgba(94, 27, 87, 0.04);
}

.ln-cta {
  background: var(--ln-plum);
  color: #fff;
  box-shadow: 0 6px 16px -8px rgba(94, 27, 87, 0.6);
  transition: background 0.18s ease, transform 0.14s ease, box-shadow 0.18s ease;
}
.ln-cta svg { transition: transform 0.18s ease; }
.ln-cta:hover {
  background: var(--ln-plum-deep);
  transform: translateY(-1px);
  box-shadow: 0 10px 22px -8px rgba(94, 27, 87, 0.7);
}
.ln-cta:hover svg { transform: translateX(3px); }

.ln-burger {
  color: var(--ln-ink);
  transition: background 0.15s ease;
}
.ln-burger:hover { background: rgba(26, 23, 34, 0.06); }

/* Dark-hero flush state: light text over the transparent bar (reverts in pill). */
.ln-shell.is-flush-dark .ln-brand { color: #fff; }
.ln-shell.is-flush-dark .ln-link { color: rgba(255, 255, 255, 0.78); }
.ln-shell.is-flush-dark .ln-link:hover { color: #fff; }
.ln-shell.is-flush-dark .ln-login { color: #fff; border-color: rgba(255, 255, 255, 0.28); }
.ln-shell.is-flush-dark .ln-login:hover { color: #fff; border-color: rgba(255, 255, 255, 0.55); background: rgba(255, 255, 255, 0.08); }
.ln-shell.is-flush-dark .ln-burger { color: #fff; }

/* Mobile dropdown — a frosted panel under the bar/pill. */
.ln-mobile {
  max-width: 72rem;
  margin-top: 8px;
  padding: 12px 18px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(94, 27, 87, 0.1);
  box-shadow: 0 14px 34px -14px rgba(60, 25, 75, 0.28);
}
.is-scrolled .ln-mobile { max-width: 58rem; }

.ln-menu-enter-active,
.ln-menu-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.ln-menu-enter-from,
.ln-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
