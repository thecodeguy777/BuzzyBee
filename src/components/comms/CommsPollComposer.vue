<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { BarChart3, Plus, X, Hash } from 'lucide-vue-next'
import { useChannelsStore } from '@/stores/channels'

const props = defineProps<{ channelId: string }>()
const emit = defineEmits<{
  create: [payload: { question: string; options: string[] }]
  close: []
}>()

const channels = useChannelsStore()
const channelName = computed(() => channels.channels.find((c) => c.id === props.channelId)?.name ?? '')

const question = ref('')
const options = ref<string[]>(['', ''])
const questionInput = ref<HTMLInputElement | null>(null)

const canSubmit = computed(
  () => question.value.trim().length > 0 && options.value.filter((o) => o.trim()).length >= 2
)

onMounted(() => nextTick(() => questionInput.value?.focus()))

function addOption() {
  if (options.value.length < 6) options.value.push('')
}
function removeOption(i: number) {
  if (options.value.length > 2) options.value.splice(i, 1)
}
function submit() {
  const opts = options.value.map((o) => o.trim()).filter(Boolean)
  if (!question.value.trim() || opts.length < 2) return
  emit('create', { question: question.value.trim(), options: opts })
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[80] grid place-items-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="emit('close')" />
      <div class="relative w-[380px] max-w-full rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden tw-popin">
        <div class="flex items-center gap-2.5 px-3.5 py-3 border-b border-base-300">
          <span class="w-7 h-7 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
            <BarChart3 class="w-4 h-4" :stroke-width="2" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold leading-none">Create a poll</div>
            <div class="text-[0.7rem] text-base-content/50 mt-0.5 flex items-center gap-1">
              in <Hash class="w-2.5 h-2.5" :stroke-width="2.5" />{{ channelName }}
            </div>
          </div>
        </div>

        <div class="p-3.5 space-y-3">
          <div>
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Question</div>
            <input
              ref="questionInput"
              v-model="question"
              placeholder="What should we decide?"
              class="w-full px-3 py-2 rounded-lg border border-base-300 bg-base-200/40 text-sm font-medium outline-none focus:border-primary"
              @keydown.enter.prevent="canSubmit && submit()"
            />
          </div>

          <div>
            <div class="text-[0.65rem] font-bold uppercase tracking-wider text-base-content/40 mb-1.5">Options</div>
            <div class="space-y-1.5">
              <div v-for="(_, i) in options" :key="i" class="flex items-center gap-1.5">
                <input
                  v-model="options[i]"
                  :placeholder="`Option ${i + 1}`"
                  maxlength="120"
                  class="flex-1 px-3 py-2 rounded-lg border border-base-300 bg-base-200/40 text-sm outline-none focus:border-primary"
                  @keydown.enter.prevent="canSubmit && submit()"
                />
                <button
                  v-if="options.length > 2"
                  class="w-8 h-8 rounded-lg grid place-items-center text-base-content/40 hover:text-error hover:bg-base-200 shrink-0"
                  title="Remove option"
                  @click="removeOption(i)"
                >
                  <X class="w-3.5 h-3.5" :stroke-width="2" />
                </button>
              </div>
            </div>
            <button
              v-if="options.length < 6"
              class="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              @click="addOption"
            >
              <Plus class="w-3.5 h-3.5" :stroke-width="2.2" /> Add option
            </button>
          </div>

          <div class="flex gap-2 pt-0.5">
            <button class="px-3.5 py-2 rounded-lg text-sm font-semibold text-base-content/70 border border-base-300 hover:bg-base-200" @click="emit('close')">Cancel</button>
            <button
              class="flex-1 px-3.5 py-2 rounded-lg text-sm font-bold text-primary-content bg-primary hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
              :disabled="!canSubmit"
              @click="submit"
            >
              <BarChart3 class="w-4 h-4" :stroke-width="2.2" /> Post poll
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
