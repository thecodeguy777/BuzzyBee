<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, Copy, Check, Mail, Ban, CalendarClock } from 'lucide-vue-next'
import type { Meeting } from '@/stores/meetings'
import { countdownTo, joinLinkOf, startOf, statusOf, timeRange } from '@/lib/meetingDisplay'

// The "Next up" hero — the single closest upcoming meeting, promoted to a
// gradient card with a live countdown (per the Meetings.html design).

const props = defineProps<{ meeting: Meeting; now: number }>()
defineEmits<{ invite: []; cancel: [] }>()

const live = computed(() => statusOf(props.meeting, props.now).live)
const countdown = computed(() => countdownTo(startOf(props.meeting), props.now))
const whenShort = computed(() => {
  const d = new Date(startOf(props.meeting))
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
})

// Invitee initials for the avatar stack (max 3 + overflow count).
const AV_GRADIENTS = [
  'linear-gradient(135deg,#ec4899,#be185d)',
  'linear-gradient(135deg,#3b82f6,#1d4ed8)',
  'linear-gradient(135deg,#14b8a6,#0f766e)'
]
const avatars = computed(() => {
  const inv = props.meeting.invites
  return {
    shown: inv.slice(0, 3).map((i, idx) => ({
      key: i.id,
      initial: (i.name || i.email).charAt(0).toUpperCase(),
      bg: AV_GRADIENTS[idx % AV_GRADIENTS.length]
    })),
    extra: Math.max(0, inv.length - 3)
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
  <div class="hero">
    <div class="hero-hex" />
    <div class="relative flex items-center gap-6 max-md:flex-col max-md:items-stretch">
      <!-- countdown block -->
      <div class="hero-count">
        <span class="hero-live" :class="live ? 'text-success' : ''">
          {{ live ? '● Live now' : '◷ Starts in' }}
        </span>
        <span class="hero-big tabular-nums">{{ live ? 'now' : countdown }}</span>
        <span class="hero-sub">{{ whenShort }}</span>
      </div>

      <!-- info -->
      <div class="flex-1 min-w-0">
        <div class="text-[0.72rem] font-bold tracking-[0.05em] text-white/80 uppercase">
          Next up · {{ timeRange(meeting) }}
        </div>
        <h2 class="font-display text-[1.35rem] font-bold tracking-tight text-white mt-1 mb-2.5 truncate">
          {{ meeting.title }}
        </h2>
        <div class="flex items-center gap-4 flex-wrap">
          <span class="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-white/85">
            <CalendarClock class="w-3.5 h-3.5 opacity-85" :stroke-width="1.9" />
            {{ meeting.durationMinutes >= 60
              ? (meeting.durationMinutes / 60) + 'h' + (meeting.durationMinutes % 60 ? ' ' + (meeting.durationMinutes % 60) + 'm' : '')
              : meeting.durationMinutes + ' min' }}
          </span>
          <div v-if="avatars.shown.length" class="flex items-center">
            <span
              v-for="(a, i) in avatars.shown"
              :key="a.key"
              class="hero-av"
              :class="i > 0 ? '-ml-2' : ''"
              :style="{ background: a.bg }"
            >{{ a.initial }}</span>
            <span v-if="avatars.extra" class="hero-av -ml-2" style="background: rgba(255,255,255,.2)">+{{ avatars.extra }}</span>
            <span class="ml-2 text-[0.72rem] text-white/70 font-semibold">{{ meeting.invites.length }} invited</span>
          </div>
        </div>
      </div>

      <!-- actions -->
      <div class="flex flex-col gap-2 shrink-0 w-[150px] max-md:w-auto">
        <button type="button" class="hero-join" @click="join">
          <ArrowUpRight class="w-4 h-4" :stroke-width="2.2" />
          Join now
        </button>
        <div class="flex gap-2">
          <button type="button" class="hero-ic" @click="copyLink">
            <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" :stroke-width="1.9" />
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
          <button type="button" class="hero-ic" @click="$emit('invite')">
            <Mail class="w-3.5 h-3.5" :stroke-width="1.9" />
            Invite
          </button>
          <button type="button" class="hero-ic !flex-none w-9" title="Cancel meeting" @click="$emit('cancel')">
            <Ban class="w-3.5 h-3.5" :stroke-width="1.9" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(120deg, #2b1a4d, #4c2597 55%, #6d3ac0);
  color: #fff;
  padding: 24px 26px;
  box-shadow: 0 20px 50px -20px rgba(76, 37, 151, 0.6);
}
/* faint honeycomb lattice, fading from the top-right corner */
.hero-hex {
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='42' height='72' viewBox='0 0 42 72'%3E%3Cpath fill='none' stroke='%23fff' stroke-width='1' d='M21 0l18 10.5v21L21 42 3 31.5v-21zM21 42l18 10.5v21M21 42L3 52.5v21'/%3E%3C/svg%3E");
  background-size: 42px 72px;
  -webkit-mask-image: radial-gradient(120% 130% at 88% 0%, #000, transparent 70%);
  mask-image: radial-gradient(120% 130% at 88% 0%, #000, transparent 70%);
}
.hero-count {
  position: relative;
  flex: none;
  width: 112px;
  height: 112px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}
.hero-live {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.6px;
  color: #ffd24a;
  text-transform: uppercase;
}
.hero-big {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1;
  margin-top: 5px;
}
.hero-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 4px;
  font-weight: 600;
  text-align: center;
  padding: 0 4px;
}
.hero-av {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 2px solid #4c2597;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}
.hero-join {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #fff;
  color: #4c2597;
  font-weight: 800;
  font-size: 15px;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 8px 20px -8px rgba(0, 0, 0, 0.4);
  transition: transform 0.14s;
}
.hero-join:hover {
  transform: translateY(-1px);
}
.hero-ic {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.24);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 4px;
  border-radius: 10px;
  transition: background 0.12s;
}
.hero-ic:hover {
  background: rgba(255, 255, 255, 0.22);
}
</style>
