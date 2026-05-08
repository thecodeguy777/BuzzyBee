<script setup lang="ts">
import { ref } from 'vue'

const faqs = [
  {
    q: 'How fast can I have a VA working?',
    a: 'From first call to a VA sending their first EOD report is typically 7 days. We shortlist 3 candidates within 72 hours, you interview your top pick, then we run a 7-day ramp with your specific systems, playbooks, and workflows.'
  },
  {
    q: 'Do they know real estate tools?',
    a: 'Yes. Our VAs are specifically trained on real estate workflows before placement. Common tools include Follow Up Boss, KvCORE, LionDesk, Dotloop, SkySlope, DocuSign, Canva, and all major MLS systems. If you use something specific, tell us during discovery and we\'ll match accordingly.'
  },
  {
    q: 'What if the match isn\'t right?',
    a: 'You can swap at any time. We re-shortlist within 5 business days, no fee, no drama. Our vetting funnel means swaps are rare (under 6%), but the guarantee is always there.'
  },
  {
    q: 'Are these full-time or part-time?',
    a: 'Full-time, 160 hours per month, Monday to Friday, in your preferred time zone. Your VA is dedicated to you, not shared across multiple agents. They\'re employed by HiveMind, which handles payroll, benefits, and equipment.'
  },
  {
    q: 'Who manages the VA day-to-day?',
    a: 'You assign the work. We provide the management layer. A HiveMind project manager reviews daily EOD reports, runs weekly 1:1s with your VA, and conducts quarterly reviews with you. Performance issues get caught early, before they affect your business.'
  },
  {
    q: 'Can my VA handle transaction coordination?',
    a: 'Absolutely. Our Top Producer tier and above includes VAs trained specifically in contract-to-close management: deadline tracking, vendor coordination, document management, and communication with all parties.'
  },
  {
    q: 'How do you handle data security?',
    a: 'VAs work on HiveMind-provisioned machines with password managers, MFA, and a locked-down browser policy. We sign NDAs by default and can execute custom data protection agreements for brokerages with compliance requirements.'
  },
  {
    q: 'What\'s the minimum commitment?',
    a: '3 months. After that, cancel anytime with 14 days\' notice. We keep it simple because we know the work speaks for itself.'
  }
]

const openIndex = ref<number | null>(0)

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i
}
</script>

<template>
  <section id="faq" class="relative py-24 md:py-32 border-t border-base-300">
    <div class="max-w-3xl mx-auto px-6">
      <!-- Header -->
      <div v-reveal class="text-center mb-12">
        <div class="text-xs font-medium uppercase tracking-wider text-primary mb-3">FAQ</div>
        <h2 class="font-display text-3xl md:text-4xl tracking-tight leading-tight text-base-content">
          Questions agents ask before their first call.
        </h2>
      </div>

      <!-- FAQ list -->
      <div v-reveal="100" class="border border-base-300 rounded-lg overflow-hidden divide-y divide-base-300">
        <div
          v-for="(faq, i) in faqs"
          :key="faq.q"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-4 text-left px-6 py-4 cursor-pointer hover:bg-base-200/50 transition-colors"
            :aria-expanded="openIndex === i"
            @click="toggle(i)"
          >
            <span class="text-sm font-medium text-base-content leading-snug">{{ faq.q }}</span>
            <span
              class="shrink-0 w-5 h-5 flex items-center justify-center text-base-content/40 transition-transform"
              :class="openIndex === i ? 'rotate-45' : ''"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </button>
          <div
            v-show="openIndex === i"
            class="px-6 pb-4 text-sm text-base-content/60 leading-relaxed"
          >
            {{ faq.a }}
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="mt-10 text-center">
        <p class="text-sm text-base-content/50 mb-3">Ready to get your time back?</p>
        <a href="#contact" class="inline-flex items-center gap-2 bg-primary text-primary-content font-medium px-5 py-2.5 rounded-md hover:opacity-90 transition-opacity text-sm">
          Book a discovery call
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
      </div>
    </div>
  </section>
</template>
