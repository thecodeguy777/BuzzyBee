<script setup lang="ts">
import { computed } from 'vue'
import { Bookmark, Clock, Banknote, Users, Check, Sparkles, Target } from 'lucide-vue-next'
import HexAvatar from '@/components/shared/HexAvatar.vue'
import { matchTone, POSTING_TYPES, type JobPosting } from '@/stores/jobs'

const props = defineProps<{
  posting: JobPosting
  match: number | null
  applied: boolean
  saved: boolean
  applicants: number
  mySkills: Set<string>
}>()
const emit = defineEmits<{
  (e: 'open'): void
  (e: 'apply'): void
  (e: 'save'): void
}>()

const type = computed(() => POSTING_TYPES[props.posting.type])
const tone = computed(() => (props.match != null ? matchTone(props.match) : null))
const hasSkill = (s: string) => props.mySkills.has(s.trim().toLowerCase())

function ago(iso: string) {
  const d = Date.now() - Date.parse(iso)
  const h = Math.floor(d / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="nectar-card p-4 flex flex-col gap-3" @click="emit('open')">
    <!-- top -->
    <div class="flex items-center gap-2.5">
      <HexAvatar :name="posting.client_name || 'BuzzyHive'" :size="40" tint="primary" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold truncate leading-snug">{{ posting.role_title }}</div>
        <div class="text-xs text-base-content/50">{{ posting.client_name || 'BuzzyHive' }} · {{ ago(posting.created_at) }}</div>
      </div>
      <button
        type="button"
        class="w-8 h-8 rounded-lg grid place-items-center shrink-0 transition-colors"
        :class="saved ? 'text-primary' : 'text-base-content/35 hover:text-base-content/70 hover:bg-base-200'"
        :title="saved ? 'Saved' : 'Save'"
        @click.stop="emit('save')"
      >
        <Bookmark class="w-4 h-4" :stroke-width="2" :fill="saved ? 'currentColor' : 'none'" />
      </button>
    </div>

    <!-- type + match -->
    <div class="flex items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[7px] text-[0.72rem] font-bold whitespace-nowrap"
        :style="{ background: `color-mix(in oklab, ${type.color} 12%, var(--color-base-100))`, color: type.color }"
      >{{ type.label }}</span>
      <span
        v-if="posting.status === 'closed'"
        class="inline-flex items-center px-2 py-0.5 rounded-[7px] text-[0.72rem] font-bold bg-base-200 text-base-content/50"
      >Closed</span>
      <div class="flex-1" />
      <span
        v-if="match != null && tone"
        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
        :style="{ background: tone.bg, color: tone.fg }"
      >
        <Target class="w-3.5 h-3.5" :stroke-width="2" /> {{ match }}% match
      </span>
    </div>

    <!-- skills -->
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="s in posting.skills.slice(0, 3)"
        :key="s"
        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-[0.72rem] font-semibold whitespace-nowrap"
        :style="hasSkill(s)
          ? 'background: var(--st-done-bg); color: var(--st-done-fg)'
          : 'background: var(--color-base-200); color: var(--color-base-content)'"
        :class="!hasSkill(s) && 'opacity-70'"
      >
        <Check v-if="hasSkill(s)" class="w-3 h-3" :stroke-width="2.5" />{{ s }}
      </span>
      <span
        v-if="posting.skills.length > 3"
        class="px-2 py-1 rounded-[7px] text-[0.72rem] font-semibold bg-base-200 text-base-content/50"
      >+{{ posting.skills.length - 3 }}</span>
    </div>

    <!-- meta footer -->
    <div class="flex items-center gap-3.5 pt-3 border-t border-base-200 text-xs text-base-content/60">
      <span v-if="posting.hours" class="inline-flex items-center gap-1.5"><Clock class="w-3.5 h-3.5" :stroke-width="1.75" /> {{ posting.hours }}</span>
      <span v-if="posting.rate" class="inline-flex items-center gap-1.5 font-semibold text-base-content"><Banknote class="w-3.5 h-3.5" :stroke-width="1.75" /> {{ posting.rate }}</span>
      <span class="inline-flex items-center gap-1.5 ml-auto text-base-content/45"><Users class="w-3.5 h-3.5" :stroke-width="1.75" /> {{ applicants }}</span>
    </div>

    <!-- apply -->
    <div
      v-if="applied"
      class="h-[38px] rounded-lg flex items-center justify-center gap-1.5 text-[0.82rem] font-bold"
      style="background: var(--st-done-bg); color: var(--st-done-fg)"
    >
      <Check class="w-4 h-4" :stroke-width="2.5" /> Applied
    </div>
    <button
      v-else-if="posting.status === 'open'"
      type="button"
      class="h-[38px] rounded-lg flex items-center justify-center gap-1.5 text-[0.82rem] font-bold text-primary-content bg-primary hover:opacity-90 whitespace-nowrap"
      @click.stop="emit('apply')"
    >
      <Sparkles class="w-4 h-4" :stroke-width="2" /> One-click apply
    </button>
  </div>
</template>

<style scoped>
.nectar-card {
  background: var(--color-base-100);
  border: 1px solid var(--color-base-300);
  border-radius: 11px;
  box-shadow: var(--sh-card);
  cursor: pointer;
  transition: border-color 0.13s, box-shadow 0.13s, transform 0.13s;
}
.nectar-card:hover {
  border-color: var(--accent-bord);
  box-shadow: var(--sh-pop);
  transform: translateY(-1px);
}
</style>
