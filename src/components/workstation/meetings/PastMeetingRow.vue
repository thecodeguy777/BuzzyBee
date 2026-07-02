<script setup lang="ts">
import { computed, ref } from 'vue'
import { Copy, Check, MessageSquareText, RotateCw } from 'lucide-vue-next'
import type { Meeting } from '@/stores/meetings'
import { joinLinkOf, startOf } from '@/lib/meetingDisplay'

// One meeting inside a past-day group: time, initial avatar, title, type,
// hover actions (transcript · copy · rebook). Clicking the row opens the
// transcript; per the design, tags/attendee stacks live in that modal (they'd
// cost a message-stream query per row here).

const props = defineProps<{ meeting: Meeting }>()
defineEmits<{ details: []; rebook: [] }>()

const time = computed(() =>
  new Date(startOf(props.meeting)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
)
const initial = computed(() => (props.meeting.title.charAt(0) || 'M').toUpperCase())

const copied = ref(false)
async function copyLink(e: Event) {
  e.stopPropagation()
  await navigator.clipboard.writeText(joinLinkOf(props.meeting))
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <div
    class="group flex items-center gap-4 px-4 py-3 border-b border-base-200 last:border-b-0 hover:bg-base-200/40 transition-colors cursor-pointer"
    role="button"
    tabindex="0"
    title="View transcript & attendance"
    @click="$emit('details')"
    @keydown.enter="$emit('details')"
  >
    <!-- time -->
    <div class="w-[88px] shrink-0">
      <div class="text-[0.82rem] font-bold tabular-nums">{{ time }}</div>
      <div class="text-[0.68rem] text-base-content/45 mt-px">
        {{ meeting.scheduledAt ? meeting.durationMinutes + ' min' : '—' }}
      </div>
    </div>
    <!-- avatar -->
    <span
      class="w-8 h-8 rounded-[9px] grid place-items-center text-white text-xs font-extrabold shrink-0"
      style="background: linear-gradient(135deg, #8b5cf6, #6d28d9)"
    >{{ initial }}</span>
    <!-- title + type -->
    <div class="flex-1 min-w-0">
      <div class="text-[0.88rem] font-bold truncate">{{ meeting.title }}</div>
      <div class="flex items-center gap-2 mt-0.5">
        <span
          class="inline-flex items-center gap-1.5 text-[0.66rem] font-bold tracking-wide"
          :class="meeting.scheduledAt ? 'text-primary' : 'text-base-content/45'"
        >
          <span class="w-[5px] h-[5px] rounded-full bg-current" />
          {{ meeting.scheduledAt ? 'Scheduled' : 'Instant' }}
        </span>
        <span class="text-[0.66rem] font-semibold text-base-content/35 uppercase tracking-wider">
          {{ meeting.endedAt ? 'ended' : 'expired' }}
        </span>
      </div>
    </div>
    <!-- hover actions -->
    <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click.stop>
      <button type="button" class="hv" title="View transcript" @click="$emit('details')">
        <MessageSquareText class="w-[15px] h-[15px]" :stroke-width="1.9" />
      </button>
      <button type="button" class="hv" :title="copied ? 'Copied' : 'Copy link'" @click="copyLink">
        <component :is="copied ? Check : Copy" class="w-[15px] h-[15px]" :stroke-width="1.9" />
      </button>
      <button type="button" class="hv !w-auto px-3 gap-1.5 text-[0.76rem] font-bold" @click="$emit('rebook')">
        <RotateCw class="w-[15px] h-[15px]" :stroke-width="1.9" />
        Rebook
      </button>
    </div>
  </div>
</template>

<style scoped>
.hv {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--hc-ink-2);
  background: var(--color-base-100);
  border: 1px solid var(--color-base-300);
  transition: color 0.12s, border-color 0.12s;
}
.hv:hover {
  border-color: var(--accent-bord);
  color: var(--accent);
}
</style>
