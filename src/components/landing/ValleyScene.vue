<script setup lang="ts">
// Full-bleed panoramic valley background. Designed for dark hero.
</script>

<template>
  <svg
    viewBox="0 0 1600 900"
    xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMid slice"
    class="absolute inset-0 w-full h-full"
    aria-hidden="true"
  >
    <defs>
      <!-- Sun radial -->
      <radialGradient id="sun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="oklch(92% 0.16 85)" stop-opacity="1" />
        <stop offset="45%" stop-color="oklch(80% 0.18 82)" stop-opacity="0.65" />
        <stop offset="100%" stop-color="oklch(75% 0.18 80)" stop-opacity="0" />
      </radialGradient>

      <!-- Mountain silhouette gradients -->
      <linearGradient id="far-range" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="oklch(48% 0.1 80)" stop-opacity="0.45" />
        <stop offset="100%" stop-color="oklch(25% 0.04 80)" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="mid-range" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="oklch(58% 0.16 82)" stop-opacity="0.75" />
        <stop offset="100%" stop-color="oklch(22% 0.04 80)" stop-opacity="0.1" />
      </linearGradient>
      <linearGradient id="near-range" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="oklch(68% 0.18 85)" stop-opacity="0.95" />
        <stop offset="100%" stop-color="oklch(18% 0.02 80)" stop-opacity="0.25" />
      </linearGradient>

      <!-- Fade the hex grid floor toward horizon -->
      <linearGradient id="floor-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="white" stop-opacity="0" />
        <stop offset="55%" stop-color="white" stop-opacity="0.6" />
        <stop offset="100%" stop-color="white" stop-opacity="1" />
      </linearGradient>
      <mask id="floor-mask">
        <rect x="0" y="500" width="1600" height="400" fill="url(#floor-fade)" />
      </mask>

      <!-- Hexagon (flat-top, centered, radius 20) -->
      <g id="hex">
        <polygon points="-20,0 -10,-17.32 10,-17.32 20,0 10,17.32 -10,17.32" />
      </g>

      <!-- Vignette to darken edges so text reads -->
      <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
        <stop offset="60%" stop-color="black" stop-opacity="0" />
        <stop offset="100%" stop-color="black" stop-opacity="0.75" />
      </radialGradient>
    </defs>

    <!-- Sun glow on horizon (right of center) -->
    <circle cx="1050" cy="510" r="280" fill="url(#sun)" />
    <circle cx="1050" cy="510" r="55" fill="oklch(90% 0.16 85)" opacity="0.9" />
    <circle cx="1050" cy="510" r="55" fill="oklch(98% 0.08 85)" opacity="0.4" />

    <!-- Floating sky hexagons (left side, lighter so right stays clean for bee) -->
    <g fill="none" stroke="oklch(72% 0.15 82)" stroke-width="1.2">
      <use href="#hex" transform="translate(220 220) scale(2.2)" opacity="0.3" />
      <use href="#hex" transform="translate(330 130) scale(0.9)" opacity="0.45" />
      <use href="#hex" transform="translate(140 380) scale(0.7)" opacity="0.35" />
      <use href="#hex" transform="translate(440 280) scale(0.55)" opacity="0.35" />
      <use href="#hex" transform="translate(60 150) scale(0.5)" opacity="0.3" />
    </g>
    <g fill="oklch(78% 0.18 85)">
      <use href="#hex" transform="translate(330 130) scale(0.28)" />
      <use href="#hex" transform="translate(440 280) scale(0.18)" />
    </g>
    <!-- Dashed connection lines -->
    <g stroke="oklch(72% 0.14 82)" stroke-width="1" fill="none" opacity="0.4" stroke-dasharray="3 6">
      <path d="M60,150 L220,220 L140,380" />
      <path d="M220,220 L330,130 L440,280" />
    </g>
    <g fill="oklch(85% 0.16 85)">
      <circle cx="60" cy="150" r="2" />
      <circle cx="220" cy="220" r="1.8" opacity="0.8" />
      <circle cx="140" cy="380" r="2" />
      <circle cx="330" cy="130" r="2.5" />
      <circle cx="440" cy="280" r="1.8" opacity="0.8" />
    </g>

    <!-- Far ridge -->
    <path
      d="M0,560 L160,505 L340,540 L500,485 L680,520 L860,470 L1050,510 L1220,490 L1400,530 L1600,500 L1600,650 L0,650 Z"
      fill="url(#far-range)"
    />

    <!-- Mid range -->
    <path
      d="M0,620 L180,525 L380,580 L540,505 L720,560 L920,500 L1140,555 L1320,520 L1520,560 L1600,540 L1600,700 L0,700 Z"
      fill="url(#mid-range)"
    />

    <!-- Near range — the V-valley opens toward the viewer, centered-ish -->
    <path
      d="M0,900 L0,680 L280,570 L540,665 L780,555 L1020,670 L1280,565 L1600,680 L1600,900 Z"
      fill="url(#near-range)"
    />

    <!-- Topographic contour lines on near range -->
    <g stroke="oklch(85% 0.14 85)" stroke-width="0.7" fill="none" opacity="0.28">
      <path d="M0,740 L280,630 L540,715 L780,615 L1020,720 L1280,625 L1600,740" />
      <path d="M0,800 L280,690 L540,765 L780,675 L1020,770 L1280,685 L1600,800" />
      <path d="M0,860 L280,750 L540,820 L780,735 L1020,820 L1280,745 L1600,860" />
    </g>

    <!-- Hex-grid valley floor receding to horizon -->
    <g mask="url(#floor-mask)" opacity="0.5">
      <g stroke="oklch(78% 0.16 82)" stroke-width="1" fill="none">
        <!-- Row 1 (closest) -->
        <g transform="translate(0 870) scale(1.4 1)">
          <use href="#hex" transform="translate(100 0)" />
          <use href="#hex" transform="translate(160 0)" />
          <use href="#hex" transform="translate(220 0)" />
          <use href="#hex" transform="translate(280 0)" />
          <use href="#hex" transform="translate(340 0)" />
          <use href="#hex" transform="translate(400 0)" />
          <use href="#hex" transform="translate(460 0)" />
          <use href="#hex" transform="translate(520 0)" />
          <use href="#hex" transform="translate(580 0)" />
          <use href="#hex" transform="translate(640 0)" />
          <use href="#hex" transform="translate(700 0)" />
        </g>
        <!-- Row 2 -->
        <g transform="translate(0 810) scale(1.1 0.8)">
          <use href="#hex" transform="translate(150 0)" />
          <use href="#hex" transform="translate(210 0)" />
          <use href="#hex" transform="translate(270 0)" />
          <use href="#hex" transform="translate(330 0)" />
          <use href="#hex" transform="translate(390 0)" />
          <use href="#hex" transform="translate(450 0)" />
          <use href="#hex" transform="translate(510 0)" />
          <use href="#hex" transform="translate(570 0)" />
          <use href="#hex" transform="translate(630 0)" />
          <use href="#hex" transform="translate(690 0)" />
          <use href="#hex" transform="translate(750 0)" />
          <use href="#hex" transform="translate(810 0)" />
          <use href="#hex" transform="translate(870 0)" />
          <use href="#hex" transform="translate(930 0)" />
        </g>
        <!-- Row 3 -->
        <g transform="translate(0 750) scale(0.85 0.7)">
          <use href="#hex" transform="translate(300 0)" />
          <use href="#hex" transform="translate(360 0)" />
          <use href="#hex" transform="translate(420 0)" />
          <use href="#hex" transform="translate(480 0)" />
          <use href="#hex" transform="translate(540 0)" />
          <use href="#hex" transform="translate(600 0)" />
          <use href="#hex" transform="translate(660 0)" />
          <use href="#hex" transform="translate(720 0)" />
          <use href="#hex" transform="translate(780 0)" />
          <use href="#hex" transform="translate(840 0)" />
          <use href="#hex" transform="translate(900 0)" />
          <use href="#hex" transform="translate(960 0)" />
          <use href="#hex" transform="translate(1020 0)" />
          <use href="#hex" transform="translate(1080 0)" />
          <use href="#hex" transform="translate(1140 0)" />
          <use href="#hex" transform="translate(1200 0)" />
          <use href="#hex" transform="translate(1260 0)" />
          <use href="#hex" transform="translate(1320 0)" />
          <use href="#hex" transform="translate(1380 0)" />
          <use href="#hex" transform="translate(1440 0)" />
        </g>
        <!-- Row 4 -->
        <g transform="translate(0 700) scale(0.6 0.5)">
          <use href="#hex" transform="translate(500 0)" />
          <use href="#hex" transform="translate(560 0)" />
          <use href="#hex" transform="translate(620 0)" />
          <use href="#hex" transform="translate(680 0)" />
          <use href="#hex" transform="translate(740 0)" />
          <use href="#hex" transform="translate(800 0)" />
          <use href="#hex" transform="translate(860 0)" />
          <use href="#hex" transform="translate(920 0)" />
          <use href="#hex" transform="translate(980 0)" />
          <use href="#hex" transform="translate(1040 0)" />
          <use href="#hex" transform="translate(1100 0)" />
          <use href="#hex" transform="translate(1160 0)" />
          <use href="#hex" transform="translate(1220 0)" />
          <use href="#hex" transform="translate(1280 0)" />
          <use href="#hex" transform="translate(1340 0)" />
          <use href="#hex" transform="translate(1400 0)" />
          <use href="#hex" transform="translate(1460 0)" />
          <use href="#hex" transform="translate(1520 0)" />
          <use href="#hex" transform="translate(1580 0)" />
          <use href="#hex" transform="translate(1640 0)" />
          <use href="#hex" transform="translate(1700 0)" />
          <use href="#hex" transform="translate(1760 0)" />
          <use href="#hex" transform="translate(1820 0)" />
        </g>
      </g>
    </g>

    <!-- Edge vignette for text contrast -->
    <rect x="0" y="0" width="1600" height="900" fill="url(#vignette)" />
  </svg>
</template>
