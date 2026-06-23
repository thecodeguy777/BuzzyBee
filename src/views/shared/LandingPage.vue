<script setup lang="ts">
// Direction E — "People, not software". Every dollar buys work, not a software tax.
// Flow: nav → hero (budget allocation) → software tax → platform → meet your VA
//        → how it works → industries → pricing → testimonials → faq → final CTA → footer
// Previous composition preserved in LandingPageClassic.vue.
import LandingNav from '@/components/landing/LandingNav.vue'
import HeroJourneySection from '@/components/landing/HeroJourneySection.vue'
import ProfessionalsShowcase from '@/components/landing/ProfessionalsShowcase.vue'
import SoftwareTaxSection from '@/components/landing/SoftwareTaxSection.vue'
import PlatformSection from '@/components/landing/PlatformSection.vue'
import ArsenalHoneycombSection from '@/components/landing/ArsenalHoneycombSection.vue'
import ThreadOfWorkSection from '@/components/landing/ThreadOfWorkSection.vue'
import MeetVASection from '@/components/landing/MeetVASection.vue'
import VettedTalentSection from '@/components/landing/VettedTalentSection.vue'
import RolesSection from '@/components/landing/RolesSection.vue'
import TheMatchSection from '@/components/landing/TheMatchSection.vue'
import HandsFreeSection from '@/components/landing/HandsFreeSection.vue'
import IndustryStripSection from '@/components/landing/IndustryStripSection.vue'
// Pricing + FAQ hidden for now — re-enable by uncommenting here and in <template>.
// import PricingSection from '@/components/landing/PricingSection.vue'
import TestimonialsSection from '@/components/landing/TestimonialsSection.vue'
// import FaqSection from '@/components/landing/FaqSection.vue'
import FinalCtaSection from '@/components/landing/FinalCtaSection.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'
</script>

<template>
  <div class="landing-surface min-h-screen bg-base-100 text-base-content">
    <LandingNav flush-dark />
    <HeroJourneySection />
    <!-- People first: lead with who you hire, then the software they work in -->
    <ProfessionalsShowcase />
    <MeetVASection />
    <VettedTalentSection />
    <!-- The roles catalog: who/quality above → what roles you can staff → software tax -->
    <RolesSection />
    <SoftwareTaxSection />
    <PlatformSection />
    <ArsenalHoneycombSection />
    <ThreadOfWorkSection />
    <!-- Done for you: the card-stack match hook + the 7-day path (merged) -->
    <TheMatchSection />
    <HandsFreeSection />
    <IndustryStripSection />
    <!-- <PricingSection /> hidden for now -->
    <TestimonialsSection />
    <!-- <FaqSection /> hidden for now -->
    <FinalCtaSection />
    <SiteFooter />
  </div>
</template>
