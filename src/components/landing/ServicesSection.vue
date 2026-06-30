<script setup lang="ts">
import AmbientGradient from './AmbientGradient.vue'
import { UserCheck, FileStack, Home, Megaphone, Settings, Search } from 'lucide-vue-next'

const services = [
  {
    category: 'Lead Management',
    icon: UserCheck,
    tasks: [
      'Speed-to-lead: respond to new inquiries within 5 minutes',
      'CRM updates and pipeline management (Follow Up Boss, KvCORE, LionDesk)',
      'Lead nurture sequences and drip campaign setup',
      'Database mining and past-client outreach',
      'Open house follow-up and feedback collection'
    ]
  },
  {
    category: 'Transaction Coordination',
    icon: FileStack,
    tasks: [
      'Contract-to-close file management',
      'Deadline tracking and compliance checklists',
      'Communication with all parties (lenders, attorneys, agents)',
      'Dotloop, SkySlope, and DocuSign management'
    ]
  },
  {
    category: 'Listing Support',
    icon: Home,
    tasks: [
      'MLS data entry and listing updates',
      'Schedule photography, staging, and virtual tours',
      'Write listing descriptions and marketing copy',
      'Showing coordination and feedback tracking',
      'Pre-listing packet preparation'
    ]
  },
  {
    category: 'Marketing & Social',
    icon: Megaphone,
    tasks: [
      'Social media content creation and scheduling',
      'Just Listed / Just Sold campaigns',
      'Email newsletter management',
      'Canva designs for flyers, postcards, and ads',
      'Video editing for property walkthroughs'
    ]
  },
  {
    category: 'Admin & Operations',
    icon: Settings,
    tasks: [
      'Calendar and appointment management',
      'Email inbox triage and response drafting',
      'Expense tracking and commission reconciliation',
      'Vendor coordination and invoice management',
      'Travel and event planning'
    ]
  },
  {
    category: 'Market Research',
    icon: Search,
    tasks: [
      'Comparable market analysis (CMA) prep',
      'Neighborhood research and area guides',
      'Expired and FSBO prospecting lists',
      'Investor deal analysis and underwriting support',
      'Market trend reports for client newsletters'
    ]
  }
]
</script>

<template>
  <section id="services" class="relative py-24 md:py-32 border-t border-base-300 overflow-hidden">
    <div class="absolute inset-0 pointer-events-none">
      <AmbientGradient :opacity="0.1" tone="blue" />
    </div>

    <div class="relative max-w-6xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center max-w-2xl mx-auto mb-14">
        <div class="flex items-center gap-3 mb-3 justify-center">
          <span class="text-xs font-medium uppercase tracking-wider text-primary">What Your VA Does</span>
        </div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Everything that's not selling.
        </h2>
        <p class="mt-4 text-base text-base-content/60 leading-relaxed">
          Your VA takes ownership of the tasks that eat your day so every hour you spend is dollar-productive.
        </p>
      </div>

      <!-- Service grid -->
      <div v-reveal="100" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children revealed">
        <div
          v-for="service in services"
          :key="service.category"
          class="relative border border-base-300 rounded-lg p-6 bg-base-100 hover:border-primary/30 transition-all duration-300 group"
        >
          <!-- Hover glow -->
          <div class="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/[0.02] to-purple-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div class="relative">
            <!-- Icon -->
            <div class="w-10 h-10 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center mb-4">
              <component :is="service.icon" class="w-5 h-5 text-primary" />
            </div>

            <h3 class="text-sm font-semibold text-base-content mb-4">{{ service.category }}</h3>
            <ul class="space-y-2">
              <li v-for="task in service.tasks" :key="task" class="flex items-start gap-2 text-xs text-base-content/60">
                <svg class="shrink-0 w-3.5 h-3.5 mt-0.5 text-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>{{ task }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
