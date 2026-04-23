<script setup lang="ts">
import { ref, computed } from 'vue'
import iconSetSrc from '@/assets/icon-set.svg?raw'
import avatarsSrc from '@/assets/avatars.svg?raw'
import blobsSrc from '@/assets/blobs.svg?raw'
import SvgCrop from '@/components/shared/SvgCrop.vue'

type Region = { x: number; y: number; width: number; height: number; label: string }

function makeGrid(cols: number, rows: number, canvas = 1024, pad = 0, labels?: string[]): Region[] {
  const cellW = (canvas - pad * 2) / cols
  const cellH = (canvas - pad * 2) / rows
  const out: Region[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      out.push({
        x: pad + c * cellW,
        y: pad + r * cellH,
        width: cellW,
        height: cellH,
        label: labels?.[idx] ?? `#${idx + 1}`
      })
    }
  }
  return out
}

// Initial guesses — adjust via the inputs below each set
const iconCols = ref(3), iconRows = ref(2), iconPad = ref(0)
const avatarCols = ref(3), avatarRows = ref(2), avatarPad = ref(0)
const blobCols = ref(2), blobRows = ref(2), blobPad = ref(0)

const iconRegions = computed(() => makeGrid(iconCols.value, iconRows.value, 1024, iconPad.value))
const avatarRegions = computed(() => makeGrid(avatarCols.value, avatarRows.value, 1024, avatarPad.value))
const blobRegions = computed(() => makeGrid(blobCols.value, blobRows.value, 1024, blobPad.value))
</script>

<template>
  <div class="min-h-screen bg-base-100 text-base-content p-8">
    <div class="max-w-7xl mx-auto">
      <h1 class="font-display text-4xl font-semibold mb-2">Asset Tuner</h1>
      <p class="text-base-content/70 mb-10">Adjust the grid to match how each Recraft output is laid out. Copy the final region numbers into your page code.</p>

      <!-- ICON SET -->
      <section class="mb-16">
        <div class="flex items-end justify-between mb-4">
          <h2 class="font-display text-2xl">icon-set.svg</h2>
          <div class="flex gap-3 text-sm">
            <label class="flex items-center gap-1">cols <input type="number" v-model.number="iconCols" class="input input-xs input-bordered w-16" /></label>
            <label class="flex items-center gap-1">rows <input type="number" v-model.number="iconRows" class="input input-xs input-bordered w-16" /></label>
            <label class="flex items-center gap-1">pad <input type="number" v-model.number="iconPad" class="input input-xs input-bordered w-20" /></label>
          </div>
        </div>
        <div class="grid grid-cols-[1fr,2fr] gap-6">
          <div class="border border-base-300 rounded-lg p-2 bg-white">
            <div class="aspect-square" v-html="iconSetSrc" />
          </div>
          <div class="grid gap-3" :style="`grid-template-columns: repeat(${iconCols}, minmax(0, 1fr));`">
            <div v-for="r in iconRegions" :key="r.label" class="border border-base-300 rounded-lg bg-white p-2 flex flex-col">
              <div class="aspect-square flex-1">
                <SvgCrop :source="iconSetSrc" :x="r.x" :y="r.y" :width="r.width" :height="r.height" />
              </div>
              <div class="mt-2 text-[10px] font-mono text-base-content/60 text-center">
                x {{ Math.round(r.x) }} · y {{ Math.round(r.y) }} · w {{ Math.round(r.width) }} · h {{ Math.round(r.height) }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- AVATARS -->
      <section class="mb-16">
        <div class="flex items-end justify-between mb-4">
          <h2 class="font-display text-2xl">avatars.svg</h2>
          <div class="flex gap-3 text-sm">
            <label class="flex items-center gap-1">cols <input type="number" v-model.number="avatarCols" class="input input-xs input-bordered w-16" /></label>
            <label class="flex items-center gap-1">rows <input type="number" v-model.number="avatarRows" class="input input-xs input-bordered w-16" /></label>
            <label class="flex items-center gap-1">pad <input type="number" v-model.number="avatarPad" class="input input-xs input-bordered w-20" /></label>
          </div>
        </div>
        <div class="grid grid-cols-[1fr,2fr] gap-6">
          <div class="border border-base-300 rounded-lg p-2 bg-white">
            <div class="aspect-square" v-html="avatarsSrc" />
          </div>
          <div class="grid gap-3" :style="`grid-template-columns: repeat(${avatarCols}, minmax(0, 1fr));`">
            <div v-for="r in avatarRegions" :key="r.label" class="border border-base-300 rounded-lg bg-white p-2 flex flex-col">
              <div class="aspect-square flex-1">
                <SvgCrop :source="avatarsSrc" :x="r.x" :y="r.y" :width="r.width" :height="r.height" />
              </div>
              <div class="mt-2 text-[10px] font-mono text-base-content/60 text-center">
                x {{ Math.round(r.x) }} · y {{ Math.round(r.y) }} · w {{ Math.round(r.width) }} · h {{ Math.round(r.height) }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- BLOBS -->
      <section class="mb-16">
        <div class="flex items-end justify-between mb-4">
          <h2 class="font-display text-2xl">blobs.svg</h2>
          <div class="flex gap-3 text-sm">
            <label class="flex items-center gap-1">cols <input type="number" v-model.number="blobCols" class="input input-xs input-bordered w-16" /></label>
            <label class="flex items-center gap-1">rows <input type="number" v-model.number="blobRows" class="input input-xs input-bordered w-16" /></label>
            <label class="flex items-center gap-1">pad <input type="number" v-model.number="blobPad" class="input input-xs input-bordered w-20" /></label>
          </div>
        </div>
        <div class="grid grid-cols-[1fr,2fr] gap-6">
          <div class="border border-base-300 rounded-lg p-2 bg-white">
            <div class="aspect-square" v-html="blobsSrc" />
          </div>
          <div class="grid gap-3" :style="`grid-template-columns: repeat(${blobCols}, minmax(0, 1fr));`">
            <div v-for="r in blobRegions" :key="r.label" class="border border-base-300 rounded-lg bg-white p-2 flex flex-col">
              <div class="aspect-square flex-1">
                <SvgCrop :source="blobsSrc" :x="r.x" :y="r.y" :width="r.width" :height="r.height" />
              </div>
              <div class="mt-2 text-[10px] font-mono text-base-content/60 text-center">
                x {{ Math.round(r.x) }} · y {{ Math.round(r.y) }} · w {{ Math.round(r.width) }} · h {{ Math.round(r.height) }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
