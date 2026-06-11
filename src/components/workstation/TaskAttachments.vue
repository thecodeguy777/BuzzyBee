<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Paperclip,
  Upload,
  X,
  FileText,
  FileImage,
  File as FileIcon,
  ExternalLink
} from 'lucide-vue-next'
import { useTasksStore, type Task } from '@/stores/tasks'
import {
  signedAttachmentUrl,
  isImage,
  formatBytes,
  type TaskAttachmentMeta
} from '@/lib/taskAttachments'
import ImageLightbox from '@/components/workstation/ImageLightbox.vue'

const props = defineProps<{ task: Task | null }>()

const tasks = useTasksStore()

const list = computed<TaskAttachmentMeta[]>(
  () => ((props.task?.attachments as TaskAttachmentMeta[]) ?? [])
)

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const dropping = ref(false)
const errorMsg = ref<string | null>(null)
const thumbs = ref<Record<string, string>>({})

watch(
  list,
  async (atts) => {
    for (const a of atts) {
      if (!a.id) continue
      if (thumbs.value[a.id]) continue
      if (isImage(a.mime_type)) {
        try {
          const url = await signedAttachmentUrl(a.path, 3600, {
            width: 320,
            height: 320,
            resize: 'cover'
          })
          thumbs.value = { ...thumbs.value, [a.id]: url }
        } catch (e) {
          console.warn('[attachments] thumbnail signing failed:', (e as Error).message)
        }
      }
    }
  },
  { immediate: true, deep: true }
)

// Image-only subset, used to drive the lightbox + prev/next navigation.
const images = computed(() => list.value.filter((a) => isImage(a.mime_type)))
const lightboxIndex = ref<number | null>(null)

async function openFile(a: TaskAttachmentMeta) {
  if (isImage(a.mime_type)) {
    const idx = images.value.findIndex((img) => img.id === a.id)
    if (idx !== -1) {
      lightboxIndex.value = idx
      return
    }
  }
  // Non-images: open via signed URL in a new tab.
  try {
    const url = await signedAttachmentUrl(a.path, 600)
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function closeLightbox() {
  lightboxIndex.value = null
}

function pickFiles() {
  fileInput.value?.click()
}

async function handleFiles(files: FileList | File[] | null) {
  if (!files || !props.task) return
  errorMsg.value = null
  uploading.value = true
  try {
    for (const f of Array.from(files)) {
      if (f.size > 25 * 1024 * 1024) {
        errorMsg.value = `${f.name} is over 25 MB`
        continue
      }
      await tasks.addAttachment(props.task.id, f)
    }
  } catch (e) {
    errorMsg.value = (e as Error).message
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function onDrop(e: DragEvent) {
  dropping.value = false
  if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files)
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  dropping.value = true
}
function onDragLeave() {
  dropping.value = false
}

async function remove(a: TaskAttachmentMeta) {
  if (!props.task) return
  if (!confirm(`Remove "${a.name}"?`)) return
  try {
    await tasks.removeAttachment(props.task.id, a.id)
    if (thumbs.value[a.id]) {
      const next = { ...thumbs.value }
      delete next[a.id]
      thumbs.value = next
    }
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function iconFor(a: TaskAttachmentMeta) {
  if (isImage(a.mime_type)) return FileImage
  if (a.mime_type?.includes('pdf') || a.mime_type?.startsWith('text/')) return FileText
  return FileIcon
}

// Paste-from-clipboard: when the drawer is open and the user pastes
// an image (Ctrl/Cmd+V from a screenshot tool), upload it as an attachment.
// We skip if the focused element is a text input/textarea editing real text,
// to avoid hijacking normal text paste.
function isEditingText(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type
    return ['text', 'email', 'url', 'search', 'password', 'number', ''].includes(t)
  }
  if (el.isContentEditable) return true
  return false
}

async function onPaste(e: ClipboardEvent) {
  if (!props.task) return
  const items = e.clipboardData?.items
  if (!items || items.length === 0) return

  // Collect image files (clipboard usually carries an image when a screenshot
  // tool is the source — kind=file, type=image/png).
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    if (!item.type.startsWith('image/')) continue
    const f = item.getAsFile()
    if (f) files.push(f)
  }

  if (files.length === 0) return
  // If the user is in a text editor, only intercept if there's no text payload —
  // i.e. it's a true image-only paste. Otherwise let text paste through.
  const hasText = Array.from(items).some((i) => i.kind === 'string')
  if (hasText && isEditingText(e.target)) return

  e.preventDefault()
  // Rename pasted blobs (often "image.png") to a more useful default.
  const renamed = files.map(
    (f) =>
      new File(
        [f],
        `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.${f.type.split('/')[1] || 'png'}`,
        { type: f.type }
      )
  )
  await handleFiles(renamed)
}

onMounted(() => document.addEventListener('paste', onPaste))
onUnmounted(() => document.removeEventListener('paste', onPaste))
</script>

<template>
  <div class="px-6 py-4 border-t border-base-300/60">
    <div class="flex items-center justify-between mb-3">
      <div class="text-xs font-medium text-base-content/60 uppercase tracking-wide flex items-center gap-1.5">
        <Paperclip class="w-3.5 h-3.5" :stroke-width="1.75" />
        Attachments
        <span v-if="list.length" class="text-base-content/40">({{ list.length }})</span>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-xs gap-1.5"
        :disabled="!task || uploading"
        @click="pickFiles"
      >
        <Upload class="w-3.5 h-3.5" :stroke-width="1.75" />
        {{ uploading ? 'Uploading…' : 'Upload' }}
      </button>
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="handleFiles(($event.target as HTMLInputElement).files)"
      />
    </div>

    <div
      :class="[
        'rounded-lg border border-dashed transition-colors',
        dropping ? 'border-primary bg-primary/5' : 'border-base-300'
      ]"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div v-if="!list.length" class="px-4 py-6 text-center text-xs text-base-content/50">
        Drag & drop, paste a screenshot
        <kbd class="kbd kbd-xs">Ctrl</kbd>
        <kbd class="kbd kbd-xs">V</kbd>,
        or
        <button type="button" class="link" @click="pickFiles">browse</button>.
      </div>

      <ul v-else class="grid grid-cols-3 sm:grid-cols-4 gap-2 p-2">
        <li
          v-for="a in list"
          :key="a.id"
          class="group relative rounded-md border border-base-300 bg-base-100 overflow-hidden"
        >
          <button
            type="button"
            class="block w-full aspect-square overflow-hidden bg-base-200/40 cursor-zoom-in"
            :title="a.name"
            @click="openFile(a)"
          >
            <img
              v-if="isImage(a.mime_type) && thumbs[a.id]"
              :src="thumbs[a.id]"
              :alt="a.name"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <div
              v-else
              class="w-full h-full flex flex-col items-center justify-center text-base-content/50 px-2"
            >
              <component :is="iconFor(a)" class="w-7 h-7" :stroke-width="1.5" />
              <div class="text-[0.65rem] uppercase tracking-wider mt-1 truncate w-full text-center">
                {{ (a.mime_type || 'file').split('/').pop()?.slice(0, 8) }}
              </div>
            </div>
          </button>

          <div class="px-2 py-1.5 border-t border-base-300/60 bg-base-100">
            <div class="text-xs font-medium truncate" :title="a.name">{{ a.name }}</div>
            <div class="text-[0.65rem] text-base-content/50 flex items-center gap-1.5 justify-between">
              <span>{{ formatBytes(a.size) }}</span>
              <button
                type="button"
                class="opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                title="Open"
                @click="openFile(a)"
              >
                <ExternalLink class="w-3 h-3" :stroke-width="1.75" />
              </button>
            </div>
          </div>

          <button
            type="button"
            class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-error hover:text-white text-base-content/60 rounded-full p-0.5"
            title="Remove"
            @click="remove(a)"
          >
            <X class="w-3 h-3" :stroke-width="2" />
          </button>
        </li>
      </ul>
    </div>

    <p v-if="errorMsg" class="text-xs text-error mt-2">{{ errorMsg }}</p>

    <ImageLightbox
      :images="images"
      :index="lightboxIndex"
      @close="closeLightbox"
      @update:index="(i) => (lightboxIndex = i)"
    />
  </div>
</template>
