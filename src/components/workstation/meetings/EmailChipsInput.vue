<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

// Controlled email-chips input. Owns its draft text + validation error; the
// committed addresses live in the parent via v-model. Parents that submit
// programmatically should call commit() first (exposed) so half-typed input
// isn't silently dropped.

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const input = ref('')
const error = ref<string | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

function commit() {
  const raw = input.value.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (!raw.length) return
  const bad = raw.filter((e) => !EMAIL_RE.test(e))
  error.value = bad.length ? `Not an email: ${bad[0]}` : null
  const next = [...props.modelValue]
  for (const e of raw) {
    if (EMAIL_RE.test(e) && !next.includes(e)) next.push(e)
  }
  emit('update:modelValue', next)
  input.value = bad.join(' ')
}

function remove(e: string) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== e))
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Backspace' && !input.value && props.modelValue.length) {
    emit('update:modelValue', props.modelValue.slice(0, -1))
  }
}

/** True when there's something to send — committed chips or committable text. */
function hasInput() {
  return props.modelValue.length > 0 || input.value.trim().length > 0
}

defineExpose({ commit, hasInput })
</script>

<template>
  <div>
    <div
      class="w-full min-h-10 px-2 py-1.5 rounded-lg border border-base-300 bg-base-200/40 flex flex-wrap items-center gap-1.5 focus-within:border-primary cursor-text"
      @click="inputEl?.focus()"
    >
      <span
        v-for="e in modelValue"
        :key="e"
        class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-medium"
        style="background: var(--accent-soft); color: var(--accent-fg)"
      >
        {{ e }}
        <button type="button" class="w-4 h-4 rounded grid place-items-center hover:bg-black/10" @click="remove(e)">
          <X class="w-2.5 h-2.5" :stroke-width="2" />
        </button>
      </span>
      <input
        ref="inputEl"
        v-model="input"
        type="text"
        :placeholder="modelValue.length ? '' : 'name@company.com — Enter to add'"
        class="flex-1 min-w-[10rem] bg-transparent outline-none text-sm py-0.5"
        @keydown="onKeydown"
        @blur="commit"
      />
    </div>
    <p v-if="error" class="text-xs text-error mt-1">{{ error }}</p>
  </div>
</template>
