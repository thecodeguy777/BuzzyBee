<script setup lang="ts">
import { HEX_CLIP_ID, HEX_CLIP_PATH } from '@/lib/hexPath'

// Renders the shared honeycomb-cell <clipPath> once so any element can become a
// hexagon via `clip-path: url(#hc-hex-clip)`. Single source of truth for the
// cell geometry. Duplicate instances are harmless (url() resolves to the first).
</script>

<template>
  <svg aria-hidden="true" width="0" height="0" style="position: absolute; width: 0; height: 0; overflow: hidden">
    <defs>
      <clipPath :id="HEX_CLIP_ID" clipPathUnits="objectBoundingBox">
        <path :d="HEX_CLIP_PATH" />
      </clipPath>
    </defs>
  </svg>
</template>
