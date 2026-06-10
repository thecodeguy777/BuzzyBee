<script setup lang="ts">
// Dev-only playground for refining the SeenCluster honeycomb. Visit /seen-preview.
import SeenCluster from '@/components/comms/SeenCluster.vue'

const NAMES = [
  'Mary Aquino', 'Jayson Remigio', 'Dennis Cruz',
  'Liza Reyes', 'Mark Villanueva', 'Ana Santos', 'Rico Dela Cruz'
]
function mock(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `u${i}-${n}`,
    name: NAMES[i % NAMES.length],
    avatarUrl: null
  }))
}
const counts = [1, 2, 3, 4, 5, 6]
const sizes = [18, 28, 44]
</script>

<template>
  <div class="min-h-screen bg-base-200 text-base-content p-10 space-y-10">
    <div>
      <h1 class="text-2xl font-extrabold tracking-tight">SeenCluster preview</h1>
      <p class="text-sm text-base-content/60 mt-1">
        Honeycomb "seen by" cluster at a few sizes and member counts. The 18px row matches the message stream.
      </p>
    </div>

    <div v-for="s in sizes" :key="s" class="space-y-3">
      <h2 class="text-xs font-bold uppercase tracking-wider text-base-content/50">size {{ s }}px</h2>
      <div class="flex flex-wrap gap-12 items-center bg-base-100 p-10 rounded-2xl border border-base-300">
        <div v-for="n in counts" :key="n" class="flex flex-col items-center gap-3">
          <div class="grid place-items-center" :style="{ minHeight: s * 3 + 'px' }">
            <SeenCluster :members="mock(n)" :size="s" :max="4" />
          </div>
          <span class="text-xs font-medium text-base-content/50">{{ n }} {{ n === 1 ? 'member' : 'members' }}</span>
        </div>
      </div>
    </div>

    <!-- in-context: as it appears under a message -->
    <div class="space-y-3">
      <h2 class="text-xs font-bold uppercase tracking-wider text-base-content/50">in context (under a message)</h2>
      <div class="bg-base-100 rounded-2xl border border-base-300 p-6 max-w-lg">
        <div class="text-sm text-base-content/90">nakikita kitang nagseseen but im not sure</div>
        <div class="mt-1.5 flex items-center justify-end gap-1.5">
          <span class="text-[0.6rem] font-medium text-base-content/40">Seen</span>
          <SeenCluster :members="mock(3)" :size="18" :max="4" />
        </div>
      </div>
    </div>
  </div>
</template>
