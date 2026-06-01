<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { History, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useLeadEvents, type LeadEvent } from '../../composables/useLeadEvents'
import EventItem from '../activity/EventItem.vue'

// Day-bucket helpers — used to group rows under Today / Yesterday / Earlier
// sub-headers so the timeline reads as a story instead of a wall.
function dayBucket(iso: string): 'today' | 'yesterday' | 'earlier' {
  const t = new Date(iso); t.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - t.getTime()) / 86400000
  if (diff <= 0) return 'today'
  if (diff < 2) return 'yesterday'
  return 'earlier'
}
const BUCKET_LABEL = { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' } as const

const props = defineProps<{
  leadId: string
}>()

const leadEvents = useLeadEvents()

const fullHistory = ref<LeadEvent[]>([])
const isLoading = ref(false)
const showAll = ref(false)

// Lead timeline = combine the real-time recent feed (cached) + any older
// events fetched on demand. De-dupe by id.
const events = computed<LeadEvent[]>(() => {
  const fromCache = leadEvents.eventsForLead(props.leadId)
  if (fullHistory.value.length === 0) return fromCache
  const seen = new Set<string>()
  const merged: LeadEvent[] = []
  for (const e of [...fullHistory.value, ...fromCache]) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    merged.push(e)
  }
  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return merged
})

const displayed = computed<LeadEvent[]>(() => {
  return showAll.value ? events.value : events.value.slice(0, 10)
})

// Insert day-bucket headers (Today/Yesterday/Earlier) AND "quiet gap" rows
// when there's a >14 day gap between consecutive events.
interface RenderItem {
  kind: 'event' | 'gap' | 'header'
  event?: LeadEvent
  gapDays?: number
  headerLabel?: string
  headerCount?: number
  key: string
}

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = []
  const list = displayed.value
  if (list.length === 0) return items

  // Pre-count items per bucket so headers can show "Today · 4"
  const counts: Record<string, number> = { today: 0, yesterday: 0, earlier: 0 }
  for (const e of list) counts[dayBucket(e.createdAt)]++

  let currentBucket: string | null = null

  for (let i = 0; i < list.length; i++) {
    const b = dayBucket(list[i].createdAt)
    if (b !== currentBucket) {
      currentBucket = b
      items.push({
        kind: 'header',
        headerLabel: BUCKET_LABEL[b as keyof typeof BUCKET_LABEL],
        headerCount: counts[b],
        key: `hdr-${b}`,
      })
    }
    items.push({ kind: 'event', event: list[i], key: list[i].id })
    const next = list[i + 1]
    if (next) {
      const days = Math.round(
        (new Date(list[i].createdAt).getTime() - new Date(next.createdAt).getTime())
        / (1000 * 60 * 60 * 24),
      )
      // Only emit a "quiet gap" row inside the same bucket; bucket header
      // already breaks the visual flow across the boundary.
      const nextBucket = dayBucket(next.createdAt)
      if (days >= 14 && nextBucket === b) {
        items.push({ kind: 'gap', gapDays: days, key: `gap-${list[i].id}` })
      }
    }
  }
  return items
})

async function loadFullHistory() {
  isLoading.value = true
  try {
    fullHistory.value = await leadEvents.fetchLeadTimeline(props.leadId, 200)
  } finally {
    isLoading.value = false
  }
}

watch(() => props.leadId, loadFullHistory, { immediate: true })
onMounted(loadFullHistory)
</script>

<template>
  <section>
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 flex items-center gap-1">
        <History class="w-3 h-3" />
        Timeline
        <span class="font-normal opacity-60">· {{ events.length }}</span>
      </h3>
      <button
        v-if="events.length > 10"
        class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
        @click="showAll = !showAll"
      >
        <component :is="showAll ? ChevronUp : ChevronDown" class="w-2.5 h-2.5" />
        {{ showAll ? 'Show recent' : `All ${events.length}` }}
      </button>
    </div>

    <div v-if="events.length === 0" class="text-[11px] text-base-content/40 italic px-2 py-3 border border-dashed border-base-300 rounded-lg text-center">
      No activity yet.
    </div>

    <div v-else class="border border-base-300 rounded-lg overflow-hidden">
      <template v-for="item in renderItems" :key="item.key">
        <!-- Day bucket header -->
        <div
          v-if="item.kind === 'header'"
          class="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-base-content/40 bg-base-200/40 border-b border-base-300 flex items-center justify-between"
        >
          <span>{{ item.headerLabel }}</span>
          <span class="font-normal opacity-70">{{ item.headerCount }}</span>
        </div>
        <!-- Quiet-gap separator -->
        <div
          v-else-if="item.kind === 'gap'"
          class="text-center text-[10px] text-base-content/40 italic py-1.5 bg-base-200/30 border-b border-base-300"
        >
          … {{ item.gapDays }} quiet days …
        </div>
        <!-- Event row -->
        <div v-else-if="item.event" class="border-b border-base-300 last:border-b-0">
          <EventItem :event="item.event" :show-lead="false" />
        </div>
      </template>
    </div>
  </section>
</template>
