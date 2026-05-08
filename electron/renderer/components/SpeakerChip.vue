<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useMeetingStore } from '../stores/meeting'

const props = defineProps<{
  speakerKey: string
  fallbackLabel: string  // 'You' or 'Client'
}>()

const meeting = useMeetingStore()
const editing = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const draftName = ref('')

const displayName = computed(() => {
  const named = meeting.speakerNames[props.speakerKey]
  if (named) return named
  const tail = props.speakerKey.split(':')[1]
  return tail === '0' ? props.fallbackLabel : `${props.fallbackLabel} · ${parseInt(tail, 10) + 1}`
})

const isVA = computed(() => props.fallbackLabel === 'You')
const isCustomNamed = computed(() => !!meeting.speakerNames[props.speakerKey])

function startEdit() {
  draftName.value = isCustomNamed.value ? meeting.speakerNames[props.speakerKey] : ''
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

function commit() {
  meeting.renameSpeaker(props.speakerKey, draftName.value)
  editing.value = false
}

function cancel() {
  editing.value = false
}
</script>

<template>
  <span v-if="editing" class="inline-flex items-center gap-1">
    <input
      ref="inputRef"
      v-model="draftName"
      class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary bg-base-100 outline-none w-24"
      placeholder="Name"
      @keydown.enter="commit"
      @keydown.esc="cancel"
      @blur="commit"
    />
  </span>
  <button
    v-else
    class="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
    :class="isVA
      ? 'bg-primary/10 text-primary hover:bg-primary/15'
      : 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/15'"
    :title="`Click to rename (${speakerKey})`"
    @click="startEdit"
  >
    {{ displayName }}
  </button>
</template>
