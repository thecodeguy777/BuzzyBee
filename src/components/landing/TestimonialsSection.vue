<script setup lang="ts">
import rawGranny from '@/assets/avatars/granny.svg?raw'
import rawHippie from '@/assets/avatars/hippie.svg?raw'
import rawBrownDude from '@/assets/avatars/brown-dude.svg?raw'
import rawBrownLady from '@/assets/avatars/brown-lady.svg?raw'
import rawBeardGuy from '@/assets/avatars/beard-guy.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const testimonials = [
  {
    avatar: prefixSvgIds(rawBrownLady, 'tm-bl'),
    quote: 'Our VA took over inbox triage and listing research in week one. Two months in, my close rate is up and I\'m finally home for dinner.',
    name: 'Alana J.',
    role: 'Real Estate Broker, Austin TX'
  },
  {
    avatar: prefixSvgIds(rawBeardGuy, 'tm-bg'),
    quote: 'I was paying three U.S. contractors to half-do what one BuzzyBee VA now owns end-to-end. The EOD reports alone are a revelation.',
    name: 'Marcus T.',
    role: 'Founder, Ecom DTC Brand'
  },
  {
    avatar: prefixSvgIds(rawBrownDude, 'tm-bd'),
    quote: 'The vetting is real. The first match nailed our brand voice by call two. I keep recommending BuzzyBee to every founder I know.',
    name: 'Dev P.',
    role: 'Agency Owner, New York'
  },
  {
    avatar: prefixSvgIds(rawGranny, 'tm-gr'),
    quote: 'I\'m not a tech person. The dashboard just works. Time tracking, reports, and invoices are all in one place and I finally stopped missing things.',
    name: 'Joan W.',
    role: 'CPA, Solo Practice'
  },
  {
    avatar: prefixSvgIds(rawHippie, 'tm-hp'),
    quote: 'They pair you with someone who actually lives in your workflow. Ours is a Notion and ClickUp wizard. Huge upgrade over the marketplace route.',
    name: 'Riley M.',
    role: 'Ops Lead, SaaS Startup'
  }
]
</script>

<template>
  <section
    id="testimonials"
    class="relative py-24 md:py-32 overflow-hidden"
    style="background: linear-gradient(180deg, oklch(93% 0.05 175 / 0.5) 0%, oklch(95% 0.028 80) 100%);"
  >
    <!-- Background wash -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background:
        radial-gradient(ellipse 40% 30% at 15% 20%, oklch(90% 0.08 85 / 0.35) 0%, transparent 60%),
        radial-gradient(ellipse 40% 30% at 85% 80%, oklch(88% 0.1 175 / 0.4) 0%, transparent 65%);"
    ></div>

    <div class="relative max-w-7xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="max-w-2xl mb-16">
        <div class="inline-flex items-center gap-2 rounded-full bg-secondary/40 px-3 py-1 text-xs font-medium tracking-wide mb-4">
          <span class="text-base-content/80">Testimonials</span>
        </div>
        <h2 class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
          Founders who got their
          <span class="italic text-primary">evenings back</span>.
        </h2>
        <p class="mt-5 text-lg text-base-content/70 leading-relaxed">
          What real operators say after their first 60 days on the platform.
        </p>
      </div>

      <!-- Masonry-ish grid: 1 featured + 4 standard -->
      <div class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <!-- Featured card spans 2 cols on lg -->
        <article v-reveal class="relative rounded-3xl bg-base-100 border border-base-300 p-7 md:p-8 lg:col-span-2 shadow-sm hover:shadow-lg transition-shadow flex flex-col">
          <div class="flex items-center justify-between mb-5">
            <svg class="w-10 h-10 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 7h4v4H7c0 3 2 4 2 4H5s-2-1-2-4V7c0-2 2-2 2-2h2v2zm10 0h4v4h-4c0 3 2 4 2 4h-4s-2-1-2-4V7c0-2 2-2 2-2h2v2z" opacity="0.25" />
              <path d="M3 11c0-3.5 2.5-6 6-6v3c-2 0-3 1.5-3 3v1h4v6H3zm12 0c0-3.5 2.5-6 6-6v3c-2 0-3 1.5-3 3v1h4v6h-7z" />
            </svg>
            <div class="flex gap-0.5">
              <svg v-for="n in 5" :key="n" class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.2L2 10l7.1-1.1z" />
              </svg>
            </div>
          </div>
          <p class="font-display text-2xl md:text-3xl leading-snug text-base-content/90 mb-7">
            {{ testimonials[0].quote }}
          </p>
          <div class="mt-auto flex items-center gap-4">
            <div class="w-14 h-14 rounded-full overflow-hidden ring-2 ring-primary/20 transition-transform duration-300 hover:scale-110" v-html="testimonials[0].avatar" />
            <div>
              <div class="font-semibold text-base-content">{{ testimonials[0].name }}</div>
              <div class="text-sm text-base-content/60">{{ testimonials[0].role }}</div>
            </div>
          </div>
        </article>

        <!-- Standard cards -->
        <article
          v-for="(t, i) in testimonials.slice(1)"
          :key="t.name"
          v-reveal="(i + 1) * 80"
          class="relative rounded-3xl bg-base-100 border border-base-300 p-6 md:p-7 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
        >
          <!-- 5-star row -->
          <div class="flex gap-0.5 mb-4">
            <svg v-for="n in 5" :key="n" class="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.2L2 10l7.1-1.1z" />
            </svg>
          </div>
          <p class="text-base-content/80 leading-relaxed mb-6">{{ t.quote }}</p>
          <div class="mt-auto flex items-center gap-3 pt-5 border-t border-base-300">
            <div class="w-11 h-11 rounded-full overflow-hidden ring-2 ring-secondary/40" v-html="t.avatar" />
            <div>
              <div class="font-semibold text-sm">{{ t.name }}</div>
              <div class="text-xs text-base-content/60">{{ t.role }}</div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rounded-full :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
