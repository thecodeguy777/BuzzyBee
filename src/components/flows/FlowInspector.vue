<script setup lang="ts">
// Right rail — configures the selected node. Mirrors the email DesignerInspector
// (same crm-insp-row / -label / -in styles, reuses the DSeg control) so node
// config looks identical to block config. Field list comes from the registry.
import { computed, ref } from 'vue'
import { GripVertical, Trash2, ChevronDown } from 'lucide-vue-next'
import DSeg from '@/components/crm/designer/DSeg.vue'
import { nodeDef, type FlowNodeType } from '@/lib/flowNodes'

const props = defineProps<{
  node: { id: string; data: { kind: FlowNodeType; config: Record<string, any> } } | null
  formFields: { id: string; label: string }[]
  projects: { id: string; label: string }[]
  statuses: { key: string; label: string }[]
  templates: { id: string; name: string }[]
  channels: { id: string; name: string }[]
}>()
const emit = defineEmits<{
  (e: 'update', patch: Record<string, unknown>): void
  (e: 'delete'): void
  (e: 'edit-design', templateId: string): void
}>()

const def = computed(() => (props.node ? nodeDef(props.node.data.kind) : undefined))
const cfg = computed(() => props.node?.data.config ?? {})
const isStart = computed(() => props.node?.data.kind === 'start')

const set = (key: string, v: unknown) => emit('update', { [key]: v })
const openMenu = ref<string | null>(null)
function insertToken(key: string, label: string) {
  set(key, String(cfg.value[key] ?? '') + `{{${label}}}`)
  openMenu.value = null
}
</script>

<template>
  <div class="w-[288px] flex-none border-l border-base-300 bg-base-100 flex flex-col">
    <div class="flex-1 overflow-y-auto px-4 pt-4 pb-7">
      <!-- start node -->
      <template v-if="isStart">
        <div class="flex items-center gap-2 mb-3">
          <span class="fi-ico"><GripVertical :size="15" /></span>
          <span class="text-[14px] font-bold">Trigger</span>
        </div>
        <p class="text-[12.5px] text-base-content/55 leading-relaxed">
          This is where every run begins. Set <strong>what starts it</strong> in the top bar ("When …"), then connect actions below — they run, in order, each time the trigger fires.
        </p>
      </template>

      <!-- a configurable node -->
      <template v-else-if="node && def">
        <div class="flex items-center gap-2 mb-4">
          <span class="fi-ico"><component :is="def.icon" :size="15" /></span>
          <span class="text-[14px] font-bold">{{ def.label }}</span>
          <button class="ml-auto w-7 h-7 rounded-lg grid place-items-center text-base-content/40 hover:text-error hover:bg-base-200" title="Delete node" @click="emit('delete')">
            <Trash2 :size="14" />
          </button>
        </div>

        <p v-if="!def.fields.length" class="text-[12.5px] text-base-content/45">This node has no settings yet.</p>

        <div v-for="f in def.fields" :key="f.key" v-show="!f.hideWhen || !f.hideWhen(cfg)" class="crm-insp-row">
          <div class="crm-insp-label flex items-center gap-1.5">
            <span>{{ f.label }}</span>
            <div v-if="f.tokens && formFields.length" class="relative ml-auto">
              <button class="fi-insert" @click="openMenu = openMenu === f.key ? null : f.key">
                insert field <ChevronDown :size="11" />
              </button>
              <div v-if="openMenu === f.key" class="fi-menu">
                <button v-for="ff in formFields" :key="ff.id" type="button" @click="insertToken(f.key, ff.label)">{{ ff.label }}</button>
              </div>
            </div>
          </div>

          <input
            v-if="f.kind === 'text' || f.kind === 'url' || f.kind === 'field'"
            class="crm-insp-in" :value="cfg[f.key]" :placeholder="f.placeholder"
            @input="set(f.key, ($event.target as HTMLInputElement).value)"
          />
          <textarea
            v-else-if="f.kind === 'textarea'"
            class="crm-insp-in" rows="3" :value="cfg[f.key]" :placeholder="f.placeholder"
            @input="set(f.key, ($event.target as HTMLTextAreaElement).value)"
          />
          <DSeg
            v-else-if="f.kind === 'seg'"
            :options="f.options || []" :model-value="cfg[f.key]"
            @update:model-value="(v: string) => set(f.key, v)"
          />
          <select
            v-else-if="f.kind === 'project'"
            class="crm-insp-in" :value="cfg[f.key] ?? ''"
            @change="set(f.key, ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">Use the form's project</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
          <select
            v-else-if="f.kind === 'status'"
            class="crm-insp-in" :value="cfg[f.key] ?? ''"
            @change="set(f.key, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">First column (default)</option>
            <option v-for="s in statuses" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
          <template v-else-if="f.kind === 'channel'">
            <select
              class="crm-insp-in" :value="cfg[f.key] ?? ''"
              @change="set(f.key, ($event.target as HTMLSelectElement).value || null)"
            >
              <option value="">Pick a channel…</option>
              <option v-for="ch in channels" :key="ch.id" :value="ch.id">#{{ ch.name }}</option>
            </select>
            <p v-if="!channels.length" class="fi-hint">No channels for this client yet — create one in Comms first.</p>
          </template>
          <template v-else-if="f.kind === 'template'">
            <select
              class="crm-insp-in" :value="cfg[f.key] ?? ''"
              @change="set(f.key, ($event.target as HTMLSelectElement).value || null)"
            >
              <option value="">Plain email (type a body below)</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <button v-if="cfg[f.key]" type="button" class="fi-editlink" @click="emit('edit-design', String(cfg[f.key]))">
              Edit this design ↗
            </button>
            <p v-if="!templates.length" class="fi-hint">
              No saved designs for this form's client yet — build them in the Email Studio (CRM → Designs).
            </p>
          </template>
        </div>
      </template>

      <!-- nothing selected -->
      <div v-else class="text-center px-3 py-10 text-base-content/40">
        <GripVertical :size="26" class="inline opacity-50" />
        <div class="text-[13px] font-semibold text-base-content/60 mt-2.5">Select a node</div>
        <div class="text-[12px] mt-1">Click any node on the canvas to configure it.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fi-ico {
  width: 28px; height: 28px; flex: none; display: grid; place-items: center; border-radius: 8px;
  background: var(--accent-soft); color: var(--accent-fg);
}
.crm-insp-row { margin-bottom: 14px; }
.crm-insp-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase;
  color: color-mix(in oklab, var(--color-base-content) 40%, transparent); margin-bottom: 7px;
}
.crm-insp-in {
  width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-base-300);
  background: var(--color-base-200); color: var(--color-base-content); font-size: 13px;
  outline: none; transition: border-color 0.12s; resize: vertical; font-family: inherit;
}
.crm-insp-in:focus { border-color: var(--accent); }
.fi-insert {
  display: inline-flex; align-items: center; gap: 2px; font-size: 10.5px; font-weight: 700;
  text-transform: none; letter-spacing: 0; color: var(--accent-fg);
  padding: 2px 6px; border-radius: 6px; background: var(--accent-soft);
}
.fi-menu {
  position: absolute; right: 0; top: 100%; margin-top: 4px; z-index: 20; min-width: 160px; max-height: 240px;
  overflow-y: auto; background: var(--color-base-100); border: 1px solid var(--color-base-300);
  border-radius: 10px; box-shadow: 0 12px 32px -8px rgba(20, 12, 22, 0.22); padding: 4px;
}
.fi-menu button {
  display: block; width: 100%; text-align: left; font-size: 12.5px; font-weight: 500; text-transform: none;
  letter-spacing: 0; color: var(--color-base-content); padding: 6px 8px; border-radius: 7px;
}
.fi-menu button:hover { background: var(--accent-soft); color: var(--accent-fg); }
.fi-hint { font-size: 11px; font-weight: 500; text-transform: none; letter-spacing: 0; color: color-mix(in oklab, var(--color-base-content) 42%, transparent); margin-top: 6px; line-height: 1.45; }
.fi-editlink {
  display: inline-flex; align-items: center; margin-top: 7px; font-size: 12px; font-weight: 700;
  text-transform: none; letter-spacing: 0; color: var(--accent-fg);
  padding: 5px 9px; border-radius: 8px; background: var(--accent-soft); border: 1px solid var(--accent-bord);
}
.fi-editlink:hover { filter: brightness(0.97); }
</style>
