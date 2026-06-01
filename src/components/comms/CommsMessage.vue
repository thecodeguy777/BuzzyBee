<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Smile, MessageSquare, CheckSquare, Pin, Paperclip, Link2, ArrowUpRight, ChevronRight, Sparkles
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { useTeamStore } from '@/stores/team'
import { formatBytes } from '@/lib/commsAttachments'
import type { CommsMessage, Attachment } from '@/composables/useChannelStream'
import type { Task } from '@/stores/tasks'

const props = defineProps<{
  message: CommsMessage
  reactions: { emoji: string; count: number; mine: boolean }[]
  replyCount: number
  lastReplyAt?: string | null
  linkedTask?: Task | null
  canManage?: boolean
}>()

const emit = defineEmits<{
  (e: 'react', emoji: string): void
  (e: 'open-thread'): void
  (e: 'make-task'): void
  (e: 'toggle-pin'): void
  (e: 'mark-decision'): void
  (e: 'open-task', taskId: string): void
}>()

const team = useTeamStore()
const QUICK = ['🐝', '🔥', '🙌', '✅', '👀', '🚀', '👍', '❤️']
const pickerOpen = ref(false)

const name = computed(
  () => props.message.user_name || team.profiles[props.message.user_id]?.full_name || 'Someone',
)
const avatarUrl = computed(() => team.profiles[props.message.user_id]?.avatar_url ?? null)
const time = computed(() =>
  new Date(props.message.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
)
function react(e: string) {
  pickerOpen.value = false
  emit('react', e)
}
function isImage(a: Attachment) {
  return a.kind === 'image' && !!a.url
}
</script>

<template>
  <div class="group relative flex gap-3 px-4 py-1.5 hover:bg-base-200/40">
    <!-- hover toolbar -->
    <div
      class="absolute -top-3 right-4 z-10 hidden group-hover:flex items-center gap-0.5 rounded-lg border border-base-300 bg-base-100 shadow-sm p-0.5"
    >
      <div class="relative">
        <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/60" title="React" @click="pickerOpen = !pickerOpen">
          <Smile class="w-4 h-4" :stroke-width="1.75" />
        </button>
        <div
          v-if="pickerOpen"
          class="absolute right-0 top-full mt-1 z-20 flex gap-0.5 rounded-lg border border-base-300 bg-base-100 shadow-md p-1"
          @mouseleave="pickerOpen = false"
        >
          <button v-for="e in QUICK" :key="e" class="w-7 h-7 rounded-md hover:bg-base-200 text-base" @click="react(e)">{{ e }}</button>
        </div>
      </div>
      <button class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/60" title="Reply in thread" @click="emit('open-thread')">
        <MessageSquare class="w-4 h-4" :stroke-width="1.75" />
      </button>
      <button class="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-primary/10 text-primary text-xs font-semibold" title="Turn into task" @click="emit('make-task')">
        <CheckSquare class="w-3.5 h-3.5" :stroke-width="1.75" /> Task
      </button>
      <button
        class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center"
        :class="message.is_decision ? 'text-primary' : 'text-base-content/60'"
        title="Mark as decision / action item" @click="emit('mark-decision')"
      >
        <Sparkles class="w-3.5 h-3.5" :stroke-width="1.75" />
      </button>
      <button
        class="w-7 h-7 rounded-md hover:bg-base-200 flex items-center justify-center"
        :class="message.is_pinned ? 'text-primary' : 'text-base-content/60'"
        title="Pin" @click="emit('toggle-pin')"
      >
        <Pin class="w-3.5 h-3.5" :stroke-width="1.75" />
      </button>
    </div>

    <HexAvatar :avatar-url="avatarUrl" :name="name" :size="38" class="mt-0.5" />

    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-semibold text-base-content">{{ name }}</span>
        <span class="text-[0.7rem] text-base-content/40">{{ time }}</span>
        <span v-if="message.is_pinned" class="inline-flex items-center gap-1 text-[0.65rem] text-primary"><Pin class="w-3 h-3" :stroke-width="2" /> pinned</span>
      </div>

      <div v-if="message.body" class="text-sm text-base-content/90 whitespace-pre-wrap break-words leading-relaxed">{{ message.body }}</div>

      <!-- attachments -->
      <div v-if="message.attachments?.length" class="mt-1.5 flex flex-col gap-2 items-start">
        <template v-for="(a, i) in message.attachments" :key="i">
          <a v-if="isImage(a)" :href="a.url" target="_blank" rel="noopener" class="block max-w-xs rounded-xl overflow-hidden border border-base-300">
            <img :src="a.url" :alt="a.name" class="w-full max-h-64 object-cover" />
          </a>
          <a v-else-if="a.kind === 'file'" :href="a.url" target="_blank" rel="noopener" class="inline-flex items-center gap-2.5 rounded-xl border border-base-300 bg-base-100 px-3 py-2 max-w-xs hover:border-primary/40">
            <span class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Paperclip class="w-4 h-4" :stroke-width="1.75" /></span>
            <span class="min-w-0">
              <span class="block text-sm font-medium truncate">{{ a.name }}</span>
              <span class="block text-[0.7rem] text-base-content/50">{{ formatBytes(a.size) }}</span>
            </span>
          </a>
          <a v-else :href="a.url" target="_blank" rel="noopener" class="flex items-stretch rounded-xl overflow-hidden border border-base-300 bg-base-100 max-w-sm hover:border-primary/40">
            <span class="w-1 bg-primary shrink-0" />
            <span class="px-3 py-2 min-w-0">
              <span class="flex items-center gap-1 text-[0.7rem] text-base-content/50"><Link2 class="w-3 h-3" /> {{ a.name }}</span>
              <span class="block text-sm font-medium text-primary truncate">{{ a.url }}</span>
            </span>
          </a>
        </template>
      </div>

      <!-- linked task -->
      <button
        v-if="linkedTask"
        class="mt-1.5 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-1.5 text-left hover:bg-primary/10"
        @click="emit('open-task', linkedTask.id)"
      >
        <CheckSquare class="w-3.5 h-3.5 text-primary shrink-0" :stroke-width="1.75" />
        <span class="text-xs font-medium text-base-content truncate max-w-[16rem]">{{ linkedTask.title }}</span>
        <span class="text-[0.65rem] uppercase tracking-wider text-primary">View in Tasks</span>
        <ArrowUpRight class="w-3.5 h-3.5 text-primary" :stroke-width="1.75" />
      </button>

      <!-- reactions -->
      <div v-if="reactions.length" class="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <button
          v-for="r in reactions"
          :key="r.emoji"
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border"
          :class="r.mine ? 'bg-primary/10 text-primary border-primary/30' : 'bg-base-200 text-base-content/70 border-transparent'"
          @click="emit('react', r.emoji)"
        >
          <span class="text-sm">{{ r.emoji }}</span>{{ r.count }}
        </button>
        <button class="w-6 h-6 rounded-full bg-base-200 text-base-content/50 flex items-center justify-center" title="Add reaction" @click="pickerOpen = !pickerOpen">
          <Smile class="w-3.5 h-3.5" :stroke-width="1.75" />
        </button>
      </div>

      <!-- thread chip -->
      <button
        v-if="replyCount > 0"
        class="mt-1.5 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 pl-2 pr-2.5 py-1 text-xs font-medium text-primary hover:border-primary/40"
        @click="emit('open-thread')"
      >
        {{ replyCount }} {{ replyCount === 1 ? 'reply' : 'replies' }}
        <span v-if="lastReplyAt" class="text-base-content/40 font-normal">· last {{ new Date(lastReplyAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }}</span>
        <ChevronRight class="w-3.5 h-3.5 text-base-content/40" :stroke-width="2" />
      </button>
    </div>
  </div>
</template>
