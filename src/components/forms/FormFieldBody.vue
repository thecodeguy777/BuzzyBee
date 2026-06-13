<script setup lang="ts">
import { computed } from 'vue'
import { Check, Star, Upload } from 'lucide-vue-next'
import type { FormField } from '@/lib/formFields'

// One field, rendered in two modes:
//   edit=true  → builder canvas (inputs inert, shows how it'll look)
//   edit=false → live fill (interactive, two-way bound)
const props = defineProps<{
  field: FormField
  edit?: boolean
  modelValue?: unknown
}>()
const emit = defineEmits<{ 'update:modelValue': [v: unknown] }>()

const p = computed(() => props.field.props)
const val = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function toggleCheckbox(opt: string) {
  const arr = Array.isArray(props.modelValue) ? [...(props.modelValue as string[])] : []
  const i = arr.indexOf(opt)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(opt)
  emit('update:modelValue', arr)
}
const checked = (opt: string) => Array.isArray(props.modelValue) && (props.modelValue as string[]).includes(opt)
const ratingVal = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : 0))
</script>

<template>
  <!-- Layout-only fields -->
  <div v-if="field.type === 'heading'" class="text-lg font-bold tracking-tight">{{ p.label || 'Section heading' }}</div>
  <p v-else-if="field.type === 'para'" class="text-sm text-base-content/70 leading-relaxed">{{ p.label || 'Paragraph text' }}</p>
  <hr v-else-if="field.type === 'divider'" class="border-base-300 my-1" />

  <!-- Input fields -->
  <div v-else>
    <div class="flex items-center gap-1 mb-1.5">
      <span class="text-[13.5px] font-semibold">{{ p.label || 'Question' }}</span>
      <span v-if="p.required" class="text-error font-bold">*</span>
    </div>

    <!-- text / email / number -->
    <input
      v-if="field.type === 'short' || field.type === 'email' || field.type === 'number'"
      :type="field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'"
      :value="edit ? '' : (val as string)"
      :placeholder="p.placeholder"
      :disabled="edit"
      class="input input-bordered w-full"
      :class="edit ? 'pointer-events-none' : ''"
      @input="val = ($event.target as HTMLInputElement).value"
    />

    <!-- long text -->
    <textarea
      v-else-if="field.type === 'long'"
      :value="edit ? '' : (val as string)"
      :placeholder="p.placeholder"
      :disabled="edit"
      rows="3"
      class="textarea textarea-bordered w-full min-h-[76px]"
      :class="edit ? 'pointer-events-none' : ''"
      @input="val = ($event.target as HTMLTextAreaElement).value"
    />

    <!-- dropdown -->
    <div v-else-if="field.type === 'select'" class="relative">
      <select
        :value="(val as string) ?? ''"
        :disabled="edit"
        class="select select-bordered w-full"
        :class="edit ? 'pointer-events-none' : ''"
        @change="val = ($event.target as HTMLSelectElement).value"
      >
        <option value="">Select…</option>
        <option v-for="o in p.options" :key="o" :value="o">{{ o }}</option>
      </select>
    </div>

    <!-- radio -->
    <div v-else-if="field.type === 'radio'" class="flex flex-col gap-2">
      <label
        v-for="o in p.options"
        :key="o"
        class="flex items-center gap-2.5"
        :class="edit ? '' : 'cursor-pointer'"
        @click="!edit && (val = o)"
      >
        <span class="w-[18px] h-[18px] rounded-full border-[1.8px] grid place-items-center shrink-0" :class="val === o ? 'border-primary' : 'border-base-content/40'">
          <span v-if="val === o" class="w-2.5 h-2.5 rounded-full bg-primary" />
        </span>
        <span class="text-[13.5px]">{{ o }}</span>
      </label>
    </div>

    <!-- checkboxes -->
    <div v-else-if="field.type === 'checkbox'" class="flex flex-col gap-2">
      <label
        v-for="o in p.options"
        :key="o"
        class="flex items-center gap-2.5"
        :class="edit ? '' : 'cursor-pointer'"
        @click="!edit && toggleCheckbox(o)"
      >
        <span class="w-[18px] h-[18px] rounded-[5px] border-[1.8px] grid place-items-center shrink-0 text-primary-content" :class="checked(o) ? 'border-primary bg-primary' : 'border-base-content/40'">
          <Check v-if="checked(o)" class="w-3 h-3" :stroke-width="3" />
        </span>
        <span class="text-[13.5px]">{{ o }}</span>
      </label>
    </div>

    <!-- date -->
    <input
      v-else-if="field.type === 'date'"
      type="date"
      :value="(val as string) ?? ''"
      :disabled="edit"
      class="input input-bordered w-full"
      :class="edit ? 'pointer-events-none' : ''"
      @input="val = ($event.target as HTMLInputElement).value"
    />

    <!-- assignee preference (public submitters type a name; not auto-resolved) -->
    <input
      v-else-if="field.type === 'people'"
      type="text"
      :value="edit ? '' : (val as string)"
      placeholder="Who should handle this?"
      :disabled="edit"
      class="input input-bordered w-full"
      :class="edit ? 'pointer-events-none' : ''"
      @input="val = ($event.target as HTMLInputElement).value"
    />

    <!-- rating -->
    <div v-else-if="field.type === 'rating'" class="flex gap-1.5">
      <button
        v-for="i in (p.max || 5)"
        :key="i"
        type="button"
        :disabled="edit"
        :class="edit ? 'pointer-events-none' : ''"
        @click="val = i"
      >
        <Star class="w-7 h-7" :class="i <= ratingVal ? 'text-warning fill-warning' : 'text-base-300'" :stroke-width="1.5" />
      </button>
    </div>

    <!-- file upload (visual; public uploads are out of scope for v1) -->
    <div v-else-if="field.type === 'file'" class="border-[1.5px] border-dashed border-base-300 rounded-xl py-5 text-center text-base-content/50">
      <Upload class="w-5 h-5 mx-auto opacity-60" :stroke-width="1.75" />
      <div class="text-[13px] font-medium text-base-content/60 mt-1.5">Drop a file or <span class="text-primary">browse</span></div>
    </div>

    <div v-if="p.help" class="text-[11.5px] text-base-content/45 mt-1.5">{{ p.help }}</div>
  </div>
</template>
