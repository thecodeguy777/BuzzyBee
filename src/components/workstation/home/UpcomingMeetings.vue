<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Video, ArrowRight, ExternalLink } from 'lucide-vue-next'
import { useMeetingsStore, type Meeting } from '@/stores/meetings'

// Compact home strip: your next scheduled meetings. Renders nothing when
// there's nothing upcoming — the home stays clean for non-schedulers.
const store = useMeetingsStore()
const router = useRouter()
onMounted(() => { if (!store.loaded) void store.load() })

const next = computed(() => store.upcoming.slice(0, 3))

function whenLabel(m: Meeting) {
  const d = new Date(m.scheduledAt!)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const day = sameDay
    ? 'Today'
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
function isLive(m: Meeting) {
  const start = new Date(m.scheduledAt!).getTime()
  return Date.now() >= start && Date.now() <= start + m.durationMinutes * 60_000
}
function join(m: Meeting) {
  window.open('/meet/' + m.token, '_blank', 'noopener')
}
</script>

<template>
  <section v-if="next.length" class="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-hc-1">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold flex items-center gap-2">
        <Video class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
        Upcoming meetings
      </h2>
      <button
        type="button"
        class="text-[0.65rem] uppercase tracking-wider font-semibold text-primary hover:underline flex items-center gap-1"
        @click="router.push({ name: 'workstation-meetings' })"
      >
        See all
        <ArrowRight class="w-3 h-3" :stroke-width="1.75" />
      </button>
    </div>

    <ul class="divide-y divide-base-200">
      <li v-for="m in next" :key="m.id" class="py-2 flex items-center gap-3">
        <div class="w-32 shrink-0 text-[0.72rem] text-base-content/60 tabular-nums">{{ whenLabel(m) }}</div>
        <div class="flex-1 min-w-0 text-sm font-medium truncate flex items-center gap-2">
          {{ m.title }}
          <span v-if="isLive(m)" class="inline-flex items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wider text-success shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </span>
        </div>
        <button type="button" class="btn btn-ghost btn-xs gap-1 shrink-0" @click="join(m)">
          <ExternalLink class="w-3 h-3" :stroke-width="2" />
          Join
        </button>
      </li>
    </ul>
  </section>
</template>
