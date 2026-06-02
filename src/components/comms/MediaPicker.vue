<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { searchEmoji } from '@/lib/emoji'
import { giphyEnabled, searchGifs, type Gif } from '@/lib/giphy'

const emit = defineEmits<{
  (e: 'emoji', char: string): void
  (e: 'gif', gif: Gif): void
  (e: 'close'): void
}>()

const hasGif = giphyEnabled()
const tab = ref<'emoji' | 'gif'>('emoji')
const query = ref('')

// Emoji tab filters reactively.
const emojiResults = computed(() => searchEmoji(query.value))

// GIF tab hits Giphy (debounced); the single search box drives whichever tab.
const gifs = ref<Gif[]>([])
const gifLoading = ref(false)
const gifError = ref<string | null>(null)
let debounce = 0
let gifLoadedOnce = false

async function loadGifs() {
  gifLoading.value = true
  gifError.value = null
  const q = query.value
  try {
    const res = await searchGifs(q)
    if (q === query.value) gifs.value = res
    gifLoadedOnce = true
  } catch (e) {
    gifError.value = (e as Error).message
  } finally {
    if (q === query.value) gifLoading.value = false
  }
}
function onInput() {
  if (tab.value === 'gif') {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(loadGifs, 350)
  }
  // emoji is reactive — nothing to do
}
watch(tab, (t) => {
  if (t === 'gif' && !gifLoadedOnce) loadGifs()
})
onBeforeUnmount(() => window.clearTimeout(debounce))
</script>

<template>
  <div class="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden flex flex-col" style="height: 24rem">
    <!-- tabs + search -->
    <div class="border-b border-base-300">
      <div class="flex items-center gap-1 px-2 pt-2">
        <button
          class="px-3 py-1 rounded-lg text-xs font-semibold"
          :class="tab === 'emoji' ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:bg-base-200'"
          @click="tab = 'emoji'"
        >Emoji</button>
        <button
          v-if="hasGif"
          class="px-3 py-1 rounded-lg text-xs font-semibold"
          :class="tab === 'gif' ? 'bg-primary/10 text-primary' : 'text-base-content/50 hover:bg-base-200'"
          @click="tab = 'gif'"
        >GIF</button>
        <div class="flex-1" />
        <button class="w-6 h-6 rounded-md hover:bg-base-200 flex items-center justify-center text-base-content/50" @click="emit('close')">
          <X class="w-4 h-4" :stroke-width="1.75" />
        </button>
      </div>
      <div class="flex items-center gap-2 px-3 py-2">
        <Search class="w-4 h-4 text-base-content/50 shrink-0" :stroke-width="1.75" />
        <input
          v-model="query"
          autofocus
          :placeholder="tab === 'gif' ? 'Search GIFs' : 'Search emoji'"
          class="flex-1 bg-transparent text-sm outline-none min-w-0"
          @input="onInput"
        />
      </div>
    </div>

    <!-- emoji grid -->
    <div v-if="tab === 'emoji'" class="flex-1 min-h-0 overflow-y-auto p-2">
      <div v-if="emojiResults.length === 0" class="text-xs text-base-content/40 px-1 py-2">No emoji found.</div>
      <div class="grid grid-cols-8 gap-0.5">
        <button
          v-for="e in emojiResults"
          :key="e.c"
          class="w-9 h-9 rounded-lg hover:bg-base-200 flex items-center justify-center text-xl"
          :title="e.k.split(' ')[0]"
          @click="emit('emoji', e.c)"
        >{{ e.c }}</button>
      </div>
    </div>

    <!-- gif grid -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto p-2">
      <p v-if="gifError" class="text-xs text-error px-1 py-2">{{ gifError }}</p>
      <p v-else-if="gifLoading && gifs.length === 0" class="text-xs text-base-content/40 px-1 py-2">Loading…</p>
      <p v-else-if="!gifLoading && gifs.length === 0" class="text-xs text-base-content/40 px-1 py-2">No GIFs found.</p>
      <div class="columns-2 gap-2">
        <button
          v-for="g in gifs"
          :key="g.id"
          class="mb-2 block w-full overflow-hidden rounded-lg border border-base-300 hover:border-primary/50 hover:ring-2 hover:ring-primary/30"
          :title="g.title"
          @click="emit('gif', g)"
        >
          <img :src="g.preview" :alt="g.title" loading="lazy" class="w-full block" />
        </button>
      </div>
    </div>

    <!-- attribution (required on the GIF tab) -->
    <div v-if="tab === 'gif'" class="px-3 py-1.5 border-t border-base-300 text-[0.6rem] text-base-content/40 text-right">
      Powered by GIPHY
    </div>
  </div>
</template>
