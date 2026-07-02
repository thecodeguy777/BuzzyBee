<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessageSquareText, Users, Paperclip } from 'lucide-vue-next'
import MeetingModal from '@/components/workstation/meetings/MeetingModal.vue'
import { useMeetingsStore, type Meeting, type MeetingMessage } from '@/stores/meetings'
import { dayLabel, msgTime, startOf, timeRange } from '@/lib/meetingDisplay'

// Post-meeting record: attendance + chat, from the durable meeting_messages
// stream. Fetches on mount — the component only exists while the modal is open.

const props = defineProps<{ meeting: Meeting }>()
const emit = defineEmits<{ close: [] }>()
const store = useMeetingsStore()

const transcript = ref<MeetingMessage[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    transcript.value = await store.fetchTranscript(props.meeting.id)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

// Attendance derives from the durable stream: everyone who posted a join line
// or said anything. (Recorded from 2026-07-02 on — older calls predate the
// dual-write and show an empty transcript.)
const participants = computed(() => {
  const byId = new Map<string, { name: string; firstSeen: string; messages: number }>()
  for (const msg of transcript.value) {
    const key = msg.userId ?? msg.name ?? '?'
    const cur = byId.get(key)
    if (!cur) {
      byId.set(key, { name: msg.name || 'Guest', firstSeen: msg.createdAt, messages: msg.kind === 'text' ? 1 : 0 })
    } else if (msg.kind === 'text') {
      cur.messages++
    }
  }
  return [...byId.values()]
})
</script>

<template>
  <MeetingModal
    :icon="MessageSquareText"
    :title="meeting.title"
    :subtitle="`${dayLabel(startOf(meeting))} · ${timeRange(meeting)}`"
    width="w-[600px]"
    scroll-body
    @close="emit('close')"
  >
    <div class="p-4 space-y-4">
      <div v-if="loading" class="text-sm text-base-content/50">Loading transcript…</div>
      <div v-else-if="error" class="text-sm text-error">{{ error }}</div>

      <template v-else>
        <!-- Participants -->
        <section>
          <h3 class="text-[0.65rem] uppercase tracking-wider font-semibold text-base-content/40 flex items-center gap-1.5 mb-2">
            <Users class="w-3 h-3" :stroke-width="1.75" />
            Participants ({{ participants.length }})
          </h3>
          <div v-if="participants.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="p in participants"
              :key="p.name + p.firstSeen"
              class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-base-200/60"
              :title="`First seen ${msgTime(p.firstSeen)}`"
            >
              {{ p.name }}
              <span v-if="p.messages" class="text-base-content/45 tabular-nums">{{ p.messages }} msg{{ p.messages === 1 ? '' : 's' }}</span>
            </span>
          </div>
          <p v-else class="text-xs italic text-base-content/40">No attendance recorded.</p>
        </section>

        <!-- Messages -->
        <section>
          <h3 class="text-[0.65rem] uppercase tracking-wider font-semibold text-base-content/40 flex items-center gap-1.5 mb-2">
            <MessageSquareText class="w-3 h-3" :stroke-width="1.75" />
            Chat
          </h3>
          <ul v-if="transcript.length" class="space-y-1.5">
            <li v-for="msg in transcript" :key="msg.id" class="text-sm flex items-baseline gap-2">
              <span class="text-[0.65rem] text-base-content/35 tabular-nums shrink-0 w-14">{{ msgTime(msg.createdAt) }}</span>
              <template v-if="msg.kind === 'system'">
                <span class="text-xs italic text-base-content/45">{{ msg.name || 'Someone' }} {{ msg.body }}</span>
              </template>
              <template v-else>
                <span class="font-medium shrink-0">{{ msg.name || 'Guest' }}</span>
                <span v-if="msg.kind === 'file'" class="inline-flex items-center gap-1 text-base-content/70">
                  <Paperclip class="w-3 h-3" :stroke-width="1.75" />
                  {{ msg.file?.filename || 'attachment' }}
                </span>
                <span v-else class="text-base-content/80 min-w-0 break-words">{{ msg.body }}</span>
              </template>
            </li>
          </ul>
          <p v-else class="text-xs italic text-base-content/40">
            No messages recorded. (Chat + attendance are kept for meetings held from July 2, 2026 onward.)
          </p>
        </section>
      </template>
    </div>
  </MeetingModal>
</template>
