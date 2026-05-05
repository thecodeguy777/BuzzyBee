<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useTimeStore } from '@/stores/time'
import { useClientsStore } from '@/stores/clients'
import { ArrowRight } from 'lucide-vue-next'

const time = useTimeStore()
const clients = useClientsStore()

const open = computed(() => time.pendingSwitchClientId !== null)
const fromClient = computed(() =>
  clients.clients.find((c) => c.id === time.currentEntry?.client_id) ?? null
)
const toClient = computed(() =>
  clients.clients.find((c) => c.id === time.pendingSwitchClientId) ?? null
)

async function confirm() {
  await time.confirmSwitch()
}
function cancel() {
  time.cancelSwitch()
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) cancel()
}
onMounted(() => document.addEventListener('keydown', onEsc))
onUnmounted(() => document.removeEventListener('keydown', onEsc))

// Lock body scroll while open.
watch(open, (is) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = is ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-client-title"
      @click.self="cancel"
    >
      <div class="w-full max-w-md rounded-xl bg-base-100 border border-base-300 shadow-xl overflow-hidden">
        <div class="px-6 py-5">
          <h2 id="switch-client-title" class="font-display text-xl font-semibold">
            Switch client?
          </h2>
          <p class="text-sm text-base-content/70 mt-2">
            You're clocked in for
            <span class="font-medium text-base-content">{{ fromClient?.name ?? 'this client' }}</span>.
            Switching will close that session and start a fresh one for
            <span class="font-medium text-base-content">{{ toClient?.name ?? 'the new client' }}</span>.
          </p>

          <div
            class="mt-4 flex items-center gap-3 rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-sm"
          >
            <div class="flex-1 min-w-0">
              <div class="text-xs text-base-content/60">From</div>
              <div class="font-medium truncate">{{ fromClient?.name ?? '—' }}</div>
            </div>
            <ArrowRight class="w-4 h-4 text-base-content/40 shrink-0" :stroke-width="1.75" />
            <div class="flex-1 min-w-0">
              <div class="text-xs text-base-content/60">To</div>
              <div class="font-medium truncate">{{ toClient?.name ?? '—' }}</div>
            </div>
          </div>

          <p class="text-xs text-base-content/50 mt-3">
            Each client gets its own clean ledger — no minutes overlap.
          </p>
        </div>

        <div class="px-6 py-4 bg-base-200/50 border-t border-base-300 flex justify-end gap-2">
          <button type="button" class="btn btn-ghost btn-sm" @click="cancel">
            Stay on {{ fromClient?.name ?? 'current' }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="time.loading"
            @click="confirm"
          >
            {{ time.loading ? 'Switching…' : 'Switch & restart timer' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
