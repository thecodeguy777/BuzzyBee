<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { MessageCircle, Handshake, LayoutList, Clock, Video, Phone } from 'lucide-vue-next'

// "Your VA just upgraded their arsenal" — the page's dark act. A honeycomb of
// platform modules assembles around the VA with a spring, golden energy pulses
// run the connectors, and each cell takes a turn in the spotlight with the
// SaaS line-item it replaces. Self-contained: no app stores, just theatre.

interface Cell {
  key: string
  name: string
  type: string
  replaces: string
  price: string
  icon: unknown
  // honeycomb offset from center, in cell-units
  x: number
  y: number
}

// Flat-top hex ring: E, W, NE, NW, SE, SW.
const CELLS: Cell[] = [
  { key: 'chat',  name: 'HiveChat',  type: 'Messaging & huddles',   replaces: 'Slack',       price: '$8.75/seat',  icon: MessageCircle, x: 1.5,  y: 0 },
  { key: 'crm',   name: 'HiveCRM',   type: 'Pipeline & contacts',   replaces: 'HubSpot',     price: '$90/seat',    icon: Handshake,     x: -1.5, y: 0 },
  { key: 'flow',  name: 'HiveFlow',  type: 'Tasks & boards',        replaces: 'Asana',       price: '$10.99/seat', icon: LayoutList,    x: 0.75, y: -1.3 },
  { key: 'meet',  name: 'HiveMeet',  type: 'Meetings & guest links', replaces: 'Zoom',       price: '$13.33/seat', icon: Video,         x: -0.75, y: -1.3 },
  { key: 'track', name: 'HiveTrack', type: 'Time & attendance',     replaces: 'Hubstaff',    price: '$7/seat',     icon: Clock,         x: 0.75, y: 1.3 },
  { key: 'dial',  name: 'HiveDial',  type: 'Calls & dialer',        replaces: 'Aircall',     price: '$30/seat',    icon: Phone,         x: -0.75, y: 1.3 },
]

const HEX = 104 // px — cell width
const GAP = 1.16 // ring spacing multiplier

const px = (c: { x: number; y: number }) => ({
  left: `calc(50% + ${c.x * HEX * GAP}px - ${HEX / 2}px)`,
  top: `calc(50% + ${c.y * HEX * GAP}px - ${HEX / 2}px)`,
})

// Connector lines (center → each cell) for the SVG layer, in a 720×560 viewBox.
const VB = { w: 720, h: 560 }
const lineTo = (c: Cell) => ({
  x1: VB.w / 2, y1: VB.h / 2,
  x2: VB.w / 2 + c.x * HEX * GAP, y2: VB.h / 2 + c.y * HEX * GAP,
})

// Entrance + spotlight rotation.
const root = ref<HTMLElement | null>(null)
const armed = ref(false)
const spotlight = ref(-1) // index into CELLS; -1 = none
const hovered = ref(-1)
let io: IntersectionObserver | null = null
let spinTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return
      armed.value = true
      io?.disconnect()
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) return
      // Begin the spotlight tour after the comb has landed.
      window.setTimeout(() => {
        spotlight.value = 0
        spinTimer = setInterval(() => {
          spotlight.value = (spotlight.value + 1) % CELLS.length
        }, 2400)
      }, 1700)
    },
    { threshold: 0.35 },
  )
  if (root.value) io.observe(root.value)
})
onUnmounted(() => {
  io?.disconnect()
  if (spinTimer) clearInterval(spinTimer)
})

const lit = (i: number) => hovered.value === i || (hovered.value === -1 && spotlight.value === i)
</script>

<template>
  <section ref="root" class="arsenal relative overflow-hidden">
    <!-- Rounded-hexagon clip (objectBoundingBox → scales to any hex size) -->
    <svg width="0" height="0" class="absolute" aria-hidden="true">
      <defs>
        <clipPath id="ars-hex-clip" clipPathUnits="objectBoundingBox">
          <path d="M 0.325 0.067 L 0.675 0.067 Q 0.75 0.067 0.788 0.132 L 0.963 0.435 Q 1 0.5 0.963 0.565 L 0.788 0.868 Q 0.75 0.933 0.675 0.933 L 0.325 0.933 Q 0.25 0.933 0.213 0.868 L 0.038 0.565 Q 0 0.5 0.038 0.435 L 0.213 0.132 Q 0.25 0.067 0.325 0.067 Z" />
        </clipPath>
      </defs>
    </svg>

    <!-- atmosphere: hex grid + glows -->
    <div class="absolute inset-0 pointer-events-none">
      <svg class="absolute inset-0 w-full h-full opacity-[0.06]" aria-hidden="true">
        <defs>
          <pattern id="ars-hexgrid" width="56" height="48.5" patternUnits="userSpaceOnUse">
            <polygon points="14,0 42,0 56,24.25 42,48.5 14,48.5 0,24.25" fill="none" stroke="#a85be0" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ars-hexgrid)" />
      </svg>
      <div class="ars-glow ars-glow-gold" />
      <div class="ars-glow ars-glow-indigo" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6 py-24 md:py-28">
      <!-- header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-4">
        <div class="flex items-center gap-3 mb-4 justify-center">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-[#a85be0]/0 to-[#a85be0]" />
          <span class="font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-[#a85be0]">The Arsenal</span>
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-l from-[#a85be0]/0 to-[#a85be0]" />
        </div>
        <h2 class="font-display text-3xl md:text-5xl tracking-tight leading-[1.08] text-white">
          Your VA just upgraded
          <span class="block bg-gradient-to-r from-[#c79bef] via-[#a85be0] to-[#6a4cdd] bg-clip-text text-transparent pb-1">their arsenal.</span>
        </h2>
        <p class="mt-5 text-base text-white/55 leading-relaxed">
          One hire arrives carrying the whole stack — chat, CRM, tasks, meetings, calls, and time —
          already connected, already included. No seats. No add-ons. No software tax.
        </p>
      </div>

      <!-- the comb -->
      <div class="relative mx-auto" :style="{ maxWidth: VB.w + 'px', height: VB.h + 'px' }">
        <!-- connectors -->
        <svg class="absolute inset-0 w-full h-full" :viewBox="`0 0 ${VB.w} ${VB.h}`" fill="none" aria-hidden="true">
          <g v-for="(c, i) in CELLS" :key="c.key">
            <line
              v-bind="lineTo(c)"
              pathLength="1"
              class="ars-line"
              :class="{ 'ars-line-on': armed, 'ars-line-lit': lit(i) }"
              :style="{ transitionDelay: armed ? 600 + i * 90 + 'ms' : '0ms' }"
            />
            <!-- energy pulse riding the connector -->
            <circle v-if="armed" r="2.5" class="ars-pulse">
              <animateMotion
                :dur="2.8 + (i % 3) * 0.6 + 's'"
                repeatCount="indefinite"
                :begin="i * 0.7 + 's'"
                :path="`M ${lineTo(c).x2} ${lineTo(c).y2} L ${VB.w / 2} ${VB.h / 2}`"
              />
            </circle>
          </g>
        </svg>

        <!-- center: the VA -->
        <div
          class="ars-hex ars-hex-va absolute"
          :class="{ 'ars-in': armed }"
          :style="{ ...px({ x: 0, y: 0 }), width: HEX + 'px', height: HEX + 'px', transitionDelay: '120ms' }"
        >
          <div class="ars-hex-face ars-hex-face-va">
            <span class="font-display text-2xl font-extrabold text-white">M</span>
            <span class="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-white/70 mt-0.5">Your VA</span>
          </div>
          <span class="ars-ring" />
          <span class="ars-ring ars-ring-2" />
        </div>

        <!-- module cells -->
        <div
          v-for="(c, i) in CELLS"
          :key="c.key"
          class="ars-hex absolute cursor-default"
          :class="{ 'ars-in': armed, 'ars-lit': lit(i) }"
          :style="{ ...px(c), width: HEX + 'px', height: HEX + 'px', transitionDelay: armed ? 320 + i * 130 + 'ms' : '0ms' }"
          @mouseenter="hovered = i"
          @mouseleave="hovered = -1"
        >
          <div class="ars-hex-face">
            <component :is="c.icon" class="w-6 h-6 transition-colors duration-300" :class="lit(i) ? 'text-[#c79bef]' : 'text-white/70'" />
            <span class="mt-1.5 text-[11px] font-bold tracking-tight" :class="lit(i) ? 'text-[#d4b3f2]' : 'text-white/85'">{{ c.name }}</span>
            <span class="text-[8px] font-medium uppercase tracking-wider text-white/35 leading-tight text-center px-2">{{ c.type }}</span>
          </div>

          <!-- replaces tag -->
          <div class="ars-tag" :class="{ 'ars-tag-on': lit(i) }">
            <span class="text-white/45">replaces</span>
            <span class="font-semibold text-white/90">{{ c.replaces }}</span>
            <span class="ars-strike font-mono text-[#c79bef]/90">{{ c.price }}</span>
          </div>
        </div>
      </div>

      <!-- receipt line -->
      <div v-reveal="150" class="mt-2 text-center">
        <p class="inline-flex flex-wrap items-baseline justify-center gap-x-2 font-mono text-[13px] text-white/45">
          <span class="line-through decoration-[#a85be0]/70">≈ $160/seat/month in subscriptions</span>
          <span class="text-[#c79bef] font-semibold text-base">→ $0. Included with your VA.</span>
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.arsenal {
  background:
    radial-gradient(1100px 540px at 50% -10%, rgba(96, 76, 255, 0.10), transparent 60%),
    #160f1d;
}

.ars-glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(90px);
}
.ars-glow-gold {
  width: 520px; height: 520px;
  left: 50%; top: 52%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(168, 91, 224, 0.13), transparent 65%);
  animation: ars-breathe 7s ease-in-out infinite;
}
.ars-glow-indigo {
  width: 420px; height: 420px;
  right: -120px; bottom: -140px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.12), transparent 65%);
}
@keyframes ars-breathe {
  0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
}

/* connectors */
/* pathLength="1" on the element normalizes so dashoffset 1→0 draws fully */
.ars-line {
  stroke: rgba(168, 91, 224, 0.22);
  stroke-width: 1;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transition: stroke-dashoffset 0.9s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease;
}
.ars-line-on { stroke-dashoffset: 0; }
.ars-line-lit { stroke: rgba(168, 91, 224, 0.6); }

.ars-pulse {
  fill: #b673e8;
  filter: drop-shadow(0 0 6px rgba(168, 91, 224, 0.9));
}

/* hex cells */
.ars-hex {
  opacity: 0;
  transform: translateY(-26px) scale(0.4);
  transition: transform 0.62s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
  will-change: transform;
}
.ars-hex.ars-in {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.ars-hex-face {
  width: 100%; height: 100%;
  clip-path: url(#ars-hex-clip);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.085), rgba(255, 255, 255, 0.028));
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  transition: background 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1), filter 0.35s ease;
}
.ars-lit .ars-hex-face {
  background: linear-gradient(160deg, rgba(168, 91, 224, 0.16), rgba(168, 91, 224, 0.05));
  transform: scale(1.07);
  filter: drop-shadow(0 0 18px rgba(168, 91, 224, 0.28));
}
.ars-hex-face-va {
  background: linear-gradient(160deg, #a85be0, #6a4cdd);
  filter: drop-shadow(0 6px 24px rgba(168, 91, 224, 0.35));
}

/* breathing rings on the VA */
.ars-ring {
  position: absolute;
  inset: -7%;
  clip-path: url(#ars-hex-clip);
  border: 1.5px solid rgba(168, 91, 224, 0.5);
  animation: ars-ring 3.2s cubic-bezier(0.2, 0.6, 0.3, 1) infinite;
  pointer-events: none;
}
.ars-ring-2 { animation-delay: 1.6s; }
@keyframes ars-ring {
  0% { opacity: 0.8; transform: scale(0.92); }
  100% { opacity: 0; transform: scale(1.45); }
}

/* replaces tag */
.ars-tag {
  position: absolute;
  left: 50%;
  top: calc(100% + 6px);
  transform: translate(-50%, -4px) scale(0.92);
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
  font-size: 10.5px;
  padding: 4px 9px;
  border-radius: 7px;
  background: rgba(22, 15, 29, 0.92);
  border: 1px solid rgba(168, 91, 224, 0.25);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
  z-index: 20;
}
.ars-tag-on {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
.ars-strike {
  position: relative;
}
.ars-strike::after {
  content: '';
  position: absolute;
  left: -2%; right: -2%;
  top: 52%;
  height: 1.5px;
  background: #a85be0;
  transform: scaleX(0);
  transform-origin: left;
  animation: ars-strike 0.5s 0.45s cubic-bezier(0.6, 0, 0.2, 1) forwards;
}
.ars-tag-on .ars-strike::after { animation-play-state: running; }
@keyframes ars-strike {
  to { transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .ars-hex { transition: opacity 0.3s ease; transform: none; }
  .ars-glow-gold, .ars-ring, .ars-ring-2 { animation: none; }
  .ars-pulse { display: none; }
}

/* tags crowd the comb on small screens */
@media (max-width: 640px) {
  .ars-tag { display: none; }
}
</style>
