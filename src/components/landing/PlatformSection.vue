<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import PlatformDashboardMock from './PlatformDashboardMock.vue'
import { Clock, LayoutList, MessageCircle, FileText, BookOpen, BarChart3 } from 'lucide-vue-next'

const tools = [
  {
    name: 'HiveTrack',
    type: 'Time & Attendance',
    description: 'Automated clock-in/out, activity logging, and real-time hours dashboard. Know exactly what your VA is working on.',
    replaces: 'Time Doctor, Hubstaff',
    icon: Clock
  },
  {
    name: 'HiveFlow',
    type: 'Task Management',
    description: 'Boards, priorities, deadlines, and recurring tasks. Assign work, track progress, and never lose a thread.',
    replaces: 'Asana, Monday, ClickUp',
    icon: LayoutList
  },
  {
    name: 'HiveChat',
    type: 'Team Messaging',
    description: 'Real-time messaging between you, your VA, and your PM. Threads, files, and search built in.',
    replaces: 'Slack, Microsoft Teams',
    icon: MessageCircle
  },
  {
    name: 'HiveReport',
    type: 'Daily EOD Reports',
    description: 'Automated end-of-day reports delivered to your inbox. Accomplishments, blockers, and tomorrow\'s plan in 60 seconds.',
    replaces: 'Google Forms, manual emails',
    icon: FileText
  },
  {
    name: 'HiveBook',
    type: 'Client Playbook',
    description: 'Living documentation of your preferences, processes, and brand voice. Your VA never has to ask the same question twice.',
    replaces: 'Google Docs, Notion',
    icon: BookOpen
  },
  {
    name: 'HiveReview',
    type: 'Performance Analytics',
    description: 'Quarterly reviews auto-generated from daily data. Trends, metrics, and insights without manual tracking.',
    replaces: 'Spreadsheets, manual QPRs',
    icon: BarChart3
  }
]
</script>

<template>
  <section id="platform" class="relative py-24 md:py-32 border-t border-base-300 bg-base-200 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.15" tone="mixed" />
    </div>

    <!-- Floating geometric accents -->
    <div class="absolute top-16 right-12 w-16 h-16 pointer-events-none hidden lg:block animate-float opacity-20">
      <svg viewBox="0 0 64 64" fill="none" stroke="url(#geo-grad-1)" stroke-width="1">
        <defs><linearGradient id="geo-grad-1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs>
        <polygon points="32,4 60,32 32,60 4,32" />
        <polygon points="32,14 50,32 32,50 14,32" />
      </svg>
    </div>
    <div class="absolute bottom-20 left-8 w-12 h-12 pointer-events-none hidden lg:block animate-float opacity-15" style="animation-delay: -2s;">
      <svg viewBox="0 0 48 48" fill="none" stroke="url(#geo-grad-2)" stroke-width="1">
        <defs><linearGradient id="geo-grad-2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs>
        <polygon points="24,2 46,14 46,34 24,46 2,34 2,14" />
      </svg>
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-14">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-purple-500"></div>
          <span class="text-xs font-medium uppercase tracking-wider text-primary">The Platform</span>
          <div class="w-8 h-0.5 rounded-full bg-gradient-to-l from-primary to-purple-500"></div>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          All tools included. Zero extra software costs.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Every HiveMind plan includes our proprietary platform. Six integrated tools that replace $200+/month in SaaS subscriptions. One connected hive. Nothing falls through the cracks.
        </p>
        <a href="#contact" class="inline-flex items-center gap-2 mt-6 text-sm font-medium bg-gradient-to-r from-primary to-purple-600 text-white px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity">
          Book a platform demo
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      <!-- Tool cards -->
      <div v-reveal="100" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
        <div
          v-for="tool in tools"
          :key="tool.name"
          class="relative border border-base-300 rounded-lg p-6 bg-base-100 group hover:border-primary/30 transition-all duration-300"
        >
          <!-- Hover glow -->
          <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/[0.02] to-purple-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div class="relative">
            <!-- Icon -->
            <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center mb-4">
              <component :is="tool.icon" class="w-5 h-5 text-primary" />
            </div>

            <!-- Tool name -->
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-semibold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">{{ tool.name }}</span>
            </div>
            <div class="text-[11px] text-base-content/50 uppercase tracking-wider mb-3">{{ tool.type }}</div>
            <p class="text-xs text-base-content/60 leading-relaxed mb-4">{{ tool.description }}</p>
            <div class="pt-3 border-t border-base-300">
              <span class="text-[10px] text-base-content/40 uppercase tracking-wider">Replaces: </span>
              <span class="text-[10px] text-base-content/60">{{ tool.replaces }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Dashboard Mockup — actual HiveFlow Kanban with realistic real-estate tasks -->
      <div v-reveal="200" class="mt-12">
        <PlatformDashboardMock />
      </div>

      <!-- Bottom note -->
      <div v-reveal="250" class="mt-8 text-center border border-base-300 rounded-lg p-5 bg-base-100">
        <p class="text-sm text-base-content/70">
          <span class="font-semibold text-base-content">$0 extra per month.</span>
          All platform tools are included in every plan. No per-seat fees. No add-ons.
          Your VA, your PM, and you all work inside one connected system.
        </p>
      </div>
    </div>
  </section>
</template>
