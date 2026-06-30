<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { Bell, Hash } from 'lucide-vue-next'
import { useChannelsStore } from '@/stores/channels'

const props = defineProps<{
  channelId: string
  /** When set, the composer edits this pending reminder instead of creating one. */
  reminder?: { id: string; body: string; remind_at: string } | null
}>()
const emit = defineEmits<{
  create: [payload: { remindAt: string; body: string }]
  close: []
}>()
const editing = computed(() => !!props.reminder)

const channels = useChannelsStore()
const channelName = computed(() => channels.channels.find((c) => c.id === props.channelId)?.name ?? '')

const body = ref(props.reminder?.body ?? '')
const bodyInput = ref<HTMLInputElement | null>(null)

function plus(mins: number) {
  return () => new Date(Date.now() + mins * 60000)
}
function tomorrowAt(h: number) {
  return () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(h, 0, 0, 0)
    return d
  }
}
const PRESETS = [
  { key: '30m', label: 'In 30 min', at: plus(30) },
  { key: '1h', label: 'In 1 hour', at: plus(60) },
  { key: '3h', label: 'In 3 hours', at: plus(180) },
  { key: 'tom9', label: 'Tomorrow 9am', at: tomorrowAt(9) },
  { key: 'custom', label: 'Custom…', at: () => new Date() },
]
const selected = ref(props.reminder ? 'custom' : '30m')

function localInputValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const customLocal = ref(localInputValue(props.reminder ? new Date(props.reminder.remind_at) : plus(60)()))

const remindAt = computed<Date>(() =>
  selected.value === 'custom'
    ? new Date(customLocal.value)
    : (PRESETS.find((p) => p.key === selected.value) ?? PRESETS[0]).at()
)
const whenLabel = computed(() =>
  isNaN(remindAt.value.getTime())
    ? '—'
    : remindAt.value.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
)
const valid = computed(
  () => body.value.trim().length > 0 && !isNaN(remindAt.value.getTime()) && remindAt.value.getTime() > Date.now()
)

onMounted(() => nextTick(() => bodyInput.value?.focus()))

function submit() {
  if (!valid.value) return
  emit('create', { remindAt: remindAt.value.toISOString(), body: body.value.trim() })
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[80] grid place-items-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="emit('close')" />
      <div class="relative w-[380px] max-w-full rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden tw-popin">
        <div class="flex items-center gap-2.5 px-3.5 py-3 border-b border-base-300">
          <span class="w-7 h-7 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
            <Bell class="w-4 h-4" :stroke-width="2" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold leading-none">{{ editing ? 'Edit reminder' : 'Set a reminder' }}</div>
            <div class="text-[0.7rem] text-base-content/50 mt-0.5 flex items-center gap-1">
              posts to <Hash class="w-2.5 h-2.5" :stroke-width="2.5" />{{ channelName }}
            </div>
          </div>
        </div>

        <div class="p-3.5 space-y-3">
          <div>
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Remind</div>
            <input
              ref="bodyInput"
              v-model="body"
              placeholder="e.g. send the EOD report"
              class="w-full px-3 py-2 rounded-lg border border-base-300 bg-base-200/40 text-sm font-medium outline-none focus:border-primary"
              @keydown.enter.prevent="valid && submit()"
            />
          </div>

          <div>
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">When</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="p in PRESETS"
                :key="p.key"
                class="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                :class="selected === p.key ? 'border-primary bg-primary/10 text-primary' : 'border-base-300 text-base-content/60 hover:bg-base-200'"
                @click="selected = p.key"
              >
                {{ p.label }}
              </button>
            </div>
            <input
              v-if="selected === 'custom'"
              v-model="customLocal"
              type="datetime-local"
              class="mt-2 w-full px-2.5 py-2 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary"
            />
          </div>

          <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg" style="background: var(--accent-soft)">
            <Bell class="w-3.5 h-3.5 text-primary shrink-0" :stroke-width="1.75" />
            <div class="text-[0.7rem] text-base-content/60">
              BuzzyHive posts this <span class="font-semibold text-base-content">{{ whenLabel }}</span> and @mentions you.
            </div>
          </div>

          <div class="flex gap-2 pt-0.5">
            <button class="px-3.5 py-2 rounded-lg text-sm font-semibold text-base-content/70 border border-base-300 hover:bg-base-200" @click="emit('close')">Cancel</button>
            <button
              class="flex-1 px-3.5 py-2 rounded-lg text-sm font-bold text-primary-content bg-primary hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
              :disabled="!valid"
              @click="submit"
            >
              <Bell class="w-4 h-4" :stroke-width="2.2" /> {{ editing ? 'Save reminder' : 'Set reminder' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes tw-popin { from { opacity: 0; transform: translateY(6px) scale(0.97); } to { opacity: 1; transform: none; } }
.tw-popin { animation: tw-popin 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
</style>
