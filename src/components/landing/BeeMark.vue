<script setup lang="ts">
import rawBee from '@/assets/bee.svg?raw'
import { prefixSvgIds } from '@/utils/svg'

const beeSvg = prefixSvgIds(rawBee, 'hero-bee')
</script>

<template>
  <div class="w-full h-full bee-wrapper" v-html="beeSvg" aria-hidden="true" />
</template>

<style scoped>
.bee-wrapper :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
