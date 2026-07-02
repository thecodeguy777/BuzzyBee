<script setup lang="ts">
import { computed, ref } from 'vue'
import { Copy, Check, Mail, ArrowUpRight, Ban, MessageSquareText } from 'lucide-vue-next'
import type { Meeting } from '@/stores/meetings'
import { joinLinkOf, startOf, statusOf, timeRange } from '@/lib/meetingDisplay'

// A secondary upcoming-meeting row ("Later" section) — date block, time,
// title, actions. The closest meeting renders as NextMeetingHero instead.

const props = defineProps<{ meeting: Meeting; now: number }>()
defineEmits<{ invite: []; details: []; cancel: [] }>()

const day = computed(() => {
  const d = new Date(startOf(props.meeting))
  return {
    num: d.getDate(),
    label: `${d.toLocaleDateString(undefined, { month: 'short' })} · ${d.toLocaleDateString(undefined, { weekday: 'short' })}`
  }
})

const copied = ref(false)
async function copyLink() {
  await navigator.clipboard.writeText(joinLinkOf(props.meeting))
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
function join() {
  window.open('/meet/' + props.meeting.token, '_blank', 'noopener')
}
</script>

<template>
  <div class="group flex items-center gap-4 px-4 py-3.5 rounded-2xl bg-base-100 border border-base-300 shadow-hc-1 transition-all hover:border-primary/30 hover:-translate-y-px hover:shadow-hc-2">
    <!-- date block -->
    <div class="w-[72px] shrink-0 text-center">
      <div class="text-xl font-extrabold tracking-tight leading-none">{{ day.num }}</div>
      <div class="text-[0.68rem] font-bold text-base-content/45 uppercase tracking-wide mt-0.5">{{ day.label }}</div>
    </div>
    <!-- time -->
    <div class="w-[118px] shrink-0 text-[0.8rem] font-semibold text-base-content/65 tabular-nums">
      {{ timeRange(meeting) }}
    </div>
    <!-- title -->
    <div class="flex-1 min-w-0">
      <div class="text-[0.92rem] font-bold truncate flex items-center gap-2">
        {{ meeting.title }}
        <span
          v-if="statusOf(meeting, now).live"
          class="inline-flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wider text-success shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Live
        </span>
      </div>
      <div class="text-[0.72rem] text-base-content/45 mt-0.5">
        Scheduled{{ meeting.invites.length ? ` · ${meeting.invites.length} invited` : '' }} · {{ statusOf(meeting, now).label }}
      </div>
    </div>
    <!-- actions -->
    <div class="flex items-center gap-2 shrink-0">
      <button type="button" class="mini-ic" :title="copied ? 'Copied' : 'Copy link'" @click="copyLink">
        <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" :stroke-width="1.9" />
      </button>
      <button type="button" class="mini-ic" title="Invite by email" @click="$emit('invite')">
        <Mail class="w-3.5 h-3.5" :stroke-width="1.9" />
      </button>
      <button type="button" class="mini-ic" title="Chat transcript & attendance" @click="$emit('details')">
        <MessageSquareText class="w-3.5 h-3.5" :stroke-width="1.9" />
      </button>
      <button type="button" class="mini-ic hover:!text-error hover:!border-error/40" title="Cancel meeting" @click="$emit('cancel')">
        <Ban class="w-3.5 h-3.5" :stroke-width="1.9" />
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[9px] text-[0.8rem] font-bold text-primary-content bg-primary hover:opacity-90 transition-opacity"
        @click="join"
      >
        <ArrowUpRight class="w-3.5 h-3.5" :stroke-width="2.2" />
        Join
      </button>
    </div>
  </div>
</template>

<style scoped>
.mini-ic {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: var(--hc-ink-3);
  border: 1px solid var(--color-base-300);
  transition: color 0.12s, border-color 0.12s;
}
.mini-ic:hover {
  border-color: var(--accent-bord);
  color: var(--accent);
}
</style>
