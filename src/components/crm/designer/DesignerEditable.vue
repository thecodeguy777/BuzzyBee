<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

// Uncontrolled contentEditable (keeps the caret); syncs from props only while
// unfocused, commits innerHTML on blur. The canvas's WYSIWYG text editing.

const props = withDefaults(
  defineProps<{ html: string; placeholder?: string; tag?: string }>(),
  { tag: 'div', placeholder: '' },
)
const emit = defineEmits<{ (e: 'commit', html: string): void }>()

const el = ref<HTMLElement | null>(null)
function sync() {
  if (el.value && el.value.innerHTML !== (props.html || '')) el.value.innerHTML = props.html || ''
}
onMounted(sync)
watch(() => props.html, () => {
  if (typeof document === 'undefined' || document.activeElement !== el.value) sync()
})
</script>

<template>
  <component
    :is="tag"
    ref="el"
    contenteditable="true"
    class="crm-ed"
    :data-ph="placeholder"
    @blur="emit('commit', ($event.target as HTMLElement).innerHTML)"
  />
</template>

<style>
.crm-ed { outline: none; cursor: text; min-width: 1ch; }
.crm-ed:empty::before { content: attr(data-ph); color: #9a98a3; pointer-events: none; }
</style>
