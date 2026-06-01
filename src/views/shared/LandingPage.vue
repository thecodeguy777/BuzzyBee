<script setup lang="ts">
import LandingNav from '@/components/landing/LandingNav.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import PainPointsSection from '@/components/landing/PainPointsSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import PartnershipJourneySection from '@/components/landing/PartnershipJourneySection.vue'
import PlatformSection from '@/components/landing/PlatformSection.vue'
import HiveMindAISection from '@/components/landing/HiveMindAISection.vue'
import ServicesSection from '@/components/landing/ServicesSection.vue'
import WhyUsSection from '@/components/landing/WhyUsSection.vue'
import PricingSection from '@/components/landing/PricingSection.vue'
import TestimonialsSection from '@/components/landing/TestimonialsSection.vue'
import FaqSection from '@/components/landing/FaqSection.vue'
import FinalCtaSection from '@/components/landing/FinalCtaSection.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'
</script>

<template>
  <div class="min-h-screen bg-base-100 text-base-content">
    <LandingNav />
    <HeroSection />
    <PainPointsSection />
    <HowItWorksSection />
    <!-- PREVIEW: temporary side-by-side render for comparison. Remove one or the other once decided. -->
    <PartnershipJourneySection />
    <PlatformSection />
    <HiveMindAISection />
    <ServicesSection />
    <WhyUsSection />
    <PricingSection />
    <TestimonialsSection />
    <FaqSection />
    <FinalCtaSection />
    <SiteFooter />
  </div>
</template>
