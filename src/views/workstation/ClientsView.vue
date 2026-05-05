<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useClientsStore } from '@/stores/clients'
import { useAuthStore } from '@/stores/auth'
import { useTimeStore } from '@/stores/time'
import { Slack, Mail, Sparkles, Settings2, Plus, X } from 'lucide-vue-next'
import ClientDrawer from '@/components/workstation/ClientDrawer.vue'

const clients = useClientsStore()
const auth = useAuthStore()
const time = useTimeStore()

const editingClientId = ref<string | null>(null)
function openEdit(id: string) {
  editingClientId.value = id
}

// Inline create flow
const creating = ref(false)
const newClientName = ref('')
const submitting = ref(false)
const createError = ref<string | null>(null)
const newNameInput = ref<HTMLInputElement | null>(null)

async function startCreate() {
  creating.value = true
  newClientName.value = ''
  createError.value = null
  await nextTick()
  newNameInput.value?.focus()
}
function cancelCreate() {
  creating.value = false
  newClientName.value = ''
  createError.value = null
}
async function submitCreate() {
  const name = newClientName.value.trim()
  if (!name || submitting.value) return
  submitting.value = true
  createError.value = null
  try {
    const row = await clients.createClient({ name })
    creating.value = false
    newClientName.value = ''
    // Open the drawer so the user can fill in the rest right away
    editingClientId.value = row.id
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Could not create.'
  } finally {
    submitting.value = false
  }
}

const canManage = computed(() => auth.role === 'pm' || auth.isAdmin)

function rate(amount: number | null) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount)
}

function statusBadge(status: string) {
  if (status === 'active') return 'badge-success'
  if (status === 'paused') return 'badge-warning'
  return 'badge-ghost'
}
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <header class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 class="font-display text-xl font-semibold">Clients</h1>
        <p class="text-xs text-base-content/60 mt-0.5">
          {{
            canManage
              ? 'Manage clients and assignments.'
              : 'Clients you are assigned to.'
          }}
        </p>
      </div>
      <button
        v-if="canManage && !creating"
        type="button"
        class="btn btn-primary btn-sm gap-1.5"
        @click="startCreate"
      >
        <Plus class="w-3.5 h-3.5" :stroke-width="2" />
        New client
      </button>
    </header>

    <!-- Inline create form -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <form
        v-if="creating"
        class="bg-white rounded-xl border-2 border-primary/40 shadow-md p-4 space-y-3"
        @submit.prevent="submitCreate"
      >
        <div class="flex items-center justify-between">
          <div class="text-[0.65rem] uppercase tracking-wider text-primary font-semibold">
            New client
          </div>
          <button
            type="button"
            class="text-base-content/40 hover:text-base-content"
            aria-label="Cancel"
            @click="cancelCreate"
          >
            <X class="w-4 h-4" :stroke-width="2" />
          </button>
        </div>
        <label class="block">
          <span class="text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
            Client name
          </span>
          <input
            ref="newNameInput"
            v-model="newClientName"
            type="text"
            placeholder="Acme Co"
            class="w-full mt-1 text-sm bg-transparent outline-none border-b border-base-300 focus:border-primary py-1 transition-colors font-display text-base"
            @keydown.escape.prevent="cancelCreate"
          />
        </label>
        <p class="text-[0.7rem] text-base-content/60">
          You'll be set as the primary PM. Edit channel, tier, rate and notes in the next step.
        </p>
        <p v-if="createError" class="text-xs text-error">{{ createError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="submitting"
            @click="cancelCreate"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary btn-sm"
            :disabled="!newClientName.trim() || submitting"
          >
            {{ submitting ? 'Creating…' : 'Create + edit' }}
          </button>
        </div>
      </form>
    </Transition>

    <div v-if="clients.loading && !clients.loaded" class="text-base-content/60">
      Loading…
    </div>

    <div
      v-else-if="!clients.hasClients"
      class="card bg-base-100 border border-base-300 shadow-sm"
    >
      <div class="card-body p-6 text-center">
        <h2 class="font-medium">No clients yet</h2>
        <p class="text-xs text-base-content/60 mt-0.5">
          {{
            canManage
              ? 'Create your first client and assign a VA to get started.'
              : 'You have no active assignments. Reach out to your PM to get set up.'
          }}
        </p>
      </div>
    </div>

    <ul v-else class="grid gap-3">
      <li
        v-for="c in clients.clients"
        :key="c.id"
        class="card bg-base-100 border border-base-300 shadow-sm"
      >
        <div class="card-body p-5">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="card-title text-base">{{ c.name }}</h2>
                <span :class="['badge badge-sm', statusBadge(c.status)]">
                  {{ c.status }}
                </span>
                <span v-if="c.hivemind_enabled" class="badge badge-sm badge-primary gap-1">
                  <Sparkles class="w-3 h-3" :stroke-width="2" />
                  HiveMind
                </span>
              </div>
              <div class="text-xs text-base-content/60 mt-2 flex items-center gap-3 flex-wrap">
                <span class="flex items-center gap-1">
                  <Slack v-if="c.preferred_channel === 'slack'" class="w-3.5 h-3.5" :stroke-width="1.75" />
                  <Mail v-else-if="c.preferred_channel === 'email'" class="w-3.5 h-3.5" :stroke-width="1.75" />
                  {{ c.preferred_channel ?? 'no channel' }}
                </span>
                <span>·</span>
                <span class="capitalize">{{ c.tier ?? '—' }}</span>
                <span>·</span>
                <span>{{ rate(c.monthly_rate) }}/mo</span>
              </div>
              <p v-if="c.notes" class="text-sm text-base-content/70 mt-3">{{ c.notes }}</p>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="canManage"
                type="button"
                class="btn btn-ghost btn-sm gap-1.5"
                title="Edit client"
                @click="openEdit(c.id)"
              >
                <Settings2 class="w-3.5 h-3.5" :stroke-width="1.75" />
                Edit
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :class="c.id === clients.currentClientId ? 'btn-disabled' : ''"
                @click="time.requestSwitch(c.id)"
              >
                {{ c.id === clients.currentClientId ? 'Selected' : 'Switch to' }}
              </button>
            </div>
          </div>
        </div>
      </li>
    </ul>

    <ClientDrawer
      :client-id="editingClientId"
      @close="editingClientId = null"
    />
  </div>
</template>
