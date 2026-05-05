<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { ArrowRight, CheckCircle2, Sparkles, ChevronRight } from 'lucide-vue-next'
import { findBundle, findIndustry } from '@/data/whoWeServe'
import LandingNav from '@/components/landing/LandingNav.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const bundle = computed(() => findBundle(slug.value))

const linkedIndustries = computed(() =>
  bundle.value ? bundle.value.industries.map(findIndustry).filter(Boolean) : []
)
</script>

<template>
  <div class="min-h-screen text-base-content" style="background: var(--hc-paper)">
    <LandingNav />

    <div v-if="!bundle" class="max-w-3xl mx-auto px-6 py-32 text-center">
      <h1 class="font-display text-3xl font-medium">We don't have that bundle yet.</h1>
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
            BUNDLE
          </p>
          <h1 class="font-display text-4xl sm:text-5xl font-medium leading-[1.1] tracking-tight">
            {{ bundle.name }}
          </h1>
          <p v-if="bundle.blurb" class="mt-4 text-lg text-base-content/70 max-w-2xl">
            {{ bundle.blurb }}
          </p>
          <div class="mt-8 flex items-center gap-3 flex-wrap">
            <a
              href="#contact"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-transform hover:scale-[1.02] active:scale-95 shadow-hc-1"
              style="background: var(--hc-ink); color: var(--hc-paper)"
            >
              Book a discovery call
              <ArrowRight class="w-3.5 h-3.5" :stroke-width="2" />
            </a>
            <span
              v-if="bundle.pricing"
              class="text-sm text-base-content/60"
            >
              From <strong class="text-base-content font-semibold">${{ bundle.pricing.from }}</strong>/month
            </span>
          </div>
        </div>
      </section>

      <!-- What's included -->
      <section class="py-14 px-6">
        <div class="max-w-4xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            What's included
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight">
            Hand it off. Move on.
          </h2>
          <ul class="mt-8 grid sm:grid-cols-2 gap-3">
            <li
              v-for="(item, i) in bundle.includes"
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

      <!-- Industries that hire this -->
      <section v-if="linkedIndustries.length" class="py-14 px-6" style="background: var(--hc-surface-warm)">
        <div class="max-w-4xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            Who hires this bundle
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight">
            Built for these industries.
          </h2>
          <div class="mt-8 grid sm:grid-cols-3 gap-3">
            <RouterLink
              v-for="ind in linkedIndustries"
              :key="ind!.slug"
              :to="{ name: 'industry-page', params: { slug: ind!.slug } }"
              class="block p-4 rounded-xl border bg-white hover:border-base-content/20 transition-colors group"
              style="border-color: var(--hc-divider)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium">{{ ind!.name }}</span>
                <ChevronRight class="w-3.5 h-3.5 text-base-content/30 group-hover:text-base-content/60 group-hover:translate-x-0.5 transition-all" :stroke-width="2" />
              </div>
              <p v-if="ind!.blurb" class="text-xs text-base-content/55 mt-1">{{ ind!.blurb }}</p>
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- Final CTA -->
      <section class="py-20 px-6">
        <div
          class="max-w-3xl mx-auto rounded-3xl p-8 sm:p-12 text-center shadow-hc-2 border"
          style="
            background: linear-gradient(135deg, var(--hc-accent-bg) 0%, var(--hc-surface-warm) 100%);
            border-color: var(--hc-accent-soft);
          "
        >
          <h2 class="font-display text-3xl sm:text-4xl font-medium leading-tight">
            Ready to hand off the work?
          </h2>
          <p class="mt-3 text-base-content/65 max-w-xl mx-auto">
            10–14 business days from signed agreement to your VA being live.
          </p>
          <div class="mt-8 flex items-center justify-center gap-3 flex-wrap">
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
