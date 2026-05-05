<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { ArrowRight, CheckCircle2 } from 'lucide-vue-next'
import { findService, BUNDLES } from '@/data/whoWeServe'
import LandingNav from '@/components/landing/LandingNav.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const service = computed(() => findService(slug.value))

// Bundles whose includes mention work in this service area — shown as related.
// Cheap heuristic: bundles whose names contain a token from the service name.
const relatedBundles = computed(() => {
  if (!service.value) return []
  const tokens = service.value.name.toLowerCase().split(/\W+/).filter((t) => t.length > 3)
  return BUNDLES.filter((b) =>
    tokens.some((t) =>
      b.name.toLowerCase().includes(t) || b.blurb?.toLowerCase().includes(t)
    )
  ).slice(0, 4)
})
</script>

<template>
  <div class="min-h-screen text-base-content" style="background: var(--hc-paper)">
    <LandingNav />

    <div v-if="!service" class="max-w-3xl mx-auto px-6 py-32 text-center">
      <h1 class="font-display text-3xl font-medium">We don't offer that service yet.</h1>
      <RouterLink :to="{ name: 'landing' }" class="mt-6 inline-block btn btn-primary rounded-full px-5">Back to home</RouterLink>
    </div>

    <template v-else>
      <!-- Hero -->
      <section
        class="pt-28 pb-14 px-6"
        style="background: linear-gradient(180deg, var(--hc-accent-bg) 0%, var(--hc-paper) 100%)"
      >
        <div class="max-w-4xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold mb-4" style="color: var(--hc-accent)">
            SERVICE
          </p>
          <h1 class="font-display text-4xl sm:text-5xl font-medium leading-[1.1] tracking-tight">
            {{ service.name }}
          </h1>
          <p v-if="service.blurb" class="mt-4 text-lg text-base-content/70 max-w-2xl">
            {{ service.blurb }}
          </p>
          <div class="mt-8">
            <a
              href="#contact"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-transform hover:scale-[1.02] active:scale-95 shadow-hc-1"
              style="background: var(--hc-ink); color: var(--hc-paper)"
            >
              Book a discovery call
              <ArrowRight class="w-3.5 h-3.5" :stroke-width="2" />
            </a>
          </div>
        </div>
      </section>

      <!-- Tasks under this service -->
      <section class="py-14 px-6">
        <div class="max-w-4xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            What we deliver
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight">
            The actual work, no fluff.
          </h2>
          <ul class="mt-8 grid sm:grid-cols-2 gap-3">
            <li
              v-for="(item, i) in service.includes"
              :key="i"
              class="flex items-start gap-3 p-4 rounded-xl bg-white border"
              style="border-color: var(--hc-divider)"
            >
              <CheckCircle2 class="w-5 h-5 shrink-0 mt-0.5" :stroke-width="1.75" style="color: var(--hc-accent)" />
              <span class="text-base-content/85 leading-relaxed">{{ item }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Related bundles -->
      <section v-if="relatedBundles.length" class="py-14 px-6" style="background: var(--hc-surface-warm)">
        <div class="max-w-4xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            Related bundles
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight">
            Want this packaged with adjacent work?
          </h2>
          <div class="mt-8 grid sm:grid-cols-2 gap-3">
            <RouterLink
              v-for="b in relatedBundles"
              :key="b.slug"
              :to="{ name: 'bundle-page', params: { slug: b.slug } }"
              class="block p-4 rounded-xl border bg-white hover:border-base-content/20 transition-colors"
              style="border-color: var(--hc-divider)"
            >
              <div class="font-medium">{{ b.name }}</div>
              <p v-if="b.blurb" class="text-xs text-base-content/55 mt-1">{{ b.blurb }}</p>
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section class="py-20 px-6">
        <div
          class="max-w-3xl mx-auto rounded-3xl p-8 sm:p-12 text-center shadow-hc-2 border"
          style="
            background: linear-gradient(135deg, var(--hc-accent-bg) 0%, var(--hc-surface-warm) 100%);
            border-color: var(--hc-accent-soft);
          "
        >
          <h2 class="font-display text-3xl sm:text-4xl font-medium leading-tight">
            Hand off the work this week.
          </h2>
          <div class="mt-8">
            <a
              href="#contact"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm shadow-hc-1 transition-transform hover:scale-[1.02] active:scale-95"
              style="background: var(--hc-ink); color: var(--hc-paper)"
            >
              Book a 20-min call
              <ArrowRight class="w-3.5 h-3.5" :stroke-width="2" />
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </template>
  </div>
</template>
