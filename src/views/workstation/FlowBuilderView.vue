<script setup lang="ts">
// The flow studio — a sibling of CrmDesignStudio. Studio bar + [palette | Vue
// Flow canvas | inspector] + a Runs slide-over. One flow per form; autosaves the
// node graph to flows.graph, which the run-flow edge function executes on submit.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import { ChevronLeft, Workflow, Loader2, Check, X, History, MousePointer2 } from 'lucide-vue-next'
import FlowPalette from '@/components/flows/FlowPalette.vue'
import FlowInspector from '@/components/flows/FlowInspector.vue'
import FlowNode from '@/components/flows/FlowNode.vue'
import HexClipDef from '@/components/shared/HexClipDef.vue'
import { useFlowsStore, type FlowRunRow } from '@/stores/flows'
import { useFormsStore } from '@/stores/forms'
import { useProjectsStore } from '@/stores/projects'
import { useClientsStore } from '@/stores/clients'
import { useStatusesStore } from '@/stores/statuses'
import { useEmailTemplatesStore } from '@/stores/emailTemplates'
import { flowDrag, nodeDef, newNodeId, type FlowNodeType, type FlowGraph } from '@/lib/flowNodes'

const props = defineProps<{ id: string }>() // the form id
const router = useRouter()
const flows = useFlowsStore()
const formsStore = useFormsStore()
const projects = useProjectsStore()
const clients = useClientsStore()
const statuses = useStatusesStore()
const emailTpl = useEmailTemplatesStore()

const {
  nodes, edges, addNodes, addEdges, onConnect, onNodeClick, onPaneClick,
  screenToFlowCoordinate, removeNodes, removeEdges, updateNodeData, setNodes, setEdges,
} = useVueFlow()

const ready = ref(false)
const notFound = ref(false)
const flowId = ref<string | null>(null)
const enabled = ref(false)
const formTitle = ref('')
const formProjectId = ref<string | null>(null)
const formClientId = ref<string | null>(null)
const formFields = ref<{ id: string; label: string }[]>([])
const selectedId = ref<string | null>(null)
const selectedNode = computed(() => nodes.value.find((n) => n.id === selectedId.value) ?? null)
const onlyStart = computed(() => nodes.value.length <= 1)

onConnect((c) => addEdges({ ...c, type: 'smoothstep' }))
onNodeClick(({ node }) => { selectedId.value = node.id })
onPaneClick(() => { selectedId.value = null })

onMounted(async () => {
  document.addEventListener('keydown', onKey)
  if (!projects.loaded) await projects.fetchAll().catch(() => {})
  if (!statuses.byProject.value || !Object.keys(statuses.byProject.value).length) await statuses.fetchAll().catch(() => {})
  await emailTpl.load().catch(() => {})
  const form = await formsStore.load(props.id)
  if (!form) { notFound.value = true; return }
  formTitle.value = form.title
  formProjectId.value = form.project_id
  formClientId.value = form.client_id
  formFields.value = (form.structure?.steps ?? []).flatMap((s: any) =>
    (s.fields ?? []).filter((f: any) => f.props?.label).map((f: any) => ({ id: f.id, label: f.props.label })))
  const flow = await flows.loadOrCreate(props.id)
  if (!flow) { notFound.value = true; return }
  flowId.value = flow.id
  enabled.value = flow.enabled
  applyGraph(flow.graph)
  ready.value = true
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  clearTimeout(timer)
  if (saveState.value === 'saving') void flush()
})

function applyGraph(graph: FlowGraph | null) {
  const g = graph && Array.isArray(graph.nodes) ? graph : { nodes: [], edges: [] }
  const vfNodes = g.nodes.length
    ? g.nodes.map((n) => ({ id: n.id, type: 'flow', position: n.position ?? { x: 0, y: 0 }, data: { kind: n.type, config: n.config ?? {} }, deletable: n.type !== 'start' }))
    : [{ id: 'start', type: 'flow', position: { x: 320, y: 48 }, data: { kind: 'start' as FlowNodeType, config: {} }, deletable: false }]
  setNodes(vfNodes)
  setEdges((g.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target, type: 'smoothstep' })))
}

function toGraph(): FlowGraph {
  return {
    nodes: nodes.value.map((n) => ({
      id: n.id, type: (n.data as any).kind, config: (n.data as any).config ?? {},
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })),
    edges: edges.value.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }
}

// ── autosave (debounced) ──
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined
function queueSave() {
  if (!ready.value || !flowId.value) return
  saveState.value = 'saving'
  clearTimeout(timer)
  timer = setTimeout(flush, 700)
}
async function flush() {
  if (!flowId.value) return
  const ok = await flows.save(flowId.value, { graph: toGraph() })
  saveState.value = ok ? 'saved' : 'idle'
  if (ok) setTimeout(() => { if (saveState.value === 'saved') saveState.value = 'idle' }, 1500)
}
watch([nodes, edges], queueSave, { deep: true })

// ── node ops ──
function addNodeOfType(type: FlowNodeType) {
  const maxY = nodes.value.reduce((m, n) => Math.max(m, n.position.y), 0)
  const id = newNodeId()
  addNodes({ id, type: 'flow', position: { x: 320, y: maxY + 120 }, data: { kind: type, config: { ...(nodeDef(type)?.defaultConfig ?? {}) } } })
  selectedId.value = id
}
function onDrop(e: DragEvent) {
  const type = flowDrag.type
  flowDrag.type = null
  if (!type) return
  const position = screenToFlowCoordinate({ x: e.clientX, y: e.clientY })
  const id = newNodeId()
  addNodes({ id, type: 'flow', position, data: { kind: type, config: { ...(nodeDef(type)?.defaultConfig ?? {}) } } })
  selectedId.value = id
}
function updateConfig(patch: Record<string, unknown>) {
  if (!selectedId.value || !selectedNode.value) return
  updateNodeData(selectedId.value, { config: { ...(selectedNode.value.data as any).config, ...patch } })
}
function deleteSelected() {
  if (!selectedId.value || (selectedNode.value?.data as any)?.kind === 'start') return
  const id = selectedId.value
  removeEdges(edges.value.filter((e) => e.source === id || e.target === id).map((e) => e.id))
  removeNodes([id])
  selectedId.value = null
}
function onKey(e: KeyboardEvent) {
  const el = document.activeElement as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId.value) { e.preventDefault(); deleteSelected() }
  else if (e.key === 'Escape') selectedId.value = null
}

// ── inspector context ──
const inspProjects = computed(() => projects.projects.map((p: any) => ({
  id: p.id, label: `${clients.clients.find((c: any) => c.id === p.client_id)?.name ?? 'Client'} · ${p.name}`,
})))
const inspStatuses = computed(() =>
  formProjectId.value ? (statuses.forProject(formProjectId.value) ?? []).map((s: any) => ({ key: s.key, label: s.label })) : [])
const inspTemplates = computed(() =>
  emailTpl.templates.filter((t) => t.clientId === formClientId.value).map((t) => ({ id: t.id, name: t.name })))

// ── enabled toggle ──
async function toggleEnabled() {
  if (!flowId.value) return
  enabled.value = !enabled.value
  await flows.save(flowId.value, { enabled: enabled.value })
}

// ── runs panel ──
const runsOpen = ref(false)
const runs = ref<FlowRunRow[]>([])
const runsLoading = ref(false)
async function openRuns() {
  runsOpen.value = true
  if (!flowId.value) return
  runsLoading.value = true
  runs.value = await flows.fetchRuns(flowId.value)
  runsLoading.value = false
}
const fmtTime = (s: string) => new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div v-if="notFound" class="h-full grid place-items-center">
    <div class="text-center">
      <p class="font-display text-lg font-semibold mb-1">Form not found</p>
      <button class="btn btn-sm btn-ghost" @click="router.push({ name: 'workstation-forms' })">Back to forms</button>
    </div>
  </div>

  <div v-else class="h-full flex flex-col min-h-0">
    <!-- shared honeycomb clip so node handles can be hexagons (on-brand) -->
    <HexClipDef />
    <!-- studio bar -->
    <div class="h-[54px] flex-none flex items-center gap-3 px-3 border-b border-base-300 bg-base-100">
      <button class="w-9 h-9 rounded-lg grid place-items-center hover:bg-base-200" title="Back to form" @click="router.push({ name: 'workstation-form-builder', params: { id } })">
        <ChevronLeft class="w-5 h-5" :stroke-width="1.75" />
      </button>
      <span class="w-[30px] h-[30px] rounded-[9px] grid place-items-center shrink-0" style="background: var(--accent-soft); color: var(--accent-fg)">
        <Workflow class="w-[17px] h-[17px]" :stroke-width="1.75" />
      </span>
      <div class="leading-tight min-w-0">
        <div class="text-[10.5px] text-base-content/40 font-bold uppercase tracking-wide">Automation</div>
        <div class="text-[14px] font-bold truncate max-w-[240px]">{{ formTitle }}</div>
      </div>
      <span class="text-xs text-base-content/35 inline-flex items-center gap-1 ml-1">
        <Loader2 v-if="saveState === 'saving'" class="w-3 h-3 animate-spin" />
        <Check v-else-if="saveState === 'saved'" class="w-3 h-3 text-success" :stroke-width="2.5" />
        {{ saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : '' }}
      </span>
      <div class="flex-1" />
      <label class="flex items-center gap-2 mr-1 cursor-pointer" :title="enabled ? 'Runs on every submission' : 'Off — submissions do nothing'">
        <input type="checkbox" class="toggle toggle-primary toggle-sm" :checked="enabled" @change="toggleEnabled" />
        <span class="text-[13px] font-medium whitespace-nowrap">{{ enabled ? 'Enabled' : 'Disabled' }}</span>
      </label>
      <button class="btn btn-sm btn-ghost gap-1.5" @click="openRuns"><History class="w-4 h-4" :stroke-width="1.75" /> Runs</button>
    </div>

    <!-- palette | canvas | inspector -->
    <div class="flex-1 flex min-h-0">
      <FlowPalette @add="addNodeOfType" />

      <div class="flex-1 relative" @drop.prevent="onDrop" @dragover.prevent>
        <VueFlow
          :default-edge-options="{ type: 'smoothstep' }"
          :delete-key-code="null"
          :min-zoom="0.3"
          :max-zoom="1.6"
          fit-view-on-init
          class="flow-canvas"
        >
          <Background :gap="16" pattern-color="color-mix(in oklab, var(--color-base-content) 16%, transparent)" />
          <Controls :show-interactive="false" />
          <template #node-flow="nodeProps">
            <FlowNode v-bind="nodeProps" />
          </template>
        </VueFlow>

        <div v-if="!ready" class="absolute inset-0 grid place-items-center bg-base-200/40">
          <Loader2 class="w-6 h-6 animate-spin text-base-content/30" />
        </div>
        <div v-else-if="onlyStart" class="absolute left-1/2 -translate-x-1/2 bottom-10 pointer-events-none flex items-center gap-2 text-[13px] text-base-content/50 bg-base-100/85 border border-base-300 rounded-full px-3.5 py-1.5 shadow-sm">
          <MousePointer2 class="w-4 h-4" /> Drag a node from the left, then connect it under “Form submitted”
        </div>
      </div>

      <FlowInspector
        :node="(selectedNode as any)"
        :form-fields="formFields"
        :projects="inspProjects"
        :statuses="inspStatuses"
        :templates="inspTemplates"
        @update="updateConfig"
        @delete="deleteSelected"
      />
    </div>

    <!-- Runs slide-over -->
    <div v-if="runsOpen" class="fixed inset-0 z-[120] flex justify-end">
      <div class="absolute inset-0 bg-black/20" @click="runsOpen = false" />
      <div class="relative w-[400px] max-w-full h-full bg-base-100 border-l border-base-300 shadow-2xl flex flex-col">
        <div class="h-[52px] flex-none flex items-center gap-2 px-4 border-b border-base-300">
          <History class="w-4 h-4 text-base-content/50" :stroke-width="1.75" />
          <span class="text-[14px] font-bold">Runs</span>
          <div class="flex-1" />
          <button class="w-8 h-8 rounded-lg grid place-items-center hover:bg-base-200" @click="runsOpen = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 overflow-y-auto p-3">
          <div v-if="runsLoading" class="grid place-items-center py-10"><Loader2 class="w-5 h-5 animate-spin text-base-content/30" /></div>
          <div v-else-if="!runs.length" class="text-center py-12 px-4 text-base-content/40 text-[13px]">
            No runs yet. Turn the flow on, then submit the form — runs show up here.
          </div>
          <div v-else class="flex flex-col gap-2">
            <div v-for="r in runs" :key="r.id" class="border border-base-300 rounded-xl p-3">
              <div class="flex items-center gap-2">
                <span class="run-dot" :class="`run-${r.status}`" />
                <span class="text-[13px] font-semibold capitalize">{{ r.status }}</span>
                <span class="flex-1" />
                <span class="text-[11px] text-base-content/40">{{ fmtTime(r.created_at) }}</span>
              </div>
              <div v-if="r.error" class="text-[11.5px] text-error mt-1.5 leading-snug">{{ r.error }}</div>
              <div v-if="r.steps?.length" class="mt-2 flex flex-col gap-1">
                <div v-for="(s, i) in r.steps" :key="i" class="flex items-center gap-1.5 text-[11.5px]">
                  <Check v-if="s.status === 'done'" class="w-3 h-3 text-success shrink-0" :stroke-width="2.5" />
                  <X v-else class="w-3 h-3 text-error shrink-0" :stroke-width="2.5" />
                  <span class="font-semibold capitalize">{{ s.type }}</span>
                  <span class="text-base-content/45 truncate">{{ s.error || '' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-canvas { width: 100%; height: 100%; background: var(--color-base-200); }
.flow-canvas :deep(.vue-flow__node-flow) { background: transparent; border: none; padding: 0; width: auto; }
.run-dot { width: 9px; height: 9px; border-radius: 9999px; flex: none; }
.run-succeeded { background: #15803d; }
.run-failed { background: #c2253c; }
.run-running, .run-pending { background: #c2700c; }
.run-waiting { background: var(--accent); }
</style>
