<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, X, UserPlus } from 'lucide-vue-next'
import { useProjectMembersStore, type ProjectMemberRole } from '@/stores/projectMembers'
import { useProjectsStore } from '@/stores/projects'
import HexAvatar from '@/components/shared/HexAvatar.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const members = useProjectMembersStore()
const projects = useProjectsStore()

const query = ref('')
const role = ref<ProjectMemberRole>('contributor')
const results = ref<
  { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]
>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const existingIds = computed(() => members.currentMembers.map((m) => m.user_id))

async function runSearch() {
  if (!projects.currentProject) return
  loading.value = true
  errorMsg.value = null
  try {
    results.value = await members.searchTeammates(
      projects.currentProject.client_id,
      query.value,
      existingIds.value
    )
  } catch (e) {
    errorMsg.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runSearch, 200)
})

watch(
  () => props.open,
  async (is) => {
    if (is) {
      query.value = ''
      role.value = 'contributor'
      errorMsg.value = null
      await runSearch()
      // focus the search input on next tick
      setTimeout(() => inputEl.value?.focus(), 0)
    }
  }
)

async function add(userId: string) {
  if (!projects.currentProjectId) return
  try {
    await members.addMember(projects.currentProjectId, userId, role.value)
    results.value = results.value.filter((r) => r.id !== userId)
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

function close() {
  emit('close')
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close()
}
onMounted(() => document.addEventListener('keydown', onEsc))
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div class="w-full max-w-md rounded-xl bg-white border border-base-300 shadow-2xl overflow-hidden">
        <header class="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-300">
          <div class="flex items-center gap-2">
            <UserPlus class="w-4 h-4 text-base-content/60" :stroke-width="1.75" />
            <h2 class="font-display text-base font-semibold">Add member</h2>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            aria-label="Close"
            @click="close"
          >
            <X class="w-4 h-4" :stroke-width="2" />
          </button>
        </header>

        <div class="p-4 space-y-3">
          <div class="flex gap-2">
            <label
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-base-300 flex-1 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/40"
            >
              <Search class="w-4 h-4 text-base-content/50" :stroke-width="1.75" />
              <input
                ref="inputEl"
                v-model="query"
                type="text"
                placeholder="Search teammates by name or email…"
                class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
              />
            </label>
            <select
              v-model="role"
              class="select select-bordered select-sm"
              title="Role for new members"
            >
              <option value="lead">Lead</option>
              <option value="contributor">Contributor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <p
            v-if="!projects.currentProject"
            class="text-xs text-base-content/50 italic"
          >
            Pick a project first.
          </p>
          <p
            v-else
            class="text-xs text-base-content/50"
          >
            Showing teammates assigned to
            <span class="font-medium">
              {{ projects.currentProject?.client_id ? 'this client' : '—' }}
            </span>.
          </p>

          <div v-if="loading" class="text-sm text-base-content/60 px-1">Searching…</div>
          <div
            v-else-if="results.length === 0"
            class="text-sm text-base-content/50 px-1 py-4 text-center"
          >
            <span v-if="query">No teammate matches "{{ query }}".</span>
            <span v-else>No more teammates to add.</span>
          </div>

          <ul v-else class="max-h-80 overflow-y-auto space-y-1">
            <li v-for="r in results" :key="r.id">
              <button
                type="button"
                class="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-base-200/60 text-left"
                @click="add(r.id)"
              >
                <HexAvatar
                  :avatar-url="r.avatar_url"
                  :name="r.full_name"
                  :email="r.email"
                  :size="32"
                  :font-size="12"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">
                    {{ r.full_name || r.email }}
                  </div>
                  <div v-if="r.full_name && r.email" class="text-xs text-base-content/50 truncate">
                    {{ r.email }}
                  </div>
                </div>
                <span class="text-[0.65rem] text-primary font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100">
                  Add
                </span>
              </button>
            </li>
          </ul>

          <p v-if="errorMsg" class="text-xs text-error">{{ errorMsg }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
