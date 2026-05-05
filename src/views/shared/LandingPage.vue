<script setup lang="ts">
import HeroSection from '@/components/landing/HeroSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import WhyUsSection from '@/components/landing/WhyUsSection.vue'
import PricingSection from '@/components/landing/PricingSection.vue'
import TestimonialsSection from '@/components/landing/TestimonialsSection.vue'
import FaqSection from '@/components/landing/FaqSection.vue'
import FinalCtaSection from '@/components/landing/FinalCtaSection.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'
import SectionWave from '@/components/landing/SectionWave.vue'
import LandingNav from '@/components/landing/LandingNav.vue'
</script>

<template>
  <div class="min-h-screen bg-base-100 text-base-content">
    <LandingNav />

    <HeroSection />
    <SectionWave variant="amber-mint" />
    <HowItWorksSection />
    <SectionWave variant="mint-amber" />
    <WhyUsSection />
    <SectionWave variant="cream" />
    <PricingSection />
    <SectionWave variant="amber-mint" />
    <TestimonialsSection />
    <SectionWave variant="mint-amber" />
    <FaqSection />
    <SectionWave variant="cream" />
    <FinalCtaSection />
    <SiteFooter />
  </div>
</template>
