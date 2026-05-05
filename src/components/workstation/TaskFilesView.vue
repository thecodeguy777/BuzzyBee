<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Paperclip,
  FileText,
  FileImage,
  File as FileIcon,
  ExternalLink,
  Hash,
  Send,
  Slack,
  Mail,
  Instagram,
  Facebook,
  Linkedin,
  ChevronDown
} from 'lucide-vue-next'
import { useTasksStore } from '@/stores/tasks'
import { useAuthStore } from '@/stores/auth'
import { useClientsStore } from '@/stores/clients'
import {
  signedAttachmentUrl,
  isImage,
  formatBytes,
  type TaskAttachmentMeta
} from '@/lib/taskAttachments'
import ImageLightbox from '@/components/workstation/ImageLightbox.vue'

const tasks = useTasksStore()
const auth = useAuthStore()
const clients = useClientsStore()

interface FileRow extends TaskAttachmentMeta {
  taskId: string
  taskRef: string
  taskTitle: string
}

const allFiles = computed<FileRow[]>(() => {
  const out: FileRow[] = []
  for (const t of tasks.tasksForCurrentClient) {
    const atts = (t.attachments as TaskAttachmentMeta[]) ?? []
    for (const a of atts) {
      out.push({ ...a, taskId: t.id, taskRef: t.reference_number, taskTitle: t.title })
    }
  }
  out.sort((a, b) => (b.uploaded_at ?? '').localeCompare(a.uploaded_at ?? ''))
  return out
})

const images = computed(() => allFiles.value.filter((f) => isImage(f.mime_type)))

const thumbs = ref<Record<string, string>>({})
const errorMsg = ref<string | null>(null)

watch(
  allFiles,
  async (list) => {
    for (const a of list) {
      if (!a.id || thumbs.value[a.id]) continue
      if (!isImage(a.mime_type)) continue
      try {
        const url = await signedAttachmentUrl(a.path, 3600, {
          width: 160,
          height: 160,
          resize: 'cover'
        })
        thumbs.value = { ...thumbs.value, [a.id]: url }
      } catch (e) {
        console.warn('[files] thumb sign failed:', (e as Error).message)
      }
    }
  },
  { immediate: true, deep: true }
)

const lightboxIndex = ref<number | null>(null)
const openShareId = ref<string | null>(null)

async function activate(f: FileRow) {
  if (isImage(f.mime_type)) {
    const idx = images.value.findIndex((x) => x.id === f.id)
    if (idx !== -1) lightboxIndex.value = idx
    return
  }
  try {
    const url = await signedAttachmentUrl(f.path, 600)
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function openParentTask(f: FileRow) {
  tasks.selectTask(f.taskId)
}

function iconFor(f: TaskAttachmentMeta) {
  if (isImage(f.mime_type)) return FileImage
  if (f.mime_type?.includes('pdf') || f.mime_type?.startsWith('text/')) return FileText
  return FileIcon
}

function uploaderName(f: FileRow) {
  if (f.uploaded_by && auth.user && f.uploaded_by === auth.user.id) {
    return auth.fullName || auth.user.email || 'You'
  }
  return f.uploaded_by ? '—' : 'Unknown'
}
function uploaderInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'BB'
  )
}

function toggleShare(id: string) {
  openShareId.value = openShareId.value === id ? null : id
}

const connectors = [
  { key: 'slack', label: 'Slack', icon: Slack, soon: true },
  { key: 'email', label: 'Email', icon: Mail, soon: true },
  { key: 'ig', label: 'Instagram', icon: Instagram, soon: true },
  { key: 'fb', label: 'Facebook', icon: Facebook, soon: true },
  { key: 'li', label: 'LinkedIn', icon: Linkedin, soon: true }
]
</script>

<template>
  <div class="space-y-4">
    <header class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h2 class="text-sm font-medium text-base-content/60 uppercase tracking-wider">
          Files
        </h2>
        <p class="text-xs text-base-content/50 mt-1">
          Every attachment across {{ clients.currentClient?.name ?? 'this client' }}'s tasks.
        </p>
      </div>
      <div class="text-xs text-base-content/60 flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <Paperclip class="w-3.5 h-3.5" :stroke-width="1.75" />
          {{ allFiles.length }} file{{ allFiles.length === 1 ? '' : 's' }}
        </span>
      </div>
    </header>

    <!-- Empty -->
    <div
      v-if="allFiles.length === 0"
      class="bg-white rounded-xl border border-base-300 shadow-md px-6 py-12 text-center text-sm text-base-content/60"
    >
      No files attached to any task yet for {{ clients.currentClient?.name ?? 'this client' }}.
      <div class="text-xs text-base-content/40 mt-2">
        Open any task and drop or paste files into its drawer.
      </div>
    </div>

    <!-- File grid -->
    <ul v-else class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="f in allFiles"
        :key="`${f.taskId}:${f.id}`"
        class="relative bg-white rounded-xl border border-base-300 shadow-sm hover:shadow-md hover:border-base-content/20 transition-shadow"
      >
        <div class="flex items-stretch gap-3 p-2">
          <!-- thumb -->
          <button
            type="button"
            class="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-base-200/40 border border-base-300 flex items-center justify-center text-base-content/40"
            :title="`Open ${f.name}`"
            @click="activate(f)"
          >
            <img
              v-if="isImage(f.mime_type) && thumbs[f.id]"
              :src="thumbs[f.id]"
              :alt="f.name"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <component v-else :is="iconFor(f)" class="w-6 h-6" :stroke-width="1.5" />
          </button>

          <!-- details (filename + meta + collaborator + share button stacked) -->
          <div class="flex-1 min-w-0 flex flex-col justify-between gap-1">
            <button
              type="button"
              class="text-sm font-medium truncate text-left hover:text-primary"
              :title="f.name"
              @click="activate(f)"
            >
              {{ f.name }}
            </button>

            <button
              type="button"
              class="flex items-center gap-1 text-xs text-base-content/60 hover:text-primary truncate min-w-0"
              @click="openParentTask(f)"
              :title="`${f.taskRef} · ${f.taskTitle}`"
            >
              <Hash class="w-3 h-3 shrink-0" :stroke-width="1.75" />
              <span class="truncate">{{ f.taskRef }} · {{ f.taskTitle }}</span>
            </button>

            <div class="flex items-center justify-between gap-2 mt-0.5">
              <div class="flex items-center gap-1.5 min-w-0">
                <div
                  class="w-5 h-5 rounded-full bg-primary/15 text-primary text-[0.6rem] font-semibold flex items-center justify-center shrink-0"
                  :title="uploaderName(f)"
                >
                  {{ uploaderInitials(uploaderName(f)) }}
                </div>
                <span class="text-[0.7rem] text-base-content/60 truncate">
                  {{ uploaderName(f) }}
                </span>
                <span class="text-base-content/30 text-[0.7rem]">·</span>
                <span class="text-[0.7rem] text-base-content/60 tabular-nums shrink-0">
                  {{ formatBytes(f.size) }}
                </span>
              </div>

              <button
                type="button"
                class="btn btn-ghost btn-xs gap-1 shrink-0"
                :aria-expanded="openShareId === f.id"
                @click="toggleShare(f.id)"
              >
                <Send class="w-3 h-3" :stroke-width="1.75" />
                Share
                <ChevronDown class="w-2.5 h-2.5" :stroke-width="1.75" />
              </button>
            </div>
          </div>
        </div>

        <!-- share popover (positioned to bottom-right of card) -->
        <div
          v-if="openShareId === f.id"
          class="absolute right-2 top-full mt-1 w-48 rounded-lg bg-white border border-base-300 shadow-lg z-20 py-1"
          role="menu"
          @click.stop
        >
          <div class="px-3 py-1.5 text-[0.65rem] uppercase tracking-wider text-base-content/50 font-semibold">
            Post to
          </div>
          <button
            v-for="c in connectors"
            :key="c.key"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200/60 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="c.soon"
            :title="c.soon ? 'Coming soon' : ''"
          >
            <component :is="c.icon" class="w-3.5 h-3.5 text-base-content/60" :stroke-width="1.75" />
            <span class="flex-1 text-left">{{ c.label }}</span>
            <span v-if="c.soon" class="text-[0.65rem] text-base-content/40">Soon</span>
          </button>
          <div class="border-t border-base-300/60 my-1" />
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-base-200/60"
            @click="activate(f); openShareId = null"
          >
            <ExternalLink class="w-3.5 h-3.5 text-base-content/60" :stroke-width="1.75" />
            Open file
          </button>
        </div>
      </li>
    </ul>

    <p v-if="errorMsg" class="text-xs text-error">{{ errorMsg }}</p>

    <ImageLightbox
      :images="images"
      :index="lightboxIndex"
      @close="lightboxIndex = null"
      @update:index="(i) => (lightboxIndex = i)"
    />
  </div>
</template>
