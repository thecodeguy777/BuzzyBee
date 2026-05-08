<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from 'vue'
import { Layers } from 'lucide-vue-next'
import CoachingPrompt from './components/CoachingPrompt.vue'
import type { TranscriptChunk, CoachingPromptData } from '../shared/ipc-channels'

const transcriptLines = ref<TranscriptChunk[]>([])
const coachingPrompts = ref<CoachingPromptData[]>([])
const meetingStatus = ref<'active' | 'ended'>('active')
const scrollContainer = ref<HTMLElement | null>(null)

// Merge consecutive same-speaker chunks
const groupedTranscript = computed(() => {
  const groups: { speaker: string; text: string; timestamp: number; isFinal: boolean }[] = []
  for (const line of transcriptLines.value) {
    const last = groups[groups.length - 1]
    if (last && last.speaker === line.speaker && last.isFinal === line.isFinal) {
      last.text += ' ' + line.text
    } else {
      groups.push({ speaker: line.speaker, text: line.text, timestamp: line.timestamp, isFinal: line.isFinal })
    }
  }
  return groups
})

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

onMounted(() => {
  window.electronAPI.onTranscriptLine((data: TranscriptChunk) => {
    if (!data.isFinal) {
      const lastIdx = transcriptLines.value.length - 1
      if (lastIdx >= 0 && !transcriptLines.value[lastIdx].isFinal) {
        transcriptLines.value[lastIdx] = data
      } else {
        transcriptLines.value.push(data)
      }
    } else {
      const lastIdx = transcriptLines.value.length - 1
      if (lastIdx >= 0 && !transcriptLines.value[lastIdx].isFinal) {
        transcriptLines.value[lastIdx] = data
      } else {
        transcriptLines.value.push(data)
      }
    }

    // Keep last ~25 entries
    if (transcriptLines.value.length > 30) {
      transcriptLines.value = transcriptLines.value.slice(-25)
    }

    scrollToBottom()
  })

  window.electronAPI.onCoachingPrompt((data: CoachingPromptData) => {
    coachingPrompts.value.push(data)
    if (coachingPrompts.value.length > 3) {
      coachingPrompts.value = coachingPrompts.value.slice(-3)
    }
    scrollToBottom()
  })

  window.electronAPI.onMeetingStatus((data) => {
    meetingStatus.value = data.status
  })
})
</script>

<template>
  <div class="w-full h-full flex flex-col rounded-xl overflow-hidden" style="background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(99, 102, 241, 0.25);">
    <!-- Draggable header -->
    <div
      class="flex items-center gap-2 px-4 py-2.5 cursor-move select-none"
      style="-webkit-app-region: drag; background: linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(168, 85, 247, 0.3));"
    >
      <Layers class="w-3.5 h-3.5 text-white/70" />
      <span class="text-[11px] font-medium text-white/70 tracking-wide">HiveMind AI</span>
      <div class="flex-1"></div>
      <div
        v-if="meetingStatus === 'active'"
        class="w-2 h-2 rounded-full bg-red-400 rec-blink"
      ></div>
      <span v-if="meetingStatus === 'ended'" class="text-[10px] text-white/40">Ended</span>
    </div>

    <div class="flex flex-1 overflow-hidden">
      <div class="w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-blue-500/30 shrink-0"></div>

      <div ref="scrollContainer" class="flex-1 overflow-y-auto p-3 space-y-3">
        <!-- Grouped transcript -->
        <div
          v-for="(group, i) in groupedTranscript"
          :key="`${group.timestamp}-${i}`"
          class="flex gap-2 items-start animate-fade-in"
        >
          <span
            class="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5"
            :class="group.speaker === 'You'
              ? 'bg-blue-500/20 text-blue-300'
              : 'bg-purple-500/20 text-purple-300'"
          >
            {{ group.speaker }}
          </span>
          <span
            class="text-xs leading-relaxed"
            :class="group.isFinal ? 'text-white/85' : 'text-white/40 italic'"
          >
            {{ group.text }}
          </span>
        </div>

        <!-- Empty state -->
        <div v-if="groupedTranscript.length === 0" class="text-center py-8">
          <p class="text-xs text-white/30">Listening for speech...</p>
        </div>

        <!-- Coaching prompts -->
        <div v-if="coachingPrompts.length > 0" class="mt-3 space-y-2">
          <CoachingPrompt
            v-for="prompt in coachingPrompts"
            :key="prompt.timestamp"
            :text="prompt.text"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
</style>
