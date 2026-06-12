<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { X, Sparkles } from 'lucide-vue-next'
import { EMAIL_GALLERY, compileBlocks, freshBlocks, type EmailDesign } from '@/lib/emailBlocks'
import { DEFAULT_ACCENT } from '@/lib/emailLayouts'

// The "Canva of emails" starting line: pre-designed, block-built emails.
// Previews are the real compiled HTML, miniaturized — what you pick is
// exactly what loads into the block editor.

const props = defineProps<{ accent?: string }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pick', design: EmailDesign): void
}>()

const visible = ref(false)
const accent = computed(() => props.accent || DEFAULT_ACCENT)

const cards = computed(() =>
  EMAIL_GALLERY.map((d) => ({
    design: d,
    html: compileBlocks(freshBlocks(d.blocks), accent.value),
  })))

function pick(design: EmailDesign) {
  emit('pick', design)
}
function requestClose() {
  visible.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    requestClose()
  }
}
onMounted(() => {
  // Capture phase so Esc closes the gallery before the composer underneath.
  document.addEventListener('keydown', onKey, true)
  visible.value = true
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <Transition name="crm-scrim">
      <div v-if="visible" class="fixed inset-0 z-[110]" style="background: rgba(0,0,0,.5)" @click="requestClose" />
    </Transition>
    <Transition name="crm-pop" @after-leave="emit('close')">
      <div
        v-if="visible"
        class="fixed inset-0 m-auto z-[115] w-[880px] max-w-[94vw] h-[82vh] max-h-[700px] flex flex-col bg-base-100 rounded-2xl overflow-hidden border border-base-300"
        style="box-shadow: 0 24px 80px -16px rgba(0,0,0,.5)"
        role="dialog"
        aria-modal="true"
        aria-label="Email design gallery"
      >
        <div class="flex items-center gap-[11px] px-[18px] py-[15px] border-b border-base-300 flex-none">
          <span class="w-8 h-8 rounded-[9px] grid place-items-center" :style="{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }">
            <Sparkles :size="17" />
          </span>
          <div class="flex-1">
            <div class="text-[15.5px] font-bold text-base-content">Start from a design</div>
            <div class="text-[12px] text-base-content/40">Pick one, then edit every block — no code anywhere.</div>
          </div>
          <button type="button" class="w-8 h-8 rounded-lg grid place-items-center text-base-content/60 hover:bg-base-200" aria-label="Close" @click="requestClose">
            <X :size="18" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              v-for="c in cards"
              :key="c.design.id"
              type="button"
              class="crm-gal text-left rounded-xl border border-base-300 bg-base-100 overflow-hidden"
              @click="pick(c.design)"
            >
              <!-- miniature: real compiled HTML at half scale on a white card -->
              <span class="block h-44 overflow-hidden relative" style="background: #f4f3f6">
                <span class="absolute inset-x-3 top-3 bottom-0 block bg-white rounded-t-lg overflow-hidden" style="box-shadow: 0 1px 3px rgba(20,12,22,.1)">
                  <span
                    class="block px-3 py-2.5 pointer-events-none"
                    style="width: 200%; transform: scale(0.5); transform-origin: top left"
                    v-html="c.html"
                  />
                </span>
                <span class="crm-gal-cta absolute inset-0 grid place-items-center" style="background: rgba(20,12,22,.35)">
                  <span class="px-3 py-1.5 rounded-lg text-white text-[12.5px] font-bold" :style="{ background: 'var(--accent)' }">Use this design</span>
                </span>
              </span>
              <span class="block px-3 py-2.5">
                <span class="block text-[13px] font-bold text-base-content">{{ c.design.name }}</span>
                <span class="block text-[11px] text-base-content/40">{{ c.design.blurb }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.crm-scrim-enter-active, .crm-scrim-leave-active { transition: opacity 0.2s ease; }
.crm-scrim-enter-from, .crm-scrim-leave-to { opacity: 0; }
.crm-pop-enter-active { transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.15), opacity 0.22s ease; }
.crm-pop-leave-active { transition: transform 0.15s ease-in, opacity 0.15s ease-in; }
.crm-pop-enter-from, .crm-pop-leave-to { transform: scale(0.97) translateY(8px); opacity: 0; }

.crm-gal { transition: border-color 0.12s, box-shadow 0.12s, transform 0.12s; }
.crm-gal:hover { border-color: var(--accent-bord); transform: translateY(-2px); box-shadow: 0 8px 24px -8px rgba(20,12,22,.25); }
.crm-gal .crm-gal-cta { opacity: 0; transition: opacity 0.15s; }
.crm-gal:hover .crm-gal-cta { opacity: 1; }
</style>
