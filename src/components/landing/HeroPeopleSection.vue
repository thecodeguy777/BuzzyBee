<script setup lang="ts">
import { ref, onMounted } from 'vue'
import FlowingGradient from './FlowingGradient.vue'
import AllocationBar from './AllocationBar.vue'

type Segment = { pct: number; label: string; kind: 'soft' | 'people' }

const usualSegments: Segment[] = [
  { pct: 28, label: 'Tools 28%', kind: 'soft' },
  { pct: 18, label: 'Mgmt', kind: 'soft' },
  { pct: 54, label: 'People 54%', kind: 'people' }
]

// The "With HiveMind" bar starts as the usual split, then morphs to 100% people.
const splitState: Segment[] = [
  { pct: 28, label: 'Tools', kind: 'soft' },
  { pct: 18, label: 'Mgmt', kind: 'soft' },
  { pct: 54, label: 'People', kind: 'people' }
]
const peopleState: Segment[] = [
  { pct: 0, label: '', kind: 'soft' },
  { pct: 0, label: '', kind: 'soft' },
  { pct: 100, label: 'People 100% — tools & PM included', kind: 'people' }
]

const prefersReduced =
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const hiveSegments = ref<Segment[]>(prefersReduced ? peopleState : splitState.map((s) => ({ ...s })))

onMounted(() => {
  if (prefersReduced) return
  window.setTimeout(() => {
    hiveSegments.value = peopleState
  }, 650)
})
</script>

<template>
  <section class="relative min-h-[100vh] flex items-center bg-base-100 overflow-hidden">
    <!-- Flowing gradient background -->
    <div class="absolute inset-0">
      <FlowingGradient />
    </div>

    <!-- Subtle grid overlay -->
    <div class="absolute inset-0 pointer-events-none opacity-[0.15]"
      style="background-image: linear-gradient(to right, var(--hm-gray-200) 1px, transparent 1px), linear-gradient(to bottom, var(--hm-gray-200) 1px, transparent 1px); background-size: 60px 60px;"
    ></div>

    <!-- Content -->
    <div class="relative z-10 w-full max-w-6xl mx-auto px-6 pt-32 pb-20 md:pt-40 md:pb-24">
      <div class="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] gap-10 lg:gap-12 items-center">
        <!-- Left column: copy -->
        <div class="max-w-2xl">
          <!-- Badge -->
          <div class="inline-flex items-center gap-2 border border-white/30 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-medium tracking-wide mb-8">
            <span class="w-1.5 h-1.5 rounded-full bg-primary"></span>
            <span class="text-base-content/70">No software tax</span>
          </div>

          <h1 class="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.1] text-base-content">
            Every dollar buys
            <span class="text-primary">work</span>, not software.
          </h1>

          <p class="mt-6 text-base md:text-lg text-base-content/70 max-w-xl leading-relaxed">
            Most services charge you for the assistant, then you go buy Slack, Asana, and a time tracker on top. HiveMind includes all of it &mdash; so 100% of your budget pays for people, not per-seat fees.
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <a href="#contact" class="inline-flex items-center gap-2 bg-primary text-primary-content font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm shadow-md shadow-primary/20">
              Put my budget on people
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a href="#platform" class="inline-flex items-center gap-2 border border-base-300 bg-white/80 backdrop-blur-sm text-base-content/80 font-medium px-5 py-2.5 rounded-md hover:border-base-content/30 hover:text-base-content transition-colors text-sm">
              See what's included
            </a>
          </div>

          <!-- Stats row -->
          <div class="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-px border border-base-300 rounded-lg overflow-hidden bg-base-300">
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">100%</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">Spend on people</div>
            </div>
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">$0</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">Software &amp; PM</div>
            </div>
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">6-in-1</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">Tools included</div>
            </div>
            <div class="bg-white/90 backdrop-blur-sm p-4 text-center">
              <div class="text-2xl font-bold text-base-content tracking-tight">7 days</div>
              <div class="text-[11px] uppercase tracking-wider text-base-content/50 mt-1">To live</div>
            </div>
          </div>
        </div>

        <!-- Right column: budget allocation card -->
        <div class="relative">
          <div class="rounded-2xl border border-base-300 bg-base-100/95 backdrop-blur-sm p-6 shadow-2xl shadow-primary/10">
            <div class="text-[11px] font-medium uppercase tracking-wider text-base-content/50 mb-5">Where a $4,500 budget goes</div>

            <div class="mb-6">
              <div class="text-xs font-medium text-base-content/60 mb-2">The usual way</div>
              <AllocationBar :segments="usualSegments" :height="38" />
            </div>

            <div>
              <div class="text-xs font-medium text-base-content/60 mb-2">With HiveMind</div>
              <AllocationBar :segments="hiveSegments" :height="38" :animated="true" />
              <div class="mt-3">
                <span class="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary">$0 software · $0 per-seat</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
