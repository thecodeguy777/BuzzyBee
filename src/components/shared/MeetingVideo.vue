<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

// Binds a live MediaStream to a <video>. Vue can't set srcObject from a
// template (it's a property, not an attribute), so we wire it via a ref.
// Used for camera tiles in the meeting room — muted because participant
// audio is played through separate <audio> elements in useMeetingRoom.
const props = defineProps<{ stream: MediaStream | null; mirror?: boolean }>()
const el = ref<HTMLVideoElement | null>(null)

function bind() {
  if (el.value) el.value.srcObject = props.stream ?? null
}
onMounted(bind)
watch(() => props.stream, bind)
</script>

<template>
  <video
    ref="el"
    autoplay
    playsinline
    muted
    class="w-full h-full object-cover bg-black"
    :class="mirror ? 'scale-x-[-1]' : ''"
  />
</template>
