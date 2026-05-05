<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-vue-next'
import { signedAttachmentUrl, formatBytes, type TaskAttachmentMeta } from '@/lib/taskAttachments'

const props = defineProps<{
  images: TaskAttachmentMeta[]
  index: number | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:index', value: number): void
}>()

const open = computed(() => props.index !== null && props.images.length > 0)
const current = computed(() =>
  props.index !== null ? props.images[props.index] ?? null : null
)
const fullUrl = ref<string | null>(null)
const loading = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  current,
  async (a) => {
    if (!a) {
      fullUrl.value = null
      return
    }
    loading.value = true
    errorMsg.value = null
    try {
      fullUrl.value = await signedAttachmentUrl(a.path, 600)
    } catch (e) {
      errorMsg.value = (e as Error).message
      fullUrl.value = null
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function close() {
  emit('close')
}
function prev() {
  if (props.index === null || props.images.length < 2) return
  const next = (props.index - 1 + props.images.length) % props.images.length
  emit('update:index', next)
}
function next() {
  if (props.index === null || props.images.length < 2) return
  const n = (props.index + 1) % props.images.length
  emit('update:index', n)
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

watch(open, (is) => {
  if (typeof document === 'undefined') return
  // Drawer already locks scroll; nothing extra needed.
  if (!is) errorMsg.value = null
})

async function downloadFile() {
  if (!current.value || !fullUrl.value) return
  // Fetch as blob to force download with the original filename.
  try {
    const r = await fetch(fullUrl.value)
    const blob = await r.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = current.value.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function openInNewTab() {
  if (fullUrl.value) window.open(fullUrl.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <Teleport to="body">
    <div
      :class="[
        'fixed inset-0 z-50 transition-opacity duration-200',
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      ]"
      role="dialog"
      aria-modal="true"
      :aria-hidden="!open"
    >
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
        aria-label="Previous"
        @click="prev"
      >
        <ChevronLeft class="w-6 h-6" :stroke-width="2" />
      </button>
      <button
        v-if="images.length > 1"
        type="button"
        class="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        aria-label="Next"
        @click="next"
      >
        <ChevronRight class="w-6 h-6" :stroke-width="2" />
      </button>

      <!-- image stage -->
      <div
        class="absolute inset-0 flex items-center justify-center p-12 pointer-events-none"
      >
        <div
          v-if="loading"
          class="text-white/70 text-sm pointer-events-auto"
        >
          Loading…
        </div>
        <img
          v-else-if="fullUrl"
          :src="fullUrl"
          :alt="current?.name"
          class="max-w-full max-h-full rounded-lg shadow-2xl pointer-events-auto"
          @click.stop
        />
        <div
          v-else-if="errorMsg"
          class="text-white text-sm bg-error/30 px-4 py-2 rounded pointer-events-auto"
        >
          {{ errorMsg }}
        </div>
      </div>

      <!-- caption + actions -->
      <div
        v-if="current"
        class="absolute bottom-0 left-0 right-0 z-10 p-4 pointer-events-none"
      >
        <div
          class="mx-auto max-w-2xl flex items-center justify-between gap-3 bg-black/60 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm pointer-events-auto"
        >
          <div class="min-w-0">
            <div class="font-medium truncate">{{ current.name }}</div>
            <div class="text-xs text-white/60 flex items-center gap-2">
              <span>{{ formatBytes(current.size) }}</span>
              <span v-if="images.length > 1" class="text-white/40">·</span>
              <span v-if="images.length > 1">{{ (index ?? 0) + 1 }} of {{ images.length }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="w-9 h-9 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors"
              title="Open in new tab"
              @click="openInNewTab"
            >
              <ExternalLink class="w-4 h-4" :stroke-width="1.75" />
            </button>
            <button
              type="button"
              class="w-9 h-9 rounded-md hover:bg-white/10 flex items-center justify-center transition-colors"
              title="Download"
              @click="downloadFile"
            >
              <Download class="w-4 h-4" :stroke-width="1.75" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
