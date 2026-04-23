<script setup lang="ts">
import { ref } from 'vue'
import rawBeeSitting from '@/assets/bee-sitting.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const beeSittingSrc = prefixSvgIds(rawBeeSitting, 'faq-beesit')

const faqs = [
  {
    q: 'How fast can I have a VA working?',
    a: 'From first call to a VA sending their first EOD report is typically 7 days. We shortlist 3 candidates within 72 hours, you interview one or two, then we run a 7-day ramp with playbooks, SOPs, and weekly check-ins.'
  },
  {
    q: 'What if the match isn\'t right?',
    a: 'You can swap at any time. We re-shortlist within 5 business days, no fee, no drama. Our vetting funnel means a swap is rare, but the guarantee is always there.'
  },
  {
    q: 'Are these full-time hires, or contractors?',
    a: 'Every BuzzyBee VA is full-time on your account, Monday to Friday, in your preferred time zone. They\'re employed by BuzzyBee PH, which handles payroll, taxes, and benefits. You get one flat monthly invoice in USD.'
  },
  {
    q: 'Who manages the VA day-to-day?',
    a: 'You do, with us as the safety net. A BuzzyBee project manager reviews EOD reports, runs weekly 1:1s with your VA, and runs a quarterly partnership review with you. Performance issues get caught early.'
  },
  {
    q: 'What tools do you integrate with?',
    a: 'Google Workspace, Microsoft 365, Notion, ClickUp, Asana, Monday, HubSpot, Salesforce, Slack, Shopify, Xero, QuickBooks, and most modern SaaS. If your stack is unusual, tell us during the discovery call and we\'ll match a VA with that experience.'
  },
  {
    q: 'How do you handle data security?',
    a: 'VAs work on BuzzyBee-provisioned machines with password managers, MFA, and a locked-down extension policy. We sign NDAs by default and can sign custom DPAs for regulated industries. No client data is stored on personal devices.'
  },
  {
    q: 'Can I hire for specialized roles (dev, marketing ops, bookkeeping)?',
    a: 'Yes. Our Professional and Development tiers are designed for specialists. Tell us the role, the tools, and the desired outcomes, and we\'ll build a shortlist with verified skills.'
  },
  {
    q: 'What\'s the minimum commitment?',
    a: 'Month to month. No annual contracts. Cancel anytime with 14 days\' notice.'
  }
]

const openIndex = ref<number | null>(0)

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i
}
</script>

<template>
  <section id="faq" class="relative bg-base-100 py-24 md:py-32 overflow-hidden">
    <!-- Background wash -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background: radial-gradient(ellipse 50% 40% at 50% 100%, oklch(90% 0.08 85 / 0.3) 0%, transparent 65%);"
    ></div>

    <div class="relative max-w-4xl mx-auto px-6">
      <!-- Decorative sitting bee — bottom-left, peeking up -->
      <div class="absolute bottom-0 -left-16 xl:-left-32 w-64 lg:w-80 h-64 lg:h-80 pointer-events-none hidden lg:block anim-bob">
        <div class="w-full h-full" v-html="beeSittingSrc" />
      </div>

      <!-- Header -->
      <div v-reveal class="text-center mb-14">
        <div class="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium tracking-wide mb-4">
          <span class="text-primary">FAQ</span>
        </div>
        <h2 class="font-display text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
          Questions, answered.
        </h2>
        <p class="mt-5 text-lg text-base-content/70 leading-relaxed max-w-xl mx-auto">
          The stuff every founder asks before their first call. If yours isn’t here, bring it to the discovery call.
        </p>
      </div>

      <!-- FAQ list -->
      <ul class="space-y-3">
        <li
          v-for="(faq, i) in faqs"
          :key="faq.q"
          v-reveal="i * 50"
          class="rounded-2xl border border-base-300 bg-base-100 overflow-hidden transition-all duration-300"
          :class="openIndex === i ? 'shadow-md border-primary/40' : 'shadow-sm hover:border-primary/25'"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-4 text-left px-6 py-5 cursor-pointer hover:bg-base-200/40 transition-colors"
            :aria-expanded="openIndex === i"
            @click="toggle(i)"
          >
            <span class="font-display text-lg md:text-xl font-semibold leading-snug">{{ faq.q }}</span>
            <span
              class="shrink-0 w-8 h-8 rounded-full border border-primary/30 flex items-center justify-center text-primary transition-transform"
              :class="openIndex === i ? 'rotate-45 bg-primary/10' : ''"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </button>
          <div
            v-show="openIndex === i"
            class="px-6 pb-6 text-base-content/75 leading-relaxed"
          >
            {{ faq.a }}
          </div>
        </li>
      </ul>

      <!-- Footer CTA -->
      <div class="mt-12 text-center">
        <p class="text-base-content/70 mb-4">Still on the fence?</p>
        <a href="#contact" class="btn btn-primary rounded-full px-6 shadow-md shadow-primary/20">
          Book a discovery call
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  </section>
</template>
