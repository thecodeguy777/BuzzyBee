<script setup lang="ts">
// Direction E — "People, not software". Every dollar buys work, not a software tax.
// Flow: nav → hero (budget allocation) → software tax → platform → meet your VA
//        → how it works → industries → pricing → testimonials → faq → final CTA → footer
// Previous composition preserved in LandingPageClassic.vue.
import LandingNav from '@/components/landing/LandingNav.vue'
import HeroPeopleSection from '@/components/landing/HeroPeopleSection.vue'
import SoftwareTaxSection from '@/components/landing/SoftwareTaxSection.vue'
import PlatformSection from '@/components/landing/PlatformSection.vue'
import ArsenalHoneycombSection from '@/components/landing/ArsenalHoneycombSection.vue'
import ThreadOfWorkSection from '@/components/landing/ThreadOfWorkSection.vue'
import MeetVASection from '@/components/landing/MeetVASection.vue'
import VettedTalentSection from '@/components/landing/VettedTalentSection.vue'
import TheMatchSection from '@/components/landing/TheMatchSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import HandsFreeSection from '@/components/landing/HandsFreeSection.vue'
import IndustryStripSection from '@/components/landing/IndustryStripSection.vue'
import PricingSection from '@/components/landing/PricingSection.vue'
import TestimonialsSection from '@/components/landing/TestimonialsSection.vue'
import FaqSection from '@/components/landing/FaqSection.vue'
import TransformationSection from '@/components/landing/TransformationSection.vue'
import FinalCtaSection from '@/components/landing/FinalCtaSection.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'
</script>

<template>
  <div class="min-h-screen bg-base-100 text-base-content">
    <LandingNav />
    <HeroPeopleSection />
    <SoftwareTaxSection />
    <PlatformSection />
    <ArsenalHoneycombSection />
    <ThreadOfWorkSection />
    <MeetVASection />
    <VettedTalentSection />
    <TheMatchSection />
    <HowItWorksSection />
    <HandsFreeSection />
    <IndustryStripSection />
    <PricingSection />
    <TestimonialsSection />
    <FaqSection />
    <TransformationSection />
    <FinalCtaSection />
    <SiteFooter />
  </div>
</template>
