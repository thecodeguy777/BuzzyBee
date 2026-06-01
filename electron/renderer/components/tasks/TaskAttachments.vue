<script setup lang="ts">
import { ref, computed } from 'vue'
import { Paperclip, X, Image as ImageIcon, FileText, FileSpreadsheet, FileVideo, FileArchive, Download, Upload } from 'lucide-vue-next'
import { useTaskAttachments, type TaskAttachment } from '../../composables/useTaskAttachments'
import { useToast } from '../../composables/useToast'
import { useDialog } from '../../composables/useDialog'

const props = defineProps<{
  taskId: string | null
}>()

const toast = useToast()
const dialog = useDialog()
const att = useTaskAttachments(() => props.taskId)

const fileInputRef = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

function iconFor(mime: string | null): any {
  if (!mime) return FileText
  if (mime.startsWith('image/')) return ImageIcon
  if (mime.startsWith('video/')) return FileVideo
  if (mime.includes('spreadsheet') || mime.includes('csv') || mime.includes('excel')) return FileSpreadsheet
  if (mime.includes('zip') || mime.includes('compressed')) return FileArchive
  return FileText
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImage(a: TaskAttachment): boolean {
  return (a.mimeType ?? '').startsWith('image/')
}

// Lazy-load preview URLs for image attachments
const previewUrls = ref<Record<string, string>>({})
async function ensurePreview(a: TaskAttachment) {
  if (!isImage(a) || previewUrls.value[a.id]) return
  const url = await att.getSignedUrl(a, 3600)
  if (url) previewUrls.value = { ...previewUrls.value, [a.id]: url }
}

// Eagerly load previews when attachments change
import { watch } from 'vue'
watch(() => att.attachments.value, async (list) => {
  for (const a of list) {
    if (isImage(a)) await ensurePreview(a)
  }
}, { immediate: true })

function pickFiles() {
  fileInputRef.value?.click()
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  const count = await att.uploadMany(input.files)
  if (count > 0) toast.success(`Attached ${count} file${count === 1 ? '' : 's'}`)
  else if (att.lastError.value) toast.error('Upload failed', att.lastError.value)
  input.value = ''
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}
function onDragLeave() { dragOver.value = false }
async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const count = await att.uploadMany(files)
  if (count > 0) toast.success(`Attached ${count} file${count === 1 ? '' : 's'}`)
  else if (att.lastError.value) toast.error('Upload failed', att.lastError.value)
}

async function openAttachment(a: TaskAttachment) {
  const url = await att.getSignedUrl(a, 600)
  if (url) window.open(url, '_blank')
}

async function removeAttachment(a: TaskAttachment) {
  const ok = await dialog.confirm({
    title: 'Delete attachment?',
    message: `${a.fileName} will be removed permanently.`,
    destructive: true,
    confirmLabel: 'Delete',
  })
  if (!ok) return
  const success = await att.deleteAttachment(a)
  if (success) toast.info('Attachment deleted', a.fileName)
}

const hasAttachments = computed(() => att.attachments.value.length > 0)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <label class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold flex items-center gap-1">
        <Paperclip class="w-2.5 h-2.5" />
        Attachments
        <span v-if="hasAttachments" class="font-normal opacity-60">· {{ att.attachments.value.length }}</span>
      </label>
      <button
        class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
        @click="pickFiles"
        :disabled="att.isUploading.value"
      >
        <Upload class="w-2.5 h-2.5" />
        {{ att.isUploading.value ? 'Uploading…' : 'Upload' }}
      </button>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="onFiles"
    />

    <!-- Drop zone + grid -->
    <div
      class="rounded-lg border border-dashed transition-colors min-h-[60px]"
      :class="dragOver
        ? 'border-primary bg-primary/5'
        : hasAttachments ? 'border-base-300' : 'border-base-300/60 hover:border-primary/40'"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div v-if="!hasAttachments && !att.isUploading.value" class="text-center py-3 px-2">
        <p class="text-[11px] text-base-content/40">
          Drop files here or
          <button class="text-primary hover:underline" @click="pickFiles">browse</button>
        </p>
        <p class="text-[9px] text-base-content/30 mt-0.5">Up to 25 MB each</p>
      </div>

      <div v-if="att.isUploading.value && !hasAttachments" class="text-center py-3 text-[11px] text-base-content/60">
        Uploading…
      </div>

      <div v-if="hasAttachments" class="grid grid-cols-2 gap-1.5 p-1.5">
        <div
          v-for="a in att.attachments.value"
          :key="a.id"
          class="group relative rounded-md border border-base-300 bg-base-100 overflow-hidden hover:border-primary/40 transition-colors"
        >
          <!-- Image preview -->
          <button
            v-if="isImage(a) && previewUrls[a.id]"
            class="block w-full aspect-video bg-base-200 overflow-hidden"
            @click="openAttachment(a)"
          >
            <img
              :src="previewUrls[a.id]"
              :alt="a.fileName"
              class="w-full h-full object-cover hover:scale-105 transition-transform"
              loading="lazy"
            />
          </button>

          <!-- Non-image: icon tile -->
          <button
            v-else
            class="flex items-center justify-center w-full aspect-video bg-base-200/60"
            @click="openAttachment(a)"
          >
            <component :is="iconFor(a.mimeType)" class="w-6 h-6 text-base-content/50" />
          </button>

          <!-- Filename + size -->
          <div class="px-2 py-1.5 flex items-center gap-1.5 text-[10px]">
            <component :is="iconFor(a.mimeType)" class="w-2.5 h-2.5 text-base-content/50 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="font-medium text-base-content truncate" :title="a.fileName">
                {{ a.fileName }}
              </div>
              <div v-if="a.sizeBytes" class="text-base-content/40">{{ fmtSize(a.sizeBytes) }}</div>
            </div>
          </div>

          <!-- Hover actions -->
          <div class="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="p-1 rounded bg-base-100/95 backdrop-blur-sm shadow-sm hover:bg-primary/10 text-base-content/70 hover:text-primary transition-colors"
              title="Open"
              @click="openAttachment(a)"
            >
              <Download class="w-3 h-3" />
            </button>
            <button
              class="p-1 rounded bg-base-100/95 backdrop-blur-sm shadow-sm hover:bg-red-500/10 text-base-content/70 hover:text-red-500 transition-colors"
              title="Delete"
              @click="removeAttachment(a)"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
