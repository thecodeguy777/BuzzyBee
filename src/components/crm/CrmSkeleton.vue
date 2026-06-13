<script setup lang="ts">
// Shape-matched loading skeletons for the CRM tabs. The variant mirrors the
// real layout of each tab so the first paint doesn't jump (e.g. the Companies
// tab gets a table skeleton, not a kanban one).
defineProps<{ variant: 'overview' | 'board' | 'table' | 'campaigns' | 'designs' }>()
</script>

<template>
  <div class="flex-1 min-h-0 overflow-hidden px-5 pt-1 pb-5 animate-pulse">
    <!-- pipeline board -->
    <div v-if="variant === 'board'" class="flex gap-3.5 items-start">
      <div v-for="n in 5" :key="n" class="w-[286px] flex-none rounded-xl border border-base-300 bg-base-200 p-2.5 flex flex-col gap-2.5">
        <div class="h-7 rounded-md bg-base-300/60" />
        <div v-for="m in 3" :key="m" class="h-24 rounded-[11px] bg-base-100 border border-base-300" />
      </div>
    </div>

    <!-- dense table (companies / contacts / leads) -->
    <template v-else-if="variant === 'table'">
      <div class="flex items-center gap-3 mb-3">
        <div class="h-4 w-24 rounded bg-base-300/60" />
        <div class="h-9 w-[300px] rounded-[9px] bg-base-200 border border-base-300" />
        <div class="flex-1" />
        <div class="h-8 w-28 rounded-[9px] bg-base-300/60" />
      </div>
      <div class="border border-base-300 rounded-xl overflow-hidden bg-base-100">
        <div class="h-[42px] bg-base-200 border-b border-base-300" />
        <div v-for="n in 10" :key="n" class="flex items-center gap-3 px-4 h-[52px] border-b border-base-200">
          <div class="w-8 h-8 rounded-lg bg-base-300/60 flex-none" />
          <div class="h-3 rounded bg-base-300/50 flex-1 max-w-[34%]" />
          <div class="h-3 w-24 rounded bg-base-300/40" />
          <div class="h-3 w-28 rounded bg-base-300/40 hidden md:block" />
          <div class="h-3 w-16 rounded bg-base-300/40 hidden lg:block" />
          <div class="flex-1" />
          <div class="h-3 w-12 rounded bg-base-300/30" />
        </div>
      </div>
    </template>

    <!-- overview: stat cards + two panels -->
    <template v-else-if="variant === 'overview'">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div v-for="n in 4" :key="n" class="rounded-xl border border-base-300 bg-base-100 p-4">
          <div class="h-3 w-20 rounded bg-base-300/50 mb-3" />
          <div class="h-6 w-16 rounded bg-base-300/60" />
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div class="rounded-xl border border-base-300 bg-base-100 p-4 h-56">
          <div class="h-3 w-28 rounded bg-base-300/50 mb-4" />
          <div v-for="n in 5" :key="n" class="h-5 rounded bg-base-300/40 mb-2.5" :style="{ width: (92 - n * 13) + '%' }" />
        </div>
        <div class="rounded-xl border border-base-300 bg-base-100 p-4 h-56">
          <div class="h-3 w-28 rounded bg-base-300/50 mb-4" />
          <div v-for="n in 4" :key="n" class="h-10 rounded-lg bg-base-300/40 mb-2.5" />
        </div>
      </div>
    </template>

    <!-- campaigns: summary strip + list -->
    <template v-else-if="variant === 'campaigns'">
      <div class="flex gap-2.5 mb-4">
        <div v-for="n in 4" :key="n" class="flex-1 rounded-xl border border-base-300 bg-base-100 p-3.5">
          <div class="h-3 w-16 rounded bg-base-300/50 mb-2" />
          <div class="h-5 w-12 rounded bg-base-300/60" />
        </div>
      </div>
      <div class="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
        <div v-for="n in 6" :key="n" class="flex items-center gap-3 px-4 h-16 border-b border-base-200">
          <div class="w-9 h-9 rounded-lg bg-base-300/60 flex-none" />
          <div class="flex-1">
            <div class="h-3 w-1/3 rounded bg-base-300/50 mb-2" />
            <div class="h-2.5 w-1/4 rounded bg-base-300/40" />
          </div>
          <div class="h-7 w-24 rounded bg-base-300/40" />
        </div>
      </div>
    </template>

    <!-- designs: card grid -->
    <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-3.5">
      <div v-for="n in 6" :key="n" class="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
        <div class="h-32 bg-base-300/40" />
        <div class="p-3">
          <div class="h-3 w-2/3 rounded bg-base-300/50 mb-2" />
          <div class="h-2.5 w-1/3 rounded bg-base-300/40" />
        </div>
      </div>
    </div>
  </div>
</template>
