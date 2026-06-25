  <script setup lang="ts">
import { computed, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { useTeamStore } from '@/stores/team'

const props = defineProps<{
  poll: { question: string; options: string[] }
  tally: { byOption: Record<number, string[]>; total: number; myVote: number | null } | null
}>()
const emit = defineEmits<{ (e: 'vote', optionIndex: number): void }>()

const team = useTeamStore()
const total = computed(() => props.tally?.total ?? 0)

function votersFor(i: number) {
  return props.tally?.byOption?.[i] ?? []
}
function pct(i: number) {
  return total.value ? Math.round((votersFor(i).length / total.value) * 100) : 0
}
const myVote = computed(() => props.tally?.myVote ?? null)

// Pull any voter profiles we don't have yet (for the avatar cluster).
watch(
  () => props.tally,
  (t) => {
    if (!t) return
    const ids = [...new Set(Object.values(t.byOption).flat())].filter((id) => !team.profiles[id])
    if (ids.length) void team.fetchProfiles(ids)
  },
  { immediate: true }
)
</script>

<template>
  <div class="mt-1.5 max-w-md rounded-xl border border-base-300 bg-base-100 p-3">
    <div class="text-sm font-semibold mb-2 break-words">{{ poll.question }}</div>
    <div class="space-y-1.5">
      <button
        v-for="(opt, i) in poll.options"
        :key="i"
        type="button"
        class="relative w-full overflow-hidden rounded-lg border text-left transition-colors"
        :class="myVote === i ? 'border-primary/60' : 'border-base-300 hover:border-base-content/25'"
        @click="emit('vote', i)"
      >
        <span
          class="absolute inset-y-0 left-0 transition-all duration-300"
          :class="myVote === i ? 'bg-primary/15' : 'bg-base-200'"
          :style="{ width: pct(i) + '%' }"
        />
        <span class="relative flex items-center gap-2 px-2.5 py-1.5">
          <span
            class="w-4 h-4 rounded-full border grid place-items-center shrink-0"
            :class="myVote === i ? 'border-primary bg-primary text-white' : 'border-base-content/30'"
          >
            <Check v-if="myVote === i" class="w-3 h-3" :stroke-width="3" />
          </span>
          <span class="flex-1 text-sm truncate">{{ opt }}</span>
          <span class="flex -space-x-1 shrink-0">
            <HexAvatar
              v-for="uid in votersFor(i).slice(0, 3)"
              :key="uid"
              :name="team.profiles[uid]?.full_name ?? 'Member'"
              :avatar-url="team.profiles[uid]?.avatar_url ?? null"
              :color-key="uid"
              :size="18"
            />
          </span>
          <span class="w-6 text-right text-xs tabular-nums text-base-content/50 shrink-0">{{ votersFor(i).length }}</span>
        </span>
      </button>
    </div>
    <div class="mt-2 text-[0.7rem] text-base-content/40">
      {{ total }} {{ total === 1 ? 'vote' : 'votes' }}<span v-if="myVote !== null"> · tap your choice again to remove it</span>
    </div>
  </div>
</template>
