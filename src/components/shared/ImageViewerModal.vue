<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { formatBytes } from '@/lib/commsAttachments'

// Generic image viewer modal — URL-based, so any surface can use it (comms
// attachments, CRM, avatars…). Gallery navigation (arrows/keys/counter),
// click-to-zoom with scroll panning, download with the original filename.
// The task-attachment ImageLightbox stays separate: it resolves signed URLs
// from the private bucket; this one renders what you give it.

export interface ViewerImage {
  url: string
  name?: string
  size?: number
}

const props = defineProps<{
  images: ViewerImage[]
  /** Index of the open image; null = closed. */
  index: number | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:index', value: number): void
}>()

const open = computed(() => props.index !== null && props.images.length > 0)
const current = computed(() => (props.index !== null ? props.images[props.index] ?? null : null))

const loading = ref(false)
const zoomed = ref(false)
watch(current, () => {
  loading.value = !!current.value
  zoomed.value = false
})

function close() {
  emit('close')
}
function prev() {
  if (props.index === null || props.images.length < 2) return
  emit('update:index', (props.index - 1 + props.images.length) % props.images.length)
}
function next() {
  if (props.index === null || props.images.length < 2) return
  emit('update:index', (props.index + 1) % props.images.length)
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
watch(open, (is) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = is ? 'hidden' : ''
})

async function downloadFile() {
  const img = current.value
  if (!img) return
  try {
    const r = await fetch(img.url)
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = img.name || 'image'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  } catch {
    // Cross-origin without CORS — fall back to opening it.
    window.open(img.url, '_blank', 'noopener,noreferrer')
  }
}
function openInNewTab() {
  if (current.value) window.open(current.value.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ivm">
      <div v-if="open" class="fixed inset-0 z-[120]" role="dialog" aria-modal="true" :aria-label="current?.name ?? 'Image viewer'">
        <!-- backdrop -->
        <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" @click="close" />

        <!-- close -->
        <button
          type="button"
          class="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          aria-label="Close"
          @click="close"
        >
          <X class="w-5 h-5" :stroke-width="2" />
        </button>

        <!-- nav -->
        <button
          v-if="images.length > 1"
          type="button"
          class="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          aria-label="Previous image"
          @click="prev"
        >
          <ChevronLeft class="w-6 h-6" :stroke-width="2" />
        </button>
        <button
          v-if="images.length > 1"
          type="button"
          class="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          aria-label="Next image"
          @click="next"
        >
          <ChevronRight class="w-6 h-6" :stroke-width="2" />
        </button>

        <!-- stage: fit by default, natural size + scroll panning when zoomed -->
        <div
          class="absolute inset-0"
          :class="zoomed ? 'overflow-auto' : 'flex items-center justify-center p-10 sm:p-14'"
          @click.self="close"
        >
          <div v-if="loading" class="absolute inset-0 grid place-items-center pointer-events-none">
            <span class="w-7 h-7 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          </div>
          <img
            v-if="current"
            :key="current.url"
            :src="current.url"
            :alt="current.name ?? ''"
            class="ivm-img shadow-2xl"
            :class="zoomed
              ? 'max-w-none m-auto cursor-zoom-out'
              : 'max-w-full max-h-full rounded-lg cursor-zoom-in'"
            :style="loading ? { opacity: 0 } : undefined"
            @load="loading = false"
            @error="loading = false"
            @click.stop="zoomed = !zoomed"
          />
        </div>

        <!-- caption + actions -->
        <div v-if="current" class="absolute bottom-0 left-0 right-0 z-10 p-4 pointer-events-none">
          <div class="mx-auto max-w-2xl flex items-center justify-between gap-3 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm pointer-events-auto">
            <div class="min-w-0">
              <div class="font-medium truncate">{{ current.name ?? 'Image' }}</div>
              <div class="text-xs text-white/60 flex items-center gap-2">
                <span v-if="current.size">{{ formatBytes(current.size) }}</span>
                <span v-if="current.size && images.length > 1" class="text-white/40">·</span>
                <span v-if="images.length > 1">{{ (index ?? 0) + 1 }} of {{ images.length }}</span>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" class="w-9 h-9 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors" :title="zoomed ? 'Fit to screen' : 'Actual size'" @click="zoomed = !zoomed">
                <component :is="zoomed ? ZoomOut : ZoomIn" class="w-4 h-4" :stroke-width="1.75" />
              </button>
              <button type="button" class="w-9 h-9 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors" title="Open in new tab" @click="openInNewTab">
                <ExternalLink class="w-4 h-4" :stroke-width="1.75" />
              </button>
              <button type="button" class="w-9 h-9 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors" title="Download" @click="downloadFile">
                <Download class="w-4 h-4" :stroke-width="1.75" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ivm-enter-active { transition: opacity 0.18s ease; }
.ivm-leave-active { transition: opacity 0.14s ease-in; }
.ivm-enter-from, .ivm-leave-to { opacity: 0; }
.ivm-enter-active .ivm-img { animation: ivm-pop 0.22s cubic-bezier(0.3, 1.3, 0.5, 1) both; }
@keyframes ivm-pop {
  from { transform: scale(0.96); }
  to { transform: scale(1); }
}
.ivm-img { transition: opacity 0.15s ease; }
@media (prefers-reduced-motion: reduce) {
  .ivm-enter-active .ivm-img { animation: none; }
}
</style>
