<script setup lang="ts">
import { ref } from 'vue'
import hivemindMark from '@/assets/landing/hivemind-mark.svg'

const mobileOpen = ref(false)
</script>

<template>
  <header class="fixed top-0 left-0 right-0 z-50 bg-base-100/90 backdrop-blur-md border-b border-base-300">
    <div class="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2">
        <img :src="hivemindMark" alt="HiveMind" class="w-7 h-auto" />
        <span class="text-base font-semibold tracking-tight">HiveMind</span>
      </a>

      <nav class="hidden md:flex items-center gap-7 text-[13px]">
        <a href="#software-tax" class="text-base-content/60 hover:text-base-content transition-colors">Why HiveMind</a>
        <a href="#platform" class="text-base-content/60 hover:text-base-content transition-colors">Platform</a>
        <a href="#how" class="text-base-content/60 hover:text-base-content transition-colors">How It Works</a>
        <a href="#pricing" class="text-base-content/60 hover:text-base-content transition-colors">Pricing</a>
        <a href="#faq" class="text-base-content/60 hover:text-base-content transition-colors">FAQ</a>
      </nav>

      <div class="flex items-center gap-3">
        <a href="#contact" class="hidden sm:inline-flex items-center gap-1.5 bg-primary text-primary-content text-[13px] font-medium px-4 py-1.5 rounded-md hover:opacity-90 transition-opacity">
          Get Started
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </a>
        <button
          class="md:hidden w-8 h-8 flex items-center justify-center rounded-md hover:bg-base-200 transition-colors"
          @click="mobileOpen = !mobileOpen"
          :aria-expanded="mobileOpen"
          aria-label="Toggle menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path v-if="!mobileOpen" d="M4 6h16M4 12h16M4 18h16" />
            <path v-else d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="mobileOpen" class="md:hidden border-t border-base-300 bg-base-100 px-6 py-4 space-y-1">
      <a href="#software-tax" class="block py-2 text-sm text-base-content/70" @click="mobileOpen = false">Why HiveMind</a>
      <a href="#platform" class="block py-2 text-sm text-base-content/70" @click="mobileOpen = false">Platform</a>
      <a href="#how" class="block py-2 text-sm text-base-content/70" @click="mobileOpen = false">How It Works</a>
      <a href="#pricing" class="block py-2 text-sm text-base-content/70" @click="mobileOpen = false">Pricing</a>
      <a href="#faq" class="block py-2 text-sm text-base-content/70" @click="mobileOpen = false">FAQ</a>
      <a href="#contact" class="block mt-2 text-center bg-primary text-primary-content text-sm font-medium px-4 py-2 rounded-md" @click="mobileOpen = false">Get Started</a>
    </div>
  </header>
</template>
