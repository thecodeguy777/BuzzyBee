<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Smile, MessageSquare, CheckSquare, Pin, Paperclip, Link2, ChevronRight, Sparkles
} from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import CommsLinkedTask from '@/components/comms/CommsLinkedTask.vue'
import CommsRichText from '@/components/comms/CommsRichText.vue'
import SeenCluster from '@/components/comms/SeenCluster.vue'
import CommsProfilePopover from '@/components/comms/CommsProfilePopover.vue'
import { userColor } from '@/lib/userColor'
import { useTeamStore } from '@/stores/team'
import { useProfileHover } from '@/composables/useProfileHover'
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
  /** Compact follow-up of the previous message from the same author. */
  continuation?: boolean
  /** Members whose last-read position is this message ("seen by" honeycomb). */
  seen?: { id: string; name: string; avatarUrl: string | null }[]
  /** Pulse this line — you haven't seen it yet. */
  unseen?: boolean
}>()

const emit = defineEmits<{
  (e: 'react', emoji: string): void
  (e: 'open-thread'): void
  (e: 'make-task'): void
  (e: 'toggle-pin'): void
  (e: 'mark-decision'): void
  (e: 'open-task', taskId: string): void
  (e: 'open-dm', userId: string): void
}>()

const team = useTeamStore()
const QUICK = ['🐝', '🔥', '🙌', '✅', '👀', '🚀', '👍', '❤️']
const pickerOpen = ref(false)

// Hover profile card — shared with the Comms dock (see CommsProfilePopover).
const hover = useProfileHover()
function onStartDm(id: string) {
  hover.close()
  emit('open-dm', id)
}

const name = computed(
  () => props.message.user_name || team.profiles[props.message.user_id]?.full_name || 'Someone',
)
const avatarUrl = computed(() => team.profiles[props.message.user_id]?.avatar_url ?? null)
const nameColor = computed(() => userColor(props.message.user_id))
const mentionNames = computed(
  () => (props.message.mentioned_user_ids ?? []).map((id) => team.profiles[id]?.full_name).filter(Boolean) as string[]
)
const time = computed(() =>
  new Date(props.message.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
)
// Compact time (no AM/PM) shown on hover in the gutter for grouped follow-ups.
const shortTime = computed(() => time.value.replace(/\s?(AM|PM)/i, ''))
function react(e: string) {
  pickerOpen.value = false
  emit('react', e)
}
function isImage(a: Attachment) {
  return a.kind === 'image' && !!a.url
}
</script>

<template>
  <div class="group relative flex gap-2.5 px-[18px] hover:bg-base-200/40" :class="[continuation ? 'py-px' : 'pt-1.5 pb-0.5 mt-0.5', unseen ? 'msg-unseen' : '']">
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

    <div class="w-[34px] shrink-0 flex justify-center" :class="continuation ? '' : 'mt-0.5'">
      <button
        v-if="!continuation"
        type="button"
        class="rounded-md transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        @mouseenter="hover.open(message.user_id, $event)"
        @mouseleave="hover.scheduleClose"
        @click="hover.open(message.user_id, $event)"
      >
        <HexAvatar :avatar-url="avatarUrl" :name="name" :color-key="message.user_id" :size="32" />
      </button>
      <span v-else class="text-[0.6rem] leading-[18px] text-base-content/40 opacity-0 group-hover:opacity-100 tabular-nums">{{ shortTime }}</span>
    </div>

    <div class="flex-1 min-w-0">
      <div v-if="!continuation" class="flex items-baseline gap-2 -mt-0.5">
        <button
          type="button"
          class="text-sm font-bold hover:underline focus:outline-none"
          :style="{ color: nameColor }"
          @mouseenter="hover.open(message.user_id, $event)"
          @mouseleave="hover.scheduleClose"
          @click="hover.open(message.user_id, $event)"
        >{{ name }}</button>
        <span class="text-[0.7rem] text-base-content/40">{{ time }}</span>
        <span v-if="message.is_pinned" class="inline-flex items-center gap-1 text-[0.65rem] text-primary"><Pin class="w-3 h-3" :stroke-width="2" /> pinned</span>
      </div>

      <div v-if="message.body" class="text-sm text-base-content/90 whitespace-pre-wrap break-words leading-[1.46]">
        <CommsRichText :text="message.body" :mention-names="mentionNames" />
      </div>

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

      <!-- linked task — embedded card / pill -->
      <CommsLinkedTask v-if="linkedTask" :task="linkedTask" @open="emit('open-task', $event)" />

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

      <!-- seen-by honeycomb -->
      <div v-if="seen && seen.length" class="mt-1.5 flex items-center justify-end gap-1.5 pr-0.5">
        <span class="text-[0.6rem] font-medium text-base-content/40">Seen</span>
        <SeenCluster :members="seen" :size="18" :max="4" />
      </div>
    </div>

    <!-- Hover profile card -->
    <CommsProfilePopover
      :user-id="hover.userId.value"
      :card-style="hover.style.value"
      @start-dm="onStartDm"
      @hover="hover.cancelClose"
      @leave="hover.scheduleClose"
    />
  </div>
</template>

<style scoped>
/* Unseen "breathing" highlight — a soft aubergine pulse to draw the eye. */
@keyframes msg-breathe {
  0%, 100% { background-color: color-mix(in oklab, var(--accent) 4%, transparent); }
  50% { background-color: color-mix(in oklab, var(--accent) 15%, transparent); }
}
@keyframes msg-breathe-bar {
  0%, 100% { opacity: 0.35; transform: scaleY(0.85); }
  50% { opacity: 1; transform: scaleY(1); }
}
.msg-unseen {
  animation: msg-breathe 2.2s ease-in-out infinite;
}
.msg-unseen::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
  transform-origin: center;
  animation: msg-breathe-bar 2.2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .msg-unseen { animation: none; background-color: color-mix(in oklab, var(--accent) 10%, transparent); }
  .msg-unseen::before { animation: none; opacity: 0.8; }
}
</style>
