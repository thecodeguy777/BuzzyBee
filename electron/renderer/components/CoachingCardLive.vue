<script setup lang="ts">
import { ref } from 'vue'
import { Sparkles, Shield, Search, Zap, Bookmark, X } from 'lucide-vue-next'
import type { CoachingCardData } from '../env'

const props = defineProps<{ card: CoachingCardData }>()
const emit = defineEmits<{ (e: 'dismiss'): void }>()

const copied = ref<string | null>(null)

function copyScript(label: string, text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
  copied.value = label
  setTimeout(() => { copied.value = null }, 1500)
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    objection: 'Objection',
    question: 'Surprise Question',
    deadline: 'Deadline / Timing',
    decision: 'Decision Point',
    complaint: 'Complaint',
    praise: 'Praise',
    preference: 'Preference Mentioned',
    unknown_answer: 'Caught Flat-footed',
    other: 'Moment',
  }
  return map[cat] || 'Moment'
}

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    objection: 'bg-red-500/15 text-red-600 border-red-200',
    question: 'bg-amber-500/15 text-amber-700 border-amber-200',
    deadline: 'bg-orange-500/15 text-orange-700 border-orange-200',
    decision: 'bg-blue-500/15 text-blue-700 border-blue-200',
    complaint: 'bg-red-500/15 text-red-600 border-red-200',
    praise: 'bg-green-500/15 text-green-700 border-green-200',
    preference: 'bg-pink-500/15 text-pink-700 border-pink-200',
    unknown_answer: 'bg-purple-500/15 text-purple-700 border-purple-200',
    other: 'bg-base-200 text-base-content/70 border-base-300',
  }
  return map[cat] || 'bg-base-200 text-base-content/70 border-base-300'
}
</script>

<template>
  <div class="border border-base-300 rounded-lg bg-base-100 shadow-sm overflow-hidden">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-base-300 bg-gradient-to-r from-primary/[0.04] to-purple-500/[0.04]">
      <Sparkles class="w-3.5 h-3.5 text-primary" />
      <span class="text-[10px] uppercase tracking-wider text-base-content/60 font-semibold">AI Coach</span>
      <span
        class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border"
        :class="categoryColor(card.category)"
      >{{ categoryLabel(card.category) }}</span>
      <button class="ml-auto text-base-content/30 hover:text-base-content/70 transition-colors" @click="emit('dismiss')">
        <X class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Trigger -->
    <div class="px-4 py-2 border-b border-base-300 text-xs text-base-content/70">
      🎯 {{ card.trigger }}
    </div>

    <!-- Scripts -->
    <div class="divide-y divide-base-300">
      <button
        class="w-full text-left px-4 py-2.5 hover:bg-base-200/50 transition-colors group flex items-start gap-3"
        @click="copyScript('safe', card.scripts.safe)"
      >
        <div class="flex items-center gap-1.5 shrink-0 w-16 mt-0.5">
          <Shield class="w-3 h-3 text-green-600" />
          <span class="text-[9px] uppercase tracking-wider font-bold text-green-600">Safe</span>
        </div>
        <p class="text-sm text-base-content/85 leading-relaxed flex-1">"{{ card.scripts.safe }}"</p>
        <span class="text-[10px] text-base-content/30 group-hover:text-primary transition-colors shrink-0 mt-1">
          {{ copied === 'safe' ? '✓ Copied' : 'Copy' }}
        </span>
      </button>

      <button
        class="w-full text-left px-4 py-2.5 hover:bg-base-200/50 transition-colors group flex items-start gap-3"
        @click="copyScript('sharp', card.scripts.sharp)"
      >
        <div class="flex items-center gap-1.5 shrink-0 w-16 mt-0.5">
          <Search class="w-3 h-3 text-blue-600" />
          <span class="text-[9px] uppercase tracking-wider font-bold text-blue-600">Sharp</span>
        </div>
        <p class="text-sm text-base-content/85 leading-relaxed flex-1">"{{ card.scripts.sharp }}"</p>
        <span class="text-[10px] text-base-content/30 group-hover:text-primary transition-colors shrink-0 mt-1">
          {{ copied === 'sharp' ? '✓ Copied' : 'Copy' }}
        </span>
      </button>

      <button
        class="w-full text-left px-4 py-2.5 hover:bg-base-200/50 transition-colors group flex items-start gap-3"
        @click="copyScript('bold', card.scripts.bold)"
      >
        <div class="flex items-center gap-1.5 shrink-0 w-16 mt-0.5">
          <Zap class="w-3 h-3 text-purple-600" />
          <span class="text-[9px] uppercase tracking-wider font-bold text-purple-600">Bold</span>
        </div>
        <p class="text-sm text-base-content/85 leading-relaxed flex-1">"{{ card.scripts.bold }}"</p>
        <span class="text-[10px] text-base-content/30 group-hover:text-primary transition-colors shrink-0 mt-1">
          {{ copied === 'bold' ? '✓ Copied' : 'Copy' }}
        </span>
      </button>
    </div>

    <!-- Capture note -->
    <div v-if="card.capture" class="px-4 py-2 bg-primary/[0.03] border-t border-base-300 text-[11px] text-base-content/70 flex items-start gap-1.5">
      <Bookmark class="w-3 h-3 text-primary shrink-0 mt-0.5" />
      <span><span class="text-primary font-semibold">Capture:</span> {{ card.capture }}</span>
    </div>
  </div>
</template>
