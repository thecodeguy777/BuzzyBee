<script setup lang="ts">
const year = new Date().getFullYear()

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Why BuzzyBee', href: '#why' },
      { label: 'FAQ', href: '#faq' }
    ]
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Contact', href: 'mailto:hello@buzzybee.co' }
    ]
  },
  {
    title: 'Resources',
    links: [
      { label: 'Role scoping guide', href: '#' },
      { label: 'Security & privacy', href: '#' }
    ]
  }
]
</script>

<template>
  <footer class="bg-base-200 border-t border-base-300">
    <div class="max-w-7xl mx-auto px-6 py-10">
      <div class="grid gap-8 sm:grid-cols-4">
        <!-- Brand -->
        <div class="sm:col-span-4 md:col-span-1">
          <a href="/" class="flex items-center gap-2 mb-3">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M16 3 L27 9 V23 L16 29 L5 23 V9 Z" fill="var(--color-primary)" />
              <path d="M16 9 L22 12.5 V19.5 L16 23 L10 19.5 V12.5 Z" fill="var(--color-base-200)" />
            </svg>
            <span class="font-display text-lg font-semibold tracking-tight">BuzzyBee</span>
          </a>
          <p class="text-sm text-base-content/65 leading-relaxed max-w-xs">
            Pre-vetted Filipino VAs for U.S. small businesses. Managed on a platform built for the job.
          </p>
          <div class="mt-4 flex items-center gap-2">
            <a href="#" aria-label="LinkedIn" class="w-8 h-8 rounded-full border border-base-300 flex items-center justify-center text-base-content/60 hover:text-primary hover:border-primary/40 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.13 1.44-2.13 2.93v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.35-1.85 3.58 0 4.24 2.36 4.24 5.43v6.31zM5.34 7.43A2.06 2.06 0 113.28 5.37a2.06 2.06 0 012.06 2.06zM3.56 20.45h3.56V9H3.56v11.45z"/></svg>
            </a>
            <a href="#" aria-label="X" class="w-8 h-8 rounded-full border border-base-300 flex items-center justify-center text-base-content/60 hover:text-primary hover:border-primary/40 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="#" aria-label="Instagram" class="w-8 h-8 rounded-full border border-base-300 flex items-center justify-center text-base-content/60 hover:text-primary hover:border-primary/40 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/></svg>
            </a>
          </div>
        </div>

        <!-- Link columns -->
        <div v-for="col in columns" :key="col.title">
          <h3 class="font-semibold text-xs uppercase tracking-[0.14em] text-base-content/55 mb-3">{{ col.title }}</h3>
          <ul class="space-y-2">
            <li v-for="link in col.links" :key="link.label">
              <a :href="link.href" class="text-sm text-base-content/75 hover:text-primary transition-colors">{{ link.label }}</a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom row -->
      <div class="mt-8 pt-5 border-t border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-base-content/55">
        <div>© {{ year }} BuzzyBee. Manila &middot; Atlanta.</div>
        <div class="flex items-center gap-5">
          <a href="#" class="hover:text-primary transition-colors">Privacy</a>
          <a href="#" class="hover:text-primary transition-colors">Terms</a>
          <a href="#" class="hover:text-primary transition-colors">Security</a>
        </div>
      </div>
    </div>
  </footer>
</template>
