<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import {
  Building2, ShoppingBag, Megaphone, GraduationCap,
  Briefcase, HardHat, HeartPulse, Hotel,
} from 'lucide-vue-next'

// Each industry shows the kind of work a screened VA already handles there —
// concrete, people-first, one vertical among many.
const industries = [
  { name: 'Real Estate', icon: Building2, work: 'Listing coordination, CRM follow-up, transaction docs' },
  { name: 'E-commerce', icon: ShoppingBag, work: 'Order support, product listings, returns & reviews' },
  { name: 'Agencies', icon: Megaphone, work: 'Project coordination, reporting, client comms' },
  { name: 'Coaches', icon: GraduationCap, work: 'Scheduling, content prep, community management' },
  { name: 'Pro Services', icon: Briefcase, work: 'Client intake, billing, calendar & inbox' },
  { name: 'Construction', icon: HardHat, work: 'Estimates, scheduling, supplier follow-up' },
  { name: 'Wellness', icon: HeartPulse, work: 'Bookings, reminders, client care' },
  { name: 'Hospitality', icon: Hotel, work: 'Reservations, reviews, guest support' },
]
</script>

<template>
  <section class="relative py-20 md:py-28 border-t border-base-300 bg-base-200 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.1" tone="mixed" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <div v-reveal class="text-center max-w-2xl mx-auto mb-12">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <span class="text-xs font-medium uppercase tracking-wider text-primary">Who it's for</span>
        </div>
        <h2 class="font-display text-2xl md:text-3xl tracking-tight leading-tight text-base-content">
          A professional who already knows your world.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          We match you with someone trained for your industry's tools and workflows. Productive from week one, not month three.
        </p>
      </div>

      <div v-reveal="100" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
        <div
          v-for="ind in industries"
          :key="ind.name"
          class="group relative flex flex-col border border-base-300 rounded-xl bg-base-100 p-5 hover:border-primary/30 hover:shadow-lg transition-all duration-300"
        >
          <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-plum/10 border border-primary/15 flex items-center justify-center mb-3.5 group-hover:scale-105 transition-transform">
            <component :is="ind.icon" class="w-5 h-5 text-primary" :stroke-width="1.9" />
          </div>
          <h3 class="text-[15px] font-semibold text-base-content">{{ ind.name }}</h3>
          <p class="mt-1.5 text-[13px] text-base-content/55 leading-relaxed">{{ ind.work }}</p>
        </div>
      </div>

      <p v-reveal="200" class="mt-9 text-center text-sm text-base-content/55">
        Don't see yours? <a href="#contact" class="font-medium text-primary hover:underline">We staff for it too →</a>
      </p>
    </div>
  </section>
</template>
