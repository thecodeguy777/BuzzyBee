<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Check, ChevronDown, X as XIcon } from 'lucide-vue-next'
import { COMMON_TIMEZONES, TZ_SEARCH_ALIASES, allTimezones, localTimeIn } from '@/lib/timezones'

// Autocomplete combobox over the IANA zone list. Underline styling matches
// the client-drawer fields; swap the wrapper classes to reuse it elsewhere.
const props = defineProps<{
  /** IANA zone name; '' = not set. */
  modelValue: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

interface Entry {
  value: string
  label: string
  search: string
  common: boolean
}

// Built once — the zone list doesn't change at runtime. Search text folds
// underscores/slashes to spaces so "new york" matches America/New_York, and
// common zones also match US state names ("pennsylvania" → US Eastern).
const ENTRIES: Entry[] = [
  ...COMMON_TIMEZONES.map((t) => ({
    value: t.value,
    label: t.label,
    search: `${t.label} ${t.value.replace(/[_/]/g, ' ')} ${TZ_SEARCH_ALIASES[t.value] ?? ''}`.toLowerCase(),
    common: true
  })),
  ...allTimezones().map((z) => ({
    value: z,
    label: z.replace(/_/g, ' '),
    search: z.replace(/[_/]/g, ' ').toLowerCase(),
    common: false
  }))
]

const MAX_RESULTS = 30

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const rootEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
// Snapshot when the dropdown opens — the per-option times don't need to tick.
const openedAt = ref(Date.now())

const selected = computed(() => ENTRIES.find((e) => e.value === props.modelValue) ?? null)
const displayLabel = computed(() =>
  selected.value?.label ?? (props.modelValue ? props.modelValue.replace(/_/g, ' ') : '')
)

const matches = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return ENTRIES.filter((e) => e.common)
  return ENTRIES.filter((e) => words.every((w) => e.search.includes(w)))
})
const results = computed(() => matches.value.slice(0, MAX_RESULTS))
const hiddenCount = computed(() => matches.value.length - results.value.length)

function openList() {
  if (open.value) return
  open.value = true
  query.value = ''
  openedAt.value = Date.now()
  const i = results.value.findIndex((e) => e.value === props.modelValue)
  activeIndex.value = i === -1 ? 0 : i
  void nextTick(scrollActiveIntoView)
}
function closeList() {
  open.value = false
  query.value = ''
}
function pick(value: string) {
  emit('update:modelValue', value)
  closeList()
  inputEl.value?.blur()
}
function clear() {
  emit('update:modelValue', '')
  closeList()
}

function onInput(e: Event) {
  query.value = (e.target as HTMLInputElement).value
  if (!open.value) openList()
  activeIndex.value = 0
}

function move(delta: number) {
  if (!results.value.length) return
  activeIndex.value = (activeIndex.value + delta + results.value.length) % results.value.length
  void nextTick(scrollActiveIntoView)
}
function scrollActiveIntoView() {
  listEl.value
    ?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value && (e.key === 'ArrowDown' || e.key === 'Enter')) {
    e.preventDefault()
    openList()
    return
  }
  if (!open.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const hit = results.value[activeIndex.value]
    if (hit) pick(hit.value)
  } else if (e.key === 'Escape') {
    // Close just the dropdown — keep the host drawer's Esc handler out of it.
    e.stopPropagation()
    closeList()
    inputEl.value?.blur()
  }
}

function onFocusout(e: FocusEvent) {
  if (rootEl.value?.contains(e.relatedTarget as Node)) return
  closeList()
}
</script>

<template>
  <div ref="rootEl" class="relative" @focusout="onFocusout">
    <div
      class="flex items-center gap-1 border-b border-base-300 focus-within:border-primary transition-colors cursor-text"
      @click="inputEl?.focus()"
    >
      <input
        ref="inputEl"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :value="open ? query : displayLabel"
        :placeholder="open ? 'Type a city or zone…' : 'Not set'"
        class="flex-1 min-w-0 text-sm bg-transparent outline-none py-1"
        @focus="openList"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        v-if="modelValue && !open"
        type="button"
        class="w-5 h-5 rounded flex items-center justify-center text-base-content/40 hover:text-base-content hover:bg-base-200 transition-colors shrink-0"
        title="Clear time zone"
        @mousedown.prevent
        @click.stop="clear"
      >
        <XIcon class="w-3 h-3" :stroke-width="2" />
      </button>
      <ChevronDown
        class="w-3.5 h-3.5 text-base-content/40 shrink-0 transition-transform pointer-events-none"
        :class="open ? 'rotate-180' : ''"
        :stroke-width="1.75"
      />
    </div>

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        ref="listEl"
        class="absolute left-0 right-0 top-full mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-[var(--sh-pop)] max-h-60 overflow-y-auto py-1"
        role="listbox"
      >
        <p v-if="!results.length" class="px-3 py-2 text-xs italic text-base-content/40">
          No matching time zones.
        </p>
        <template v-else>
          <p
            v-if="!query.trim()"
            class="px-3 pt-1.5 pb-1 text-[0.6rem] font-semibold uppercase tracking-wider text-base-content/40"
          >
            Common
          </p>
          <button
            v-for="(e, i) in results"
            :key="e.value"
            type="button"
            role="option"
            :data-index="i"
            :aria-selected="e.value === modelValue"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
            :class="i === activeIndex ? 'bg-base-200/80' : ''"
            @mousedown.prevent
            @click="pick(e.value)"
            @mousemove="activeIndex = i"
          >
            <span class="flex-1 truncate">{{ e.label }}</span>
            <span class="text-[0.7rem] text-base-content/45 tabular-nums shrink-0">
              {{ localTimeIn(e.value, openedAt) }}
            </span>
            <Check
              v-if="e.value === modelValue"
              class="w-3.5 h-3.5 text-primary shrink-0"
              :stroke-width="2"
            />
          </button>
          <p
            v-if="hiddenCount > 0"
            class="px-3 py-1.5 text-[0.68rem] text-base-content/40 border-t border-base-200"
          >
            +{{ hiddenCount }} more — keep typing to narrow down.
          </p>
        </template>
      </div>
    </Transition>
  </div>
</template>
