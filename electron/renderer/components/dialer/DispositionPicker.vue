<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DispositionOutcome } from '../../composables/useLeads'

const props = defineProps<{
  leadName?: string | null
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { outcome: DispositionOutcome; callbackAt?: string; notes?: string }): void
}>()

const outcome = ref<DispositionOutcome | ''>('')
const notes = ref('')
const callbackAt = ref('')   // datetime-local value, only meaningful when outcome === 'callback'

const OUTCOMES: { value: DispositionOutcome; label: string }[] = [
  { value: 'contacted',      label: 'Contacted — talked to them' },
  { value: 'callback',       label: 'Callback requested' },
  { value: 'voicemail',      label: 'Left voicemail' },
  { value: 'no-answer',      label: 'No answer' },
  { value: 'not-interested', label: 'Not interested' },
  { value: 'wrong-number',   label: 'Wrong number' },
  { value: 'dnc',            label: 'Do Not Call (lock)' },
]

const canSubmit = computed(() => {
  if (!outcome.value) return false
  if (outcome.value === 'callback' && !callbackAt.value) return false
  return true
})

function submit() {
  if (!canSubmit.value || !outcome.value) return
  emit('submit', {
    outcome: outcome.value,
    callbackAt: outcome.value === 'callback'
      ? new Date(callbackAt.value).toISOString()
      : undefined,
    notes: notes.value.trim() || undefined,
  })
  outcome.value = ''
  notes.value = ''
  callbackAt.value = ''
}
</script>

<template>
  <div class="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-2.5">
    <div class="flex items-center justify-between">
      <div class="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
        Disposition required
      </div>
      <div v-if="leadName" class="text-[10px] text-base-content/50 truncate max-w-[140px]">
        {{ leadName }}
      </div>
    </div>

    <select
      v-model="outcome"
      class="w-full text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
    >
      <option value="" disabled>Select outcome…</option>
      <option v-for="o in OUTCOMES" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>

    <input
      v-if="outcome === 'callback'"
      v-model="callbackAt"
      type="datetime-local"
      class="w-full text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
    />

    <input
      v-model="notes"
      type="text"
      placeholder="Notes (optional)"
      class="w-full text-xs px-2 py-1.5 rounded border border-base-300 bg-base-100 focus:border-primary focus:outline-none"
    />

    <button
      class="w-full text-xs font-medium py-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      :class="canSubmit
        ? 'bg-primary text-white hover:bg-primary/90'
        : 'bg-base-200 text-base-content/40'"
      :disabled="!canSubmit"
      @click="submit"
    >
      Save & continue
    </button>
  </div>
</template>
