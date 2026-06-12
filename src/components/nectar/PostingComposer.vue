<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { X, Megaphone, Plus } from 'lucide-vue-next'
import { useClientsStore } from '@/stores/clients'
import { useJobsStore, POSTING_TYPES, type PostingType } from '@/stores/jobs'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', roleTitle: string): void
}>()

const clients = useClientsStore()
const jobs = useJobsStore()

const clientId = ref('')
const roleTitle = ref('')
const type = ref<PostingType>('project')
const hours = ref('')
const rate = ref('')
const urgency = ref('')
const description = ref('')
const responsibilities = ref('')
const skills = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

async function submit() {
  if (!roleTitle.value.trim() || submitting.value) return
  submitting.value = true
  error.value = null
  const client = clients.clients.find((c) => c.id === clientId.value) ?? null
  const created = await jobs.createPosting({
    client_id: client?.id ?? null,
    client_name: client?.name ?? null,
    role_title: roleTitle.value.trim(),
    type: type.value,
    hours: hours.value.trim() || null,
    rate: rate.value.trim() || null,
    urgency: urgency.value.trim() || null,
    description: description.value.trim() || null,
    responsibilities: responsibilities.value.split('\n').map((s) => s.trim()).filter(Boolean),
    skills: skills.value.split(',').map((s) => s.trim()).filter(Boolean),
  })
  submitting.value = false
  if (created) emit('created', created.role_title)
  else error.value = jobs.error ?? 'Could not create the posting.'
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onEsc))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] bg-black/30" @click="emit('close')" />
    <div class="fixed top-0 right-0 bottom-0 z-[71] w-[480px] max-w-[95vw] bg-base-100 border-l border-base-300 shadow-2xl flex flex-col nc-slide">
      <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-base-300">
        <span class="w-8 h-8 rounded-lg grid place-items-center text-primary" style="background: var(--accent-soft)">
          <Megaphone class="w-4 h-4" :stroke-width="2" />
        </span>
        <div class="flex-1">
          <div class="text-[0.95rem] font-bold leading-tight">New posting</div>
          <div class="text-[0.72rem] text-base-content/50">VAs see it in Nectar, ranked by how well it fits them.</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm btn-circle" aria-label="Close" @click="emit('close')">
          <X class="w-4 h-4" :stroke-width="2" />
        </button>
      </div>

      <form class="flex-1 overflow-y-auto p-4 space-y-4" @submit.prevent="submit">
        <div>
          <div class="nc-label">Role title <span class="text-error">*</span></div>
          <input v-model="roleTitle" type="text" class="input input-bordered input-sm w-full" placeholder="e.g. Social Media Designer" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="nc-label">Client</div>
            <select v-model="clientId" class="select select-bordered select-sm w-full">
              <option value="">Internal / no client</option>
              <option v-for="c in clients.clients" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <div class="nc-label">Type</div>
            <select v-model="type" class="select select-bordered select-sm w-full">
              <option v-for="(meta, k) in POSTING_TYPES" :key="k" :value="k">{{ meta.label }}</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <div class="nc-label">Hours</div>
            <input v-model="hours" type="text" class="input input-bordered input-sm w-full" placeholder="20 hrs/wk" />
          </div>
          <div>
            <div class="nc-label">Rate</div>
            <input v-model="rate" type="text" class="input input-bordered input-sm w-full" placeholder="$600/mo" />
          </div>
          <div>
            <div class="nc-label">Start</div>
            <input v-model="urgency" type="text" class="input input-bordered input-sm w-full" placeholder="ASAP" />
          </div>
        </div>

        <div>
          <div class="nc-label">About the role</div>
          <textarea v-model="description" rows="3" class="textarea textarea-bordered textarea-sm w-full leading-relaxed" placeholder="What this role owns and who they'll work with." />
        </div>

        <div>
          <div class="nc-label">What they'll do — one per line</div>
          <textarea v-model="responsibilities" rows="4" class="textarea textarea-bordered textarea-sm w-full leading-relaxed font-mono text-xs" placeholder="Design 12–16 social assets / week&#10;Maintain the Figma brand library" />
        </div>

        <div>
          <div class="nc-label">Skills — comma-separated (drives match scores)</div>
          <input v-model="skills" type="text" class="input input-bordered input-sm w-full" placeholder="Social media design, Figma, Canva" />
          <p class="text-[0.68rem] text-base-content/45 mt-1">Use the same names VAs list on their profiles — matching is by name.</p>
        </div>

        <p v-if="error" class="text-xs text-error">{{ error }}</p>
      </form>

      <div class="px-4 py-3 border-t border-base-300 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm gap-1.5" :disabled="!roleTitle.trim() || submitting" @click="submit">
          <Plus class="w-3.5 h-3.5" :stroke-width="2" />
          {{ submitting ? 'Posting…' : 'Post to Nectar' }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nc-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-base-content);
  opacity: 0.45;
  margin-bottom: 6px;
}
@keyframes nc-in {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
.nc-slide { animation: nc-in 0.22s cubic-bezier(0.2, 0.8, 0.3, 1) both; }
</style>
