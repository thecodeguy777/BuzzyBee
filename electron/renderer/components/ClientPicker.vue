<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Users, Search, Check } from 'lucide-vue-next'

interface Client {
  id: string
  name: string
  status: string | null
}

const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', val: string | null): void }>()

const clients = ref<Client[]>([])
const open = ref(false)
const search = ref('')
const loading = ref(false)

const selected = computed(() => clients.value.find(c => c.id === props.modelValue) || null)

const filtered = computed(() => {
  if (!search.value.trim()) return clients.value
  const q = search.value.toLowerCase()
  return clients.value.filter(c => c.name.toLowerCase().includes(q))
})

async function load() {
  loading.value = true
  try {
    clients.value = await window.electronAPI.clients.list()
  } finally {
    loading.value = false
  }
}

function pick(id: string | null) {
  emit('update:modelValue', id)
  window.electronAPI.clients.setActive(id)
  open.value = false
  search.value = ''
}

onMounted(load)
</script>

<template>
  <div class="relative">
    <label class="text-[11px] uppercase tracking-wider text-base-content/40 mb-1.5 block flex items-center gap-1.5">
      <Users class="w-3 h-3" />
      Client
    </label>

    <button
      class="w-full border border-base-300 rounded-md px-3 py-2 text-sm text-left bg-base-100 hover:border-primary/40 transition-colors flex items-center justify-between"
      @click="open = !open; if (open) load()"
    >
      <span v-if="selected" class="text-base-content/85">{{ selected.name }}</span>
      <span v-else class="text-base-content/40">No client (general meeting)</span>
      <span class="text-base-content/40 text-xs">▾</span>
    </button>

    <div v-if="open" class="absolute z-30 w-full mt-1 border border-base-300 rounded-md bg-base-100 shadow-lg max-h-72 overflow-hidden flex flex-col">
      <div class="p-2 border-b border-base-300 flex items-center gap-2">
        <Search class="w-3.5 h-3.5 text-base-content/40" />
        <input
          v-model="search"
          autofocus
          placeholder="Search clients…"
          class="flex-1 bg-transparent text-xs focus:outline-none"
        />
      </div>
      <div class="overflow-y-auto flex-1">
        <button
          class="w-full text-left px-3 py-2 text-xs hover:bg-base-200 transition-colors flex items-center justify-between"
          :class="!modelValue ? 'text-primary' : 'text-base-content/60'"
          @click="pick(null)"
        >
          <span>No client (general meeting)</span>
          <Check v-if="!modelValue" class="w-3.5 h-3.5" />
        </button>

        <div v-if="loading" class="px-3 py-3 text-xs text-base-content/50">Loading…</div>

        <div v-if="!loading && filtered.length === 0" class="px-3 py-3 text-xs text-base-content/50">
          {{ search ? 'No matches.' : 'No clients found in your account.' }}
        </div>

        <button
          v-for="c in filtered"
          :key="c.id"
          class="w-full text-left px-3 py-2 text-xs hover:bg-base-200 transition-colors flex items-center justify-between"
          :class="modelValue === c.id ? 'text-primary bg-primary/5' : 'text-base-content/80'"
          @click="pick(c.id)"
        >
          <span class="truncate">{{ c.name }}</span>
          <span class="flex items-center gap-2 shrink-0">
            <span v-if="c.status" class="text-[9px] uppercase tracking-wider text-base-content/40">{{ c.status }}</span>
            <Check v-if="modelValue === c.id" class="w-3.5 h-3.5" />
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
