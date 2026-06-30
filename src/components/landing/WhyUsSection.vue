<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import { GraduationCap, Monitor, Heart, Zap } from 'lucide-vue-next'
import teamNetworkImg from '@/assets/landing/why-team-network.webp'

const pillars = [
  {
    title: 'Real estate trained, day one.',
    body: 'Your VA arrives knowing Follow Up Boss, KvCORE, Dotloop, and the transaction lifecycle. No generic admin. They speak realtor.',
    stat: '40+',
    statLabel: 'real estate tools mastered',
    icon: GraduationCap
  },
  {
    title: 'One platform, zero chaos.',
    body: 'EOD reports, time tracking, task management, and PM check-ins live in a single dashboard. Replace the Slack + Drive + Time Doctor sprawl.',
    stat: '1 tool',
    statLabel: 'vs. 5-8 SaaS seats',
    icon: Monitor
  },
  {
    title: 'We pay VAs more. You get better talent.',
    body: 'Our VAs earn 30-50% above market median. Top talent applies to us first and stays longer, so your playbook compounds instead of resetting every 6 months.',
    stat: '94%',
    statLabel: 'VA retention rate',
    icon: Heart
  },
  {
    title: 'AI-augmented productivity.',
    body: 'Every VA is trained on ChatGPT, Claude, and real estate automation tools. They move 2-3x faster on listing descriptions, email drafts, and market research.',
    stat: '2-3x',
    statLabel: 'throughput on repetitive tasks',
    icon: Zap
  }
]
</script>

<template>
  <section id="why" class="relative py-24 md:py-32 border-t border-base-300 bg-base-200 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.13" tone="purple" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header with side-by-side visual -->
      <div class="grid lg:grid-cols-[1fr_minmax(0,360px)] gap-10 items-center mb-14">
        <div v-reveal class="max-w-2xl">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-xs font-medium uppercase tracking-wider text-primary">Why BuzzyHive</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Not just a VA. A real estate machine.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Most VA services give you a generic admin who needs 3 months to learn your industry. We give you someone who already knows it, managed by people who've run the playbook inside leading agencies.
        </p>
        </div>

        <!-- Team network visual -->
        <div v-reveal="100" class="hidden lg:block relative aspect-[4/3] rounded-2xl overflow-hidden border border-base-300 shadow-lg">
          <img :src="teamNetworkImg" alt="VA connected to a team network" class="w-full h-full object-cover" loading="lazy" decoding="async" />
          <div class="absolute inset-0 bg-gradient-to-tr from-primary/15 via-transparent to-purple-500/10 pointer-events-none"></div>
        </div>
      </div>

      <!-- Pillar cards -->
      <div v-reveal="100" class="grid gap-4 md:grid-cols-2 stagger-children revealed">
        <div
          v-for="p in pillars"
          :key="p.title"
          class="relative border border-base-300 rounded-lg p-8 bg-base-100 group hover:border-primary/30 transition-all duration-300"
        >
          <!-- Gradient left accent -->
          <div class="absolute top-4 bottom-4 left-0 w-px bg-gradient-to-b from-primary via-purple-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div class="flex items-start gap-5">
            <!-- Icon -->
            <div class="shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center">
              <component :is="p.icon" class="w-6 h-6 text-primary" />
            </div>
            <div class="flex-1">
              <h3 class="text-base font-semibold text-base-content mb-2">{{ p.title }}</h3>
              <p class="text-sm text-base-content/60 leading-relaxed mb-5">{{ p.body }}</p>
              <div class="flex items-baseline gap-3 pt-4 border-t border-base-300">
                <span class="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">{{ p.stat }}</span>
                <span class="text-[11px] uppercase tracking-wider text-base-content/45 font-medium">{{ p.statLabel }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
