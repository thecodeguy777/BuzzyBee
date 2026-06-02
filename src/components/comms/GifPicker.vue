<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { searchGifs, type Gif } from '@/lib/giphy'

const emit = defineEmits<{ (e: 'pick', gif: Gif): void; (e: 'close'): void }>()

const query = ref('')
const gifs = ref<Gif[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let debounce = 0

async function run() {
  loading.value = true
  error.value = null
  const q = query.value
  try {
    const res = await searchGifs(q)
    // Ignore stale responses if the query changed while fetching.
    if (q === query.value) gifs.value = res
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    if (q === query.value) loading.value = false
  }
}
function onInput() {
  window.clearTimeout(debounce)
  debounce = window.setTimeout(run, 350)
}

onMounted(run)
onBeforeUnmount(() => window.clearTimeout(debounce))
</script>

<template>
  <div class="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden flex flex-col" style="height: 24rem">
    <!-- search -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-base-300">
      <Search class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
      <input
        v-model="query"
        autofocus
        placeholder="Search GIFs"
        class="flex-1 bg-transparent text-sm outline-none min-w-0"
        @input="onInput"
      />
      <button class="w-6 h-6 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" @click="emit('close')">
        <X class="w-4 h-4" :stroke-width="1.75" />
      </button>
    </div>

    <!-- grid -->
    <div class="flex-1 min-h-0 overflow-y-auto p-2">
      <p v-if="error" class="text-xs text-error px-1 py-2">{{ error }}</p>
      <p v-else-if="loading && gifs.length === 0" class="text-xs text-base-content/40 px-1 py-2">Loading…</p>
      <p v-else-if="!loading && gifs.length === 0" class="text-xs text-base-content/40 px-1 py-2">No GIFs found.</p>
      <div class="columns-2 gap-2">
        <button
          v-for="g in gifs"
          :key="g.id"
          class="mb-2 block w-full overflow-hidden rounded-lg border border-base-300 hover:border-primary/50 hover:ring-2 hover:ring-primary/30"
          :title="g.title"
          @click="emit('pick', g)"
        >
          <img :src="g.preview" :alt="g.title" loading="lazy" class="w-full block" />
        </button>
      </div>
    </div>

    <!-- attribution (required by Giphy) -->
    <div class="px-3 py-1.5 border-t border-base-300 text-[0.6rem] text-base-content/40 text-right">
      Powered by GIPHY
    </div>
  </div>
</template>
