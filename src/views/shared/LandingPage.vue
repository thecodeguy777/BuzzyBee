<script setup lang="ts">
import LandingNav from '@/components/landing/LandingNav.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import PainPointsSection from '@/components/landing/PainPointsSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import PlatformSection from '@/components/landing/PlatformSection.vue'
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
    <PlatformSection />
    <ServicesSection />
    <WhyUsSection />
    <PricingSection />
    <TestimonialsSection />
    <FaqSection />
    <FinalCtaSection />
    <SiteFooter />
  </div>
</template>
