<script setup lang="ts">
import hivemindMark from '@/assets/landing/hivemind-mark.svg'

const year = new Date().getFullYear()

// Only real, working destinations are listed. Aspirational pages (About,
// Careers, Blog, VA guide) and the legal pages (Privacy, Terms, Security) were
// removed rather than shipped as dead href="#" links — re-add them here as real
// routed pages before public launch.
const columns = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'The people', href: '#professionals' },
      { label: 'The platform', href: '#platform' }
    ]
  },
  {
    title: 'Get started',
    links: [
      { label: 'Book a discovery call', href: '#contact' },
      { label: 'Email us', href: 'mailto:hello@hivemind.co' }
    ]
  }
]
</script>

<template>
  <footer class="border-t border-base-300">
    <div class="max-w-6xl mx-auto px-6 py-10">
      <div class="grid gap-8 sm:grid-cols-4">
        <!-- Brand -->
        <div class="sm:col-span-4 md:col-span-1">
          <a href="/" class="flex items-center gap-2 mb-3">
            <img :src="hivemindMark" alt="HiveMind" class="w-6 h-auto" />
            <span class="text-sm font-semibold tracking-tight">HiveMind</span>
          </a>
          <p class="text-xs text-base-content/50 leading-relaxed max-w-xs">
            Pre-screened virtual assistants for real estate professionals. Managed on a platform built for the job.
          </p>
        </div>

        <!-- Link columns -->
        <div v-for="col in columns" :key="col.title">
          <h3 class="text-[11px] font-medium uppercase tracking-wider text-base-content/40 mb-3">{{ col.title }}</h3>
          <ul class="space-y-2">
            <li v-for="link in col.links" :key="link.label">
              <a :href="link.href" class="block py-1.5 text-xs text-base-content/60 hover:text-primary transition-colors">{{ link.label }}</a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom row. Legal links (Privacy / Terms / Security) intentionally omitted
           until they point at real pages — add them back here before public launch. -->
      <div class="mt-8 pt-5 border-t border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-base-content/40">
        <div class="flex items-center gap-2.5">
          <img :src="hivemindMark" alt="HiveMind" class="w-5 h-auto opacity-80" />
          <span>&copy; {{ year }} HiveMind. All rights reserved.</span>
        </div>
        <a href="#contact" class="inline-block py-1 hover:text-primary transition-colors">Book a discovery call &rarr;</a>
      </div>
    </div>
  </footer>
</template>
