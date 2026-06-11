<script setup lang="ts">
import { computed, ref } from 'vue'
import { Paperclip, Link2 } from 'lucide-vue-next'
import ImageViewerModal from '@/components/shared/ImageViewerModal.vue'
import { formatBytes } from '@/lib/commsAttachments'
import type { Attachment } from '@/composables/useChannelStream'

// Shared attachment renderer for every comms surface (full stream, dock,
// Messages tab). Images (incl. GIFs) render inline and open the image viewer
// as a per-message gallery; videos get a player, files a download chip,
// links a preview card.
const props = withDefaults(
  defineProps<{
    attachments: Attachment[]
    /** Dock/thread mode: tighter max sizes. */
    compact?: boolean
  }>(),
  { compact: false },
)

const isImage = (a: Attachment) => a.kind === 'image' && !!a.url
const isVideo = (a: Attachment) =>
  !!a.url && (a.mime?.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(a.url))
const maxW = () => (props.compact ? 'max-w-[15rem]' : 'max-w-xs')

// Per-message image gallery for the viewer.
const galleryImages = computed(() =>
  props.attachments.filter(isImage).map((a) => ({ url: a.url!, name: a.name, size: a.size })),
)
const viewerIndex = ref<number | null>(null)
function openViewer(a: Attachment) {
  const i = galleryImages.value.findIndex((g) => g.url === a.url)
  viewerIndex.value = i >= 0 ? i : 0
}
</script>

<template>
  <div class="mt-1.5 flex flex-col gap-2 items-start">
    <template v-for="(a, i) in attachments" :key="i">
      <button
        v-if="isImage(a)"
        type="button"
        class="block rounded-xl overflow-hidden border border-base-300 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        :class="maxW()"
        :title="a.name"
        @click="openViewer(a)"
      >
        <img :src="a.url" :alt="a.name" class="w-full object-cover" :class="compact ? 'max-h-40' : 'max-h-64'" loading="lazy" />
      </button>
      <video
        v-else-if="isVideo(a)"
        :src="a.url"
        controls
        preload="metadata"
        playsinline
        class="rounded-xl border border-base-300 bg-black w-full"
        :class="compact ? 'max-w-[15rem] max-h-40' : 'max-w-sm max-h-72'"
      />
      <a v-else-if="a.kind === 'file'" :href="a.url" target="_blank" rel="noopener" class="inline-flex items-center gap-2.5 rounded-xl border border-base-300 bg-base-100 px-3 py-2 hover:border-primary/40" :class="maxW()">
        <span class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Paperclip class="w-4 h-4" :stroke-width="1.75" /></span>
        <span class="min-w-0">
          <span class="block text-sm font-medium truncate">{{ a.name }}</span>
          <span class="block text-[0.7rem] text-base-content/50">{{ formatBytes(a.size) }}</span>
        </span>
      </a>
      <a v-else :href="a.url" target="_blank" rel="noopener" class="flex items-stretch rounded-xl overflow-hidden border border-base-300 bg-base-100 hover:border-primary/40" :class="compact ? 'max-w-[15rem]' : 'max-w-sm'">
        <span class="w-1 bg-primary shrink-0" />
        <span class="px-3 py-2 min-w-0">
          <span class="flex items-center gap-1 text-[0.7rem] text-base-content/50"><Link2 class="w-3 h-3" /> {{ a.name }}</span>
          <span class="block text-sm font-medium text-primary truncate">{{ a.url }}</span>
        </span>
      </a>
    </template>

    <ImageViewerModal
      :images="galleryImages"
      :index="viewerIndex"
      @close="viewerIndex = null"
      @update:index="viewerIndex = $event"
    />
  </div>
</template>
