<script setup lang="ts">
import { RouterLink } from 'vue-router'
import WhoWeServeMenu from '@/components/landing/WhoWeServeMenu.vue'
</script>

<template>
  <header class="absolute top-0 left-0 right-0 z-30">
    <div class="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
      <RouterLink :to="{ name: 'landing' }" class="flex items-center gap-2">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 3 L27 9 V23 L16 29 L5 23 V9 Z" fill="var(--color-primary)" />
          <path d="M16 9 L22 12.5 V19.5 L16 23 L10 19.5 V12.5 Z" fill="var(--color-base-100)" />
        </svg>
        <span class="font-display text-xl font-semibold tracking-tight">BuzzyBee</span>
      </RouterLink>
      <nav class="hidden md:flex items-center gap-7 text-sm">
        <WhoWeServeMenu />
        <RouterLink :to="{ name: 'landing', hash: '#how' }" class="text-base-content/75 hover:text-primary transition-colors">How it works</RouterLink>
        <RouterLink :to="{ name: 'landing', hash: '#pricing' }" class="text-base-content/75 hover:text-primary transition-colors">Pricing</RouterLink>
        <RouterLink :to="{ name: 'landing', hash: '#why' }" class="text-base-content/75 hover:text-primary transition-colors">Why BuzzyBee</RouterLink>
        <RouterLink :to="{ name: 'landing', hash: '#faq' }" class="text-base-content/75 hover:text-primary transition-colors">FAQ</RouterLink>
      </nav>
      <a href="#contact" class="btn btn-primary btn-sm rounded-full px-5 shadow-md shadow-primary/20">Book a call</a>
    </div>
  </header>
</template>
