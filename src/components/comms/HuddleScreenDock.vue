<script setup lang="ts">
// Floating, draggable picture-in-picture of the huddle's shared screen, mounted
// at the shell so it follows you across every /app route — watch a teammate
// present while you work in Tasks/CRM. It yields on the full Comms page (which
// shows the screen inline), same as CommsDock. Drag the header to move it;
// position is clamped to the viewport and remembered.
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Maximize2, Minus, Monitor, X } from 'lucide-vue-next'
import { COMMS_STREAM } from '@/composables/commsStream'

const stream = inject(COMMS_STREAM)!
const route = useRoute()

const firstName = (n: string | null | undefined) => (n || 'Someone').split(' ')[0]

// What to show: a remote peer's screen if any, else our own while we're
// presenting (so you can keep an eye on your share from any page).
const stage = computed(() => {
  const entries = Object.entries(stream.remoteScreens.value)
  if (entries.length) {
    const [userId, ms] = entries[0]
    const p =
      stream.online.value.find((o) => o.userId === userId) ??
      stream.huddlePeople.value.find((o) => o.userId === userId)
    return { key: userId, label: `${firstName(p?.name)} is presenting`, stream: ms as MediaStream }
  }
  if (stream.sharingScreen.value && stream.localScreen.value) {
    return { key: 'self', label: "You're presenting", stream: stream.localScreen.value }
  }
  return null
})

// The full Comms page shows the screen inline → the dock yields there (it's for
// every OTHER page). Same pattern as CommsDock.
const onCommsPage = computed(() => route.name === 'workstation-comms')
const hiddenByUser = ref(false)
watch(() => stage.value?.key ?? null, () => { hiddenByUser.value = false }) // a new share re-shows
const visible = computed(() => !onCommsPage.value && !!stage.value && !hiddenByUser.value)

const minimized = ref(false)

// ── draggable, viewport-clamped, persisted position ──
const POS_KEY = 'buzzybee.huddle.screendock'
const W = 360
function defaultPos() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280
  return { x: Math.max(16, w - W - 24), y: 76 } // top-right (CommsDock owns bottom-right)
}
function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p?.x === 'number' && typeof p?.y === 'number') return p
    }
  } catch { /* ignore */ }
  return defaultPos()
}
const pos = ref(loadPos())
function clamp() {
  const w = window.innerWidth
  const h = window.innerHeight
  pos.value = {
    x: Math.min(Math.max(8, pos.value.x), Math.max(8, w - W - 8)),
    y: Math.min(Math.max(8, pos.value.y), Math.max(8, h - 64)),
  }
}
const style = computed(() => ({ left: `${pos.value.x}px`, top: `${pos.value.y}px`, width: `${W}px` }))

let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false
function onDragStart(e: PointerEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest('button')) return // let the header buttons click
  dragging = true
  sx = e.clientX; sy = e.clientY; ox = pos.value.x; oy = pos.value.y
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
}
function onDragMove(e: PointerEvent) {
  if (!dragging) return
  pos.value = { x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) }
  clamp()
}
function onDragEnd() {
  dragging = false
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  try { localStorage.setItem(POS_KEY, JSON.stringify(pos.value)) } catch { /* ignore */ }
}
function onWinResize() { if (visible.value) clamp() }
onMounted(() => window.addEventListener('resize', onWinResize))
onBeforeUnmount(() => {
  window.removeEventListener('resize', onWinResize)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
})

// Bind the stream to the <video> — re-assign after the element mounts / the
// stream or layout changes (a PiP video remounts as it shows/minimizes).
const videoEl = ref<HTMLVideoElement | null>(null)
watch(
  [() => stage.value?.stream ?? null, minimized, visible],
  ([s]) => {
    nextTick(() => { if (videoEl.value) videoEl.value.srcObject = (s as MediaStream | null) ?? null })
  },
  { immediate: true },
)

function fullscreen() { videoEl.value?.requestFullscreen?.() }
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed z-40 print:hidden" :style="style">
      <!-- minimized pill -->
      <button
        v-if="minimized"
        class="flex items-center gap-2 rounded-full border border-base-300 bg-base-100 shadow-xl pl-3 pr-3.5 py-2 text-xs font-semibold hover:bg-base-200"
        title="Show shared screen"
        @click="minimized = false"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-success" />
        <Monitor class="w-3.5 h-3.5 text-primary" :stroke-width="1.9" />
        {{ stage?.label }}
      </button>

      <!-- expanded picture-in-picture -->
      <div v-else class="rounded-xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
        <header
          class="flex items-center gap-2 px-2.5 py-1.5 bg-base-200/80 cursor-move select-none"
          @pointerdown="onDragStart"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          <span class="text-xs font-semibold truncate">{{ stage?.label }}</span>
          <div class="flex-1" />
          <button class="w-6 h-6 rounded-md hover:bg-base-300 flex items-center justify-center text-base-content/60" title="Fullscreen" @click.stop="fullscreen">
            <Maximize2 class="w-3.5 h-3.5" :stroke-width="1.75" />
          </button>
          <button class="w-6 h-6 rounded-md hover:bg-base-300 flex items-center justify-center text-base-content/60" title="Minimize" @click.stop="minimized = true">
            <Minus class="w-3.5 h-3.5" :stroke-width="2" />
          </button>
          <button class="w-6 h-6 rounded-md hover:bg-base-300 flex items-center justify-center text-base-content/60" title="Hide" @click.stop="hiddenByUser = true">
            <X class="w-3.5 h-3.5" :stroke-width="2" />
          </button>
        </header>
        <video ref="videoEl" autoplay playsinline muted class="w-full aspect-video bg-black object-contain" />
      </div>
    </div>
  </Teleport>
</template>
