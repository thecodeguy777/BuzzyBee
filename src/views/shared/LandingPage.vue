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
</script>

<template>
  <div class="min-h-screen bg-base-100 text-base-content">
    <header class="absolute top-0 left-0 right-0 z-30">
      <div class="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="/" class="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 3 L27 9 V23 L16 29 L5 23 V9 Z" fill="var(--color-primary)" />
            <path d="M16 9 L22 12.5 V19.5 L16 23 L10 19.5 V12.5 Z" fill="var(--color-base-100)" />
          </svg>
          <span class="font-display text-xl font-semibold tracking-tight">BuzzyBee</span>
        </a>
        <nav class="hidden md:flex items-center gap-8 text-sm">
          <a href="#how" class="text-base-content/75 hover:text-primary transition-colors">How it works</a>
          <a href="#pricing" class="text-base-content/75 hover:text-primary transition-colors">Pricing</a>
          <a href="#why" class="text-base-content/75 hover:text-primary transition-colors">Why BuzzyBee</a>
          <a href="#faq" class="text-base-content/75 hover:text-primary transition-colors">FAQ</a>
        </nav>
        <a href="#contact" class="btn btn-primary btn-sm rounded-full px-5 shadow-md shadow-primary/20">Book a call</a>
      </div>
    </header>

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
