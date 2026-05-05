<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ChevronDown, ArrowUpRight } from 'lucide-vue-next'
import { INDUSTRIES, BUNDLES, SERVICES } from '@/data/whoWeServe'

const open = ref(false)
const wrap = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  if (!wrap.value) return
  if (!wrap.value.contains(e.target as Node)) open.value = false
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEsc)
})

function close() {
  open.value = false
}
</script>

<template>
  <div ref="wrap" class="relative">
    <button
      type="button"
      class="inline-flex items-center gap-1 text-base-content/75 hover:text-primary transition-colors text-sm"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="open = !open"
    >
      Who we serve
      <ChevronDown
        class="w-3.5 h-3.5 transition-transform"
        :class="open && 'rotate-180'"
        :stroke-width="2"
      />
    </button>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        class="absolute left-1/2 -translate-x-1/2 top-full mt-3 z-50"
        style="min-width: min(900px, calc(100vw - 3rem));"
      >
        <div
          class="rounded-2xl shadow-hc-3 border bg-white overflow-hidden"
          style="border-color: var(--hc-divider)"
        >
          <div class="grid grid-cols-1 md:grid-cols-3">
            <!-- BY INDUSTRY -->
            <section class="p-5 border-b md:border-b-0 md:border-r" style="border-color: var(--hc-divider)">
              <h4 class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-base-content/50 mb-3">
                By industry
              </h4>
              <ul class="space-y-0.5">
                <li v-for="i in INDUSTRIES" :key="i.slug">
                  <RouterLink
                    :to="{ name: 'industry-page', params: { slug: i.slug } }"
                    class="block px-2.5 py-1.5 rounded-md hover:bg-base-200/60 group transition-colors"
                    @click="close"
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <span
                        class="text-sm truncate"
                        :class="i.emphasized ? 'font-semibold text-base-content' : 'font-medium text-base-content/80'"
                      >
                        {{ i.name }}
                      </span>
                      <ArrowUpRight class="w-3 h-3 text-base-content/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" :stroke-width="1.75" />
                    </div>
                    <p
                      v-if="i.blurb"
                      class="text-[0.7rem] text-base-content/55 mt-0.5 leading-snug"
                    >
                      {{ i.blurb }}
                    </p>
                  </RouterLink>
                </li>
              </ul>
            </section>

            <!-- BY BUNDLE -->
            <section class="p-5 border-b md:border-b-0 md:border-r" style="border-color: var(--hc-divider)">
              <h4 class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold mb-3" style="color: var(--hc-accent)">
                By bundle
              </h4>
              <ul class="space-y-0.5">
                <li v-for="b in BUNDLES" :key="b.slug">
                  <RouterLink
                    :to="{ name: 'bundle-page', params: { slug: b.slug } }"
                    class="block px-2.5 py-1.5 rounded-md hover:bg-base-200/60 group transition-colors"
                    @click="close"
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <span
                        class="text-sm truncate"
                        :class="b.emphasized ? 'font-semibold text-base-content' : 'font-medium text-base-content/80'"
                      >
                        {{ b.name }}
                      </span>
                      <ArrowUpRight class="w-3 h-3 text-base-content/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" :stroke-width="1.75" />
                    </div>
                    <p
                      v-if="b.blurb"
                      class="text-[0.7rem] text-base-content/55 mt-0.5 leading-snug"
                    >
                      {{ b.blurb }}
                    </p>
                  </RouterLink>
                </li>
              </ul>
            </section>

            <!-- BY SERVICE -->
            <section class="p-5">
              <h4 class="text-[0.65rem] uppercase tracking-[0.1em] font-semibold text-base-content/50 mb-3">
                By service
              </h4>
              <ul class="space-y-0.5">
                <li v-for="s in SERVICES" :key="s.slug">
                  <RouterLink
                    :to="{ name: 'service-page', params: { slug: s.slug } }"
                    class="block px-2.5 py-1.5 rounded-md hover:bg-base-200/60 group transition-colors"
                    @click="close"
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <span
                        class="text-sm truncate"
                        :class="s.emphasized ? 'font-semibold text-base-content' : 'font-medium text-base-content/80'"
                      >
                        {{ s.name }}
                      </span>
                      <ArrowUpRight class="w-3 h-3 text-base-content/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" :stroke-width="1.75" />
                    </div>
                    <p
                      v-if="s.blurb"
                      class="text-[0.7rem] text-base-content/55 mt-0.5 leading-snug"
                    >
                      {{ s.blurb }}
                    </p>
                  </RouterLink>
                </li>
              </ul>
            </section>
          </div>

          <!-- Footer band -->
          <div
            class="px-5 py-3 text-xs flex items-center justify-between"
            style="background: var(--hc-surface-warm); border-top: 1px solid var(--hc-divider)"
          >
            <span class="text-base-content/60">
              Not sure where you fit? <a href="#contact" class="text-primary font-medium hover:underline" @click="close">Book a 20-min call.</a>
            </span>
            <RouterLink
              :to="{ name: 'who-we-serve-overview' }"
              class="text-primary font-medium hover:underline inline-flex items-center gap-1"
              @click="close"
            >
              See everything
              <ArrowUpRight class="w-3 h-3" :stroke-width="2" />
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
