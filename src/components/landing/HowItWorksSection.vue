<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import { Phone, Users, Rocket, Headphones, TrendingUp } from 'lucide-vue-next'
import discoveryImg from '@/assets/landing/how-discovery-call.webp'
import managedImg from '@/assets/landing/how-managed-call.webp'
import teamImg from '@/assets/landing/how-team-call.webp'

const steps = [
  { num: '01', title: 'Discovery call', body: 'A 20-minute call to understand your business: team size, transaction volume, tools you use, and what\'s eating your time.', icon: Phone },
  { num: '02', title: 'Curated match', body: 'Within 72 hours, we shortlist 3 pre-vetted VAs who know real estate workflows, your CRM, and your time zone.', icon: Users },
  { num: '03', title: '7-day onboarding', body: 'Your VA learns your playbook, brokerage systems, and communication style. By day 7, they\'re handling tasks independently.', icon: Rocket },
  { num: '04', title: 'Managed support', body: 'A project manager runs daily check-ins, weekly reports, and quarterly reviews. Problems get caught before you feel them.', icon: Headphones },
  { num: '05', title: 'Scale your team', body: 'Add a transaction coordinator, a marketing VA, or a second admin as your production grows. One platform, unlimited growth.', icon: TrendingUp }
]
</script>

<template>
  <section id="how" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.12" tone="blue" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="max-w-2xl mb-14">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-purple-500"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">How It Works</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          From first call to a working VA in seven days.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          No job boards. No resume stacks. No training someone from scratch. We handle matching, onboarding, and ongoing management. You just delegate.
        </p>
      </div>

      <!-- Steps with connecting line -->
      <div v-reveal="150" class="relative">
        <!-- Gradient connecting line (desktop) -->
        <div class="hidden md:block absolute top-8 left-[10%] right-[10%] h-px bg-gradient-to-r from-primary via-purple-500 to-primary/30"></div>

        <div class="grid gap-6 md:grid-cols-5">
          <div
            v-for="step in steps"
            :key="step.num"
            class="relative text-center"
          >
            <!-- Step icon circle -->
            <div class="relative mx-auto w-16 h-16 rounded-full border border-base-300 bg-base-100 flex items-center justify-center mb-4 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10 transition-all duration-300">
              <component :is="step.icon" class="w-6 h-6 text-primary" />
            </div>
            <div class="font-mono text-[10px] tracking-wider text-primary/60 mb-1">{{ step.num }}</div>
            <h3 class="text-sm font-semibold text-base-content mb-2">{{ step.title }}</h3>
            <p class="text-xs text-base-content/55 leading-relaxed">{{ step.body }}</p>
          </div>
        </div>
      </div>

      <!-- Three supporting visuals: discovery, managed, scale -->
      <div v-reveal="200" class="mt-14 grid md:grid-cols-3 gap-5">
        <div class="relative rounded-xl overflow-hidden border border-base-300 shadow-sm aspect-[4/3] group">
          <img :src="discoveryImg" alt="Discovery call" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-t from-base-content/70 to-transparent"></div>
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="text-[10px] uppercase tracking-wider text-white/70 mb-1">Step 01</div>
            <div class="text-sm font-semibold text-white">Discovery Call</div>
          </div>
        </div>
        <div class="relative rounded-xl overflow-hidden border border-base-300 shadow-sm aspect-[4/3] group">
          <img :src="managedImg" alt="Managed support video call" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-t from-base-content/70 to-transparent"></div>
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="text-[10px] uppercase tracking-wider text-white/70 mb-1">Step 04</div>
            <div class="text-sm font-semibold text-white">Managed Support</div>
          </div>
        </div>
        <div class="relative rounded-xl overflow-hidden border border-base-300 shadow-sm aspect-[4/3] group">
          <img :src="teamImg" alt="Scaled team meeting" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-t from-base-content/70 to-transparent"></div>
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="text-[10px] uppercase tracking-wider text-white/70 mb-1">Step 05</div>
            <div class="text-sm font-semibold text-white">Scale Your Team</div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="mt-12 flex flex-wrap items-center gap-4 justify-center">
        <a href="#contact" class="inline-flex items-center gap-2 bg-primary text-primary-content font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm">
          Start with a discovery call
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
        <span class="text-xs text-base-content/50">20 minutes · No commitment · Free</span>
      </div>
    </div>
  </section>
</template>
