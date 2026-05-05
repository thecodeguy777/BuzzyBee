<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronRight
} from 'lucide-vue-next'
import {
  findIndustry,
  findBundle,
  findService
} from '@/data/whoWeServe'
import LandingNav from '@/components/landing/LandingNav.vue'
import SiteFooter from '@/components/landing/SiteFooter.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const industry = computed(() => findIndustry(slug.value))

const bundles = computed(() =>
  industry.value ? industry.value.topBundles.map(findBundle).filter(Boolean) : []
)
const services = computed(() =>
  industry.value ? industry.value.topServices.map(findService).filter(Boolean) : []
)
</script>

<template>
  <div class="min-h-screen text-base-content" style="background: var(--hc-paper)">
    <LandingNav />

    <!-- Not found -->
    <div v-if="!industry" class="max-w-3xl mx-auto px-6 py-32 text-center">
      <h1 class="font-display text-3xl font-medium">We don't have a page for that vertical yet.</h1>
      <p class="mt-3 text-base-content/60">
        It might still be in our pipeline. Browse what we do have, or get in touch.
      </p>
      <div class="mt-8 flex items-center justify-center gap-3">
        <RouterLink :to="{ name: 'landing' }" class="btn btn-primary rounded-full px-5">
          Back to home
        </RouterLink>
      </div>
    </div>

    <template v-else>
      <!-- Hero -->
      <section
        class="pt-28 pb-16 px-6"
        style="background: linear-gradient(180deg, var(--hc-accent-bg) 0%, var(--hc-paper) 100%)"
      >
        <div class="max-w-5xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold mb-4" style="color: var(--hc-accent)">
            {{ industry.hero.eyebrow }}
          </p>
          <h1 class="font-display text-4xl sm:text-5xl font-medium leading-[1.1] tracking-tight max-w-3xl">
            {{ industry.hero.headline }}
          </h1>
          <p class="mt-5 text-lg text-base-content/70 max-w-2xl leading-relaxed">
            {{ industry.hero.sub }}
          </p>
          <div class="mt-8 flex items-center gap-3 flex-wrap">
            <RouterLink
              :to="industry.hero.primaryCta.href"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-transform hover:scale-[1.02] active:scale-95 shadow-hc-1"
              style="background: var(--hc-ink); color: var(--hc-paper)"
            >
              {{ industry.hero.primaryCta.label }}
              <ArrowRight class="w-3.5 h-3.5" :stroke-width="2" />
            </RouterLink>
            <a
              v-if="industry.hero.secondaryCta"
              :href="industry.hero.secondaryCta.href"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm border transition-colors hover:bg-white"
              style="border-color: var(--hc-divider); color: var(--hc-ink)"
            >
              {{ industry.hero.secondaryCta.label }}
            </a>
          </div>
        </div>
      </section>

      <!-- Pains -->
      <section v-if="industry.pains.length" class="py-16 px-6">
        <div class="max-w-5xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            What we hear from {{ industry.name.toLowerCase() }}
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight max-w-2xl">
            The work that decides whether you grow — and never gets done.
          </h2>
          <div class="mt-10 grid sm:grid-cols-3 gap-4">
            <div
              v-for="(p, i) in industry.pains"
              :key="i"
              class="rounded-2xl p-5 border bg-white shadow-hc-1"
              style="border-color: var(--hc-divider)"
            >
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                style="background: var(--hc-accent-bg); color: var(--hc-accent)"
              >
                <AlertTriangle class="w-4 h-4" :stroke-width="1.75" />
              </div>
              <h3 class="font-display text-lg font-medium leading-snug">{{ p.title }}</h3>
              <p class="text-sm text-base-content/65 leading-relaxed mt-1.5">{{ p.detail }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Outcomes -->
      <section v-if="industry.outcomes.length" class="py-16 px-6" style="background: var(--hc-surface-warm)">
        <div class="max-w-5xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            With BuzzyBee
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight max-w-2xl">
            Here's what changes inside two weeks.
          </h2>
          <ul class="mt-8 grid sm:grid-cols-2 gap-3">
            <li
              v-for="(o, i) in industry.outcomes"
              :key="i"
              class="flex items-start gap-3 p-4 rounded-xl bg-white border"
              style="border-color: var(--hc-divider)"
            >
              <CheckCircle2 class="w-5 h-5 shrink-0 mt-0.5" :stroke-width="1.75" style="color: var(--hc-accent)" />
              <span class="text-base-content/85 leading-relaxed">{{ o }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Top bundles for this industry -->
      <section v-if="bundles.length" class="py-16 px-6">
        <div class="max-w-5xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            Top bundles for {{ industry.name }}
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight">
            Pre-built role packages, ready to deploy.
          </h2>
          <div class="mt-8 grid sm:grid-cols-3 gap-4">
            <RouterLink
              v-for="b in bundles"
              :key="b!.slug"
              :to="{ name: 'bundle-page', params: { slug: b!.slug } }"
              class="block rounded-2xl p-5 border bg-white shadow-hc-1 hover:shadow-hc-2 hover:-translate-y-0.5 transition-all group"
              style="border-color: var(--hc-divider)"
            >
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                style="background: var(--hc-accent-bg); color: var(--hc-accent)"
              >
                <Sparkles class="w-4 h-4" :stroke-width="1.75" />
              </div>
              <h3 class="font-display text-lg font-medium leading-snug">{{ b!.name }}</h3>
              <p class="text-sm text-base-content/60 mt-1.5 leading-relaxed">{{ b!.blurb }}</p>
              <div class="mt-3 inline-flex items-center gap-1 text-sm font-medium" style="color: var(--hc-accent)">
                See what's included
                <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" :stroke-width="2" />
              </div>
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- Top services for this industry -->
      <section v-if="services.length" class="py-16 px-6" style="background: var(--hc-surface-warm)">
        <div class="max-w-5xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            Adjacent services
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight">
            Most {{ industry.name.toLowerCase() }} clients also lean on us for these.
          </h2>
          <div class="mt-8 grid sm:grid-cols-3 gap-3">
            <RouterLink
              v-for="s in services"
              :key="s!.slug"
              :to="{ name: 'service-page', params: { slug: s!.slug } }"
              class="block rounded-xl p-4 border bg-white hover:border-base-content/20 transition-colors"
              style="border-color: var(--hc-divider)"
            >
              <div class="font-medium">{{ s!.name }}</div>
              <p class="text-xs text-base-content/55 mt-1 leading-snug">{{ s!.blurb }}</p>
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section v-if="industry.faq.length" class="py-16 px-6">
        <div class="max-w-3xl mx-auto">
          <p class="text-[0.7rem] uppercase tracking-[0.12em] font-semibold text-base-content/50 mb-2">
            FAQ
          </p>
          <h2 class="font-display text-3xl font-medium leading-tight">
            Questions {{ industry.name.toLowerCase() }} buyers usually ask.
          </h2>
          <div class="mt-8 space-y-3">
            <details
              v-for="(item, i) in industry.faq"
              :key="i"
              class="rounded-xl border bg-white p-5 group"
              style="border-color: var(--hc-divider)"
            >
              <summary class="cursor-pointer font-medium flex items-center justify-between gap-4 list-none">
                {{ item.q }}
                <ChevronRight class="w-4 h-4 text-base-content/40 group-open:rotate-90 transition-transform" :stroke-width="2" />
              </summary>
              <p class="mt-3 text-base-content/70 leading-relaxed">{{ item.a }}</p>
            </details>
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
            10–14 business days from signed agreement to your VA being live with you. No upfront commitment.
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
            <RouterLink
              :to="{ name: 'landing' }"
              class="text-sm font-medium hover:underline"
              style="color: var(--hc-accent)"
            >
              Back to home
            </RouterLink>
          </div>
        </div>
      </section>

      <SiteFooter />
    </template>
  </div>
</template>
