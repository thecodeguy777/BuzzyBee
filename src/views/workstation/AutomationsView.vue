<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Workflow, Loader2, Trash2, Circle, CheckCircle2, Zap } from 'lucide-vue-next'
import { useFlowsStore } from '@/stores/flows'
import { useClientsStore } from '@/stores/clients'
import { triggerDef } from '@/lib/flowNodes'

const router = useRouter()
const flowsStore = useFlowsStore()
const clients = useClientsStore()
const creating = ref(false)

onMounted(() => { if (!flowsStore.loaded) void flowsStore.fetchAll() })

const flows = computed(() => flowsStore.visible)
const clientName = computed(() => clients.currentClient?.name ?? null)

function open(id: string) { router.push({ name: 'workstation-automation-builder', params: { id } }) }
async function newAutomation() {
  creating.value = true
  // Starts inert (manual, disabled) — you pick the real trigger in the builder.
  const row = await flowsStore.create({ type: 'manual', config: {} })
  creating.value = false
  if (row) open(row.id)
}
async function del(id: string, name: string) {
  if (!window.confirm(`Delete the automation "${name}"? Its run history goes too.`)) return
  await flowsStore.remove(id)
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-5">
    <header class="flex items-center gap-3">
      <div>
        <h1 class="font-display text-xl font-semibold">Automations</h1>
        <p class="text-sm text-base-content/55 mt-0.5">
          <template v-if="clientName">When something happens for <span class="font-semibold text-base-content/70">{{ clientName }}</span>, run a flow.</template>
          <template v-else>Pick a client in the switcher to see its automations.</template>
        </p>
      </div>
      <div class="flex-1" />
      <button class="btn btn-primary btn-sm gap-1.5" :disabled="creating" @click="newAutomation">
        <Loader2 v-if="creating" class="w-4 h-4 animate-spin" />
        <Plus v-else class="w-4 h-4" :stroke-width="2" />
        New automation
      </button>
    </header>

    <div v-if="!flowsStore.loaded && !flowsStore.flows.length" class="grid place-items-center py-20">
      <Loader2 class="w-6 h-6 animate-spin text-base-content/30" />
    </div>

    <div v-else-if="!flows.length" class="rounded-2xl border border-dashed border-base-300 py-16 text-center">
      <span class="w-12 h-12 rounded-2xl grid place-items-center text-primary mx-auto mb-3" style="background: var(--accent-soft, rgba(138,58,147,.12))">
        <Workflow class="w-6 h-6" :stroke-width="1.5" />
      </span>
      <p class="font-display text-lg font-semibold mb-1">No automations{{ clientName ? ` for ${clientName}` : '' }} yet</p>
      <p class="text-sm text-base-content/55 mb-4">Build a flow that runs when a form is submitted, a task changes, a deal moves — and more.</p>
      <button class="btn btn-primary btn-sm gap-1.5" @click="newAutomation"><Plus class="w-4 h-4" :stroke-width="2" /> New automation</button>
    </div>

    <div v-else class="grid sm:grid-cols-2 gap-3">
      <div
        v-for="f in flows"
        :key="f.id"
        class="group rounded-xl border border-base-300 bg-base-100 p-4 hover:border-primary/40 hover:shadow-sm transition cursor-pointer"
        @click="open(f.id)"
      >
        <div class="flex items-start gap-3">
          <span class="w-9 h-9 rounded-xl grid place-items-center text-primary shrink-0" style="background: var(--accent-soft, rgba(138,58,147,.12))">
            <component :is="triggerDef(f.trigger?.type)?.icon ?? Zap" class="w-[18px] h-[18px]" :stroke-width="1.75" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate">{{ f.name }}</div>
            <div class="text-xs text-base-content/50 truncate">
              When: {{ triggerDef(f.trigger?.type)?.label ?? 'Not set' }}
            </div>
          </div>
          <span
            class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
            :class="f.enabled ? 'text-success bg-success/10' : 'text-base-content/50 bg-base-200'"
          >
            <component :is="f.enabled ? CheckCircle2 : Circle" class="w-3 h-3" :stroke-width="2" />
            {{ f.enabled ? 'On' : 'Off' }}
          </span>
        </div>
        <div class="flex items-center gap-3 mt-3 pt-3 border-t border-base-200 text-xs text-base-content/50">
          <span>{{ (f.graph?.nodes?.length ?? 1) - 1 }} step{{ ((f.graph?.nodes?.length ?? 1) - 1) === 1 ? '' : 's' }}</span>
          <span>·</span>
          <span>Edited {{ fmtDate(f.updated_at) }}</span>
          <div class="flex-1" />
          <button
            class="opacity-0 group-hover:opacity-100 transition w-7 h-7 rounded-lg grid place-items-center hover:bg-base-200 hover:text-error"
            title="Delete" @click.stop="del(f.id, f.name)"
          >
            <Trash2 class="w-3.5 h-3.5" :stroke-width="1.75" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
