<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, Plus, Trash2 } from 'lucide-vue-next'
import { useTaskFieldsStore, type FieldType } from '@/stores/taskFields'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const taskFields = useTaskFieldsStore()

const label = ref('')
const fieldType = ref<FieldType>('text')
const options = ref<{ label: string }[]>([{ label: '' }, { label: '' }])
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const types: { value: FieldType; label: string; description: string }[] = [
  { value: 'text', label: 'Text', description: 'Short free-form text' },
  { value: 'number', label: 'Number', description: 'Numeric value' },
  { value: 'date', label: 'Date', description: 'Calendar date' },
  { value: 'checkbox', label: 'Checkbox', description: 'Yes / No' },
  { value: 'select', label: 'Single select', description: 'Pick one of a list' },
  { value: 'multi_select', label: 'Multi-select', description: 'Pick many from a list' },
  { value: 'url', label: 'URL', description: 'Web link' }
]

const needsOptions = computed(
  () => fieldType.value === 'select' || fieldType.value === 'multi_select'
)

const canSave = computed(() => {
  if (!label.value.trim()) return false
  if (needsOptions.value && options.value.filter((o) => o.label.trim()).length < 2) return false
  return !saving.value
})

watch(
  () => props.open,
  (is) => {
    if (is) {
      label.value = ''
      fieldType.value = 'text'
      options.value = [{ label: '' }, { label: '' }]
      errorMsg.value = null
    }
  }
)

function addOption() {
  options.value.push({ label: '' })
}
function removeOption(i: number) {
  options.value.splice(i, 1)
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function handleSave() {
  errorMsg.value = null
  saving.value = true
  try {
    const opts = needsOptions.value
      ? options.value
          .map((o) => o.label.trim())
          .filter(Boolean)
          .map((l) => ({ value: slugify(l) || l, label: l }))
      : []
    await taskFields.addField({
      label: label.value,
      field_type: fieldType.value,
      options: opts
    })
    emit('close')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not add column.'
  } finally {
    saving.value = false
  }
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
onMounted(() => document.addEventListener('keydown', onEsc))
onUnmounted(() => document.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md rounded-xl bg-base-100 border border-base-300 shadow-xl overflow-hidden">
        <header class="flex items-center justify-between px-5 py-3 border-b border-base-300">
          <h2 class="font-display text-lg font-semibold">Add column</h2>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            @click="emit('close')"
          >
            <X class="w-4 h-4" :stroke-width="2" />
          </button>
        </header>

        <div class="px-5 py-4 space-y-4">
          <label class="form-control">
            <span class="label-text text-sm font-medium mb-1">Column name</span>
            <input
              v-model="label"
              type="text"
              autofocus
              class="input input-bordered input-sm"
              placeholder="Stage, Estimate (hrs), Approved by client…"
            />
          </label>

          <div>
            <div class="label-text text-sm font-medium mb-2">Type</div>
            <div class="grid grid-cols-2 gap-2">
              <label
                v-for="t in types"
                :key="t.value"
                class="border rounded-md px-3 py-2 cursor-pointer text-sm"
                :class="
                  fieldType === t.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-base-300 hover:bg-base-200'
                "
              >
                <input
                  v-model="fieldType"
                  type="radio"
                  :value="t.value"
                  class="hidden"
                />
                <div class="font-medium">{{ t.label }}</div>
                <div class="text-xs text-base-content/60">{{ t.description }}</div>
              </label>
            </div>
          </div>

          <div v-if="needsOptions">
            <div class="label-text text-sm font-medium mb-2">Options</div>
            <ul class="space-y-2">
              <li
                v-for="(o, i) in options"
                :key="i"
                class="flex items-center gap-2"
              >
                <input
                  v-model="o.label"
                  type="text"
                  class="input input-bordered input-sm flex-1"
                  :placeholder="`Option ${i + 1}`"
                />
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-circle"
                  :disabled="options.length <= 1"
                  @click="removeOption(i)"
                >
                  <Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" />
                </button>
              </li>
            </ul>
            <button
              type="button"
              class="btn btn-ghost btn-xs gap-1 mt-2"
              @click="addOption"
            >
              <Plus class="w-3.5 h-3.5" :stroke-width="2" />
              Add option
            </button>
          </div>

          <p v-if="errorMsg" class="text-sm text-error">{{ errorMsg }}</p>
        </div>

        <footer class="flex justify-end gap-2 px-5 py-3 border-t border-base-300 bg-base-200/40">
          <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!canSave"
            @click="handleSave"
          >
            {{ saving ? 'Adding…' : 'Add column' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
