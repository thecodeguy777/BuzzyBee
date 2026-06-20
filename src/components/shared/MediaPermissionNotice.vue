<script setup lang="ts">
import { computed } from 'vue'
import { Video, ShieldAlert, CheckCircle2, RotateCw } from 'lucide-vue-next'
import type { PermState } from '@/composables/useMediaPermissions'

// Surfaces mic + camera permission status with actionable wording:
//  • denied  → step-by-step reset instructions (+ Re-check / Reload)
//  • prompt/unknown → gentle "your browser will ask" heads-up
//  • granted → a quiet "ready" confirmation
const props = defineProps<{ mic: PermState; cam: PermState }>()
const emit = defineEmits<{ recheck: [] }>()

const blocked = computed(() => props.mic === 'denied' || props.cam === 'denied')
const ready = computed(() => props.mic === 'granted' && props.cam === 'granted')
const blockedLabel = computed(() => {
  const b: string[] = []
  if (props.cam === 'denied') b.push('Camera')
  if (props.mic === 'denied') b.push('Microphone')
  return b.join(' and ')
})
const reload = () => window.location.reload()
</script>

<template>
  <!-- Blocked: must be reset in the browser's site settings -->
  <div v-if="blocked" class="perm perm-bad">
    <ShieldAlert class="w-[18px] h-[18px] flex-none mt-0.5" :stroke-width="1.9" />
    <div class="min-w-0">
      <div class="perm-title">{{ blockedLabel }} {{ blockedLabel.includes('and') ? 'are' : 'is' }} blocked</div>
      <ol class="perm-steps">
        <li>Click the <strong>camera</strong> or <strong>lock</strong> icon at the left of your browser's address bar.</li>
        <li>Set <strong>Camera</strong> and <strong>Microphone</strong> to <strong>Allow</strong>.</li>
        <li>Hit <strong>Re-check</strong> below (or reload the page).</li>
      </ol>
      <div class="flex gap-2 mt-2">
        <button type="button" class="perm-btn" @click="emit('recheck')">
          <RotateCw class="w-3.5 h-3.5" :stroke-width="2" /> Re-check
        </button>
        <button type="button" class="perm-btn" @click="reload">Reload</button>
      </div>
    </div>
  </div>

  <!-- Not yet granted: the browser will prompt -->
  <div v-else-if="!ready" class="perm perm-warn">
    <Video class="w-[18px] h-[18px] flex-none mt-0.5" :stroke-width="1.9" />
    <div class="min-w-0">
      <div class="perm-title">Allow camera &amp; microphone</div>
      <p class="perm-sub">
        Your browser will ask when you join or turn your camera on — choose
        <strong>Allow</strong> so people can see and hear you.
      </p>
    </div>
  </div>

  <!-- Ready -->
  <div v-else class="perm perm-good">
    <CheckCircle2 class="w-[18px] h-[18px] flex-none" :stroke-width="1.9" />
    <span class="perm-title">Camera &amp; mic ready</span>
  </div>
</template>

<style scoped>
.perm {
  display: flex;
  gap: 10px;
  border-radius: 12px;
  padding: 11px 13px;
  border: 1px solid;
  font-size: 12.5px;
}
.perm-bad { border-color: rgba(255, 138, 155, 0.35); background: rgba(226, 59, 84, 0.12); color: #ffd7de; }
.perm-warn { border-color: rgba(217, 165, 49, 0.35); background: rgba(217, 165, 49, 0.12); color: #f3e3c0; }
.perm-good { border-color: rgba(43, 182, 115, 0.35); background: rgba(43, 182, 115, 0.12); color: #c7f0dd; align-items: center; }
.perm-title { font-weight: 700; }
.perm-sub { margin-top: 2px; opacity: 0.9; line-height: 1.35; }
.perm-steps { margin-top: 4px; padding-left: 16px; list-style: decimal; line-height: 1.5; opacity: 0.92; }
.perm-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  font-weight: 650;
  font-size: 12px;
}
.perm-btn:hover { background: rgba(255, 255, 255, 0.2); }
</style>
