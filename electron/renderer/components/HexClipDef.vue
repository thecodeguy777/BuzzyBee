<script setup lang="ts">
import { HEX_CLIP_ID, HEX_CLIP_PATH } from '../lib/hexPath'

// Renders the shared honeycomb-cell <clipPath> once per window root so any
// element can become a hexagon via `.hc-hex` / `clip-path: url(#hc-hex-clip)`.
// Single source of truth — the same path the HexAvatar cells use, so logo
// marks and avatars share the exact cell geometry. Duplicate instances are
// harmless (browsers resolve url() to the first matching id).
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
