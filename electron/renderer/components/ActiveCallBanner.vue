<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Phone, PhoneOff, ChevronRight } from 'lucide-vue-next'
import { useBroadcast } from '../composables/useBroadcast'
import { useLeads } from '../composables/useLeads'
import type { DialerCallStatus } from '../../shared/ipc-channels-dialer'

const broadcast = useBroadcast()
const leads = useLeads()

const status = ref<DialerCallStatus>('idle')
const leadId = ref<string | null>(null)
const leadName = ref<string | null>(null)
const toE164 = ref<string | null>(null)
const elapsedMs = ref(0)

const emit = defineEmits<{
  (e: 'select-lead', id: string): void
}>()

broadcast.on('call:start', (ev) => {
  status.value = 'connecting'
  leadId.value = ev.leadId
  leadName.value = ev.leadName
  toE164.value = ev.toE164
  elapsedMs.value = 0
})

broadcast.on('call:status', (ev) => {
  status.value = ev.status
  elapsedMs.value = ev.elapsedMs
  if (ev.leadId) leadId.value = ev.leadId
})

broadcast.on('call:end', () => {
  // Linger briefly so user sees the closing state, then collapse.
  setTimeout(() => {
    if (status.value === 'ended' || status.value === 'failed' || status.value === 'idle') {
      status.value = 'idle'
      leadId.value = null
      leadName.value = null
      toE164.value = null
      elapsedMs.value = 0
    }
  }, 3000)
})

const isLive = computed(() =>
  status.value === 'connecting' || status.value === 'ringing' || status.value === 'in-call',
)

const statusLabel = computed(() => {
  switch (status.value) {
    case 'connecting': return 'Connecting'
    case 'ringing': return 'Ringing'
    case 'in-call': return formatElapsed(elapsedMs.value)
    case 'ended': return 'Call ended'
    case 'failed': return 'Call failed'
    default: return ''
  }
})

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
}

function jumpToLead() {
  if (leadId.value) emit('select-lead', leadId.value)
}
</script>

<template>
  <transition name="banner">
    <div
      v-if="isLive || status === 'ended' || status === 'failed'"
      class="px-6 py-2 flex items-center gap-3 border-b text-xs"
      :class="status === 'ended' || status === 'failed'
        ? 'bg-base-200 border-base-300 text-base-content/60'
        : 'bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 border-primary/20 text-base-content'"
    >
      <div
        class="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        :class="isLive ? 'bg-primary/15' : 'bg-base-300'"
      >
        <Phone
          class="w-3.5 h-3.5"
          :class="isLive ? 'text-primary' : 'text-base-content/40'"
        />
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-medium truncate">
            {{ leadName || fmtPhone(toE164 || '') }}
          </span>
          <span
            v-if="isLive"
            class="w-1.5 h-1.5 rounded-full bg-green-500"
            :class="status !== 'in-call' ? 'animate-pulse' : ''"
          />
          <span class="text-[11px] opacity-70">{{ statusLabel }}</span>
        </div>
        <div class="text-[10px] opacity-50 truncate">
          via floating dialer
        </div>
      </div>

      <button
        v-if="leadId"
        class="text-[11px] px-2 py-1 rounded hover:bg-primary/10 text-primary font-medium transition-colors flex items-center gap-1"
        @click="jumpToLead"
        title="Open in CRM"
      >
        Open in CRM
        <ChevronRight class="w-3 h-3" />
      </button>
    </div>
  </transition>
</template>

<style scoped>
.banner-enter-active,
.banner-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.banner-enter-to,
.banner-leave-from {
  max-height: 60px;
}
</style>
