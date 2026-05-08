<script setup lang="ts">
const year = new Date().getFullYear()

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Services', href: '#services' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQ', href: '#faq' }
    ]
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Contact', href: 'mailto:hello@hivemind.co' }
    ]
  },
  {
    title: 'Resources',
    links: [
      { label: 'Real estate VA guide', href: '#' },
      { label: 'Security & privacy', href: '#' },
      { label: 'Blog', href: '#' }
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
            <div class="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span class="text-sm font-semibold tracking-tight">HiveMind</span>
          </a>
          <p class="text-xs text-base-content/50 leading-relaxed max-w-xs">
            Pre-vetted virtual assistants for real estate professionals. Managed on a platform built for the job.
          </p>
        </div>

        <!-- Link columns -->
        <div v-for="col in columns" :key="col.title">
          <h3 class="text-[11px] font-medium uppercase tracking-wider text-base-content/40 mb-3">{{ col.title }}</h3>
          <ul class="space-y-2">
            <li v-for="link in col.links" :key="link.label">
              <a :href="link.href" class="text-xs text-base-content/60 hover:text-primary transition-colors">{{ link.label }}</a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom row -->
      <div class="mt-8 pt-5 border-t border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-base-content/40">
        <div>&copy; {{ year }} HiveMind. All rights reserved.</div>
        <div class="flex items-center gap-4">
          <a href="#" class="hover:text-primary transition-colors">Privacy</a>
          <a href="#" class="hover:text-primary transition-colors">Terms</a>
          <a href="#" class="hover:text-primary transition-colors">Security</a>
        </div>
      </div>
    </div>
  </footer>
</template>
