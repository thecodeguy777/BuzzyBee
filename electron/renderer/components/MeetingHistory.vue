<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { History, Clock, RefreshCw, FileText, ChevronDown, ChevronUp, Download, Sparkles } from 'lucide-vue-next'

interface MeetingRow {
  id: string
  title: string | null
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  summaryText: string | null
  clientId: string | null
  clientName: string | null
}

const meetings = ref<MeetingRow[]>([])
const loading = ref(false)
const expandedId = ref<string | null>(null)
const detail = ref<any | null>(null)
const exporting = ref<string | null>(null)
const regenerating = ref<string | null>(null)
const toast = ref<{ message: string; isError?: boolean } | null>(null)

async function regenerateSummary(id: string) {
  if (regenerating.value) return
  regenerating.value = id
  try {
    const result = await window.electronAPI.history.regenerateSummary(id)
    if (result.success) {
      toast.value = { message: 'Summary regenerated' }
      // Refresh detail if currently expanded
      if (expandedId.value === id) {
        detail.value = await window.electronAPI.history.detail(id)
      }
      // Refresh list so the "summary" tag appears if it was missing
      await load()
    } else {
      toast.value = { message: result.error || 'Failed to regenerate', isError: true }
    }
    setTimeout(() => { toast.value = null }, 4000)
  } finally {
    regenerating.value = null
  }
}

async function exportPdf(id: string) {
  exporting.value = id
  try {
    const result = await window.electronAPI.history.exportPdf(id)
    if (result.success && result.path) {
      toast.value = { message: `Saved to ${result.path}` }
      setTimeout(() => { toast.value = null }, 4000)
    } else if (result.error && result.error !== 'Cancelled') {
      toast.value = { message: result.error, isError: true }
      setTimeout(() => { toast.value = null }, 5000)
    }
  } finally {
    exporting.value = null
  }
}

async function load() {
  loading.value = true
  try {
    meetings.value = await window.electronAPI.history.list()
  } finally {
    loading.value = false
  }
}

async function toggleDetail(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    detail.value = null
    return
  }
  expandedId.value = id
  detail.value = await window.electronAPI.history.detail(id)
}

function formatDuration(secs: number | null): string {
  if (!secs) return '—'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function parsedSummary(detailObj: any): any {
  if (!detailObj?.summary_text) return null
  try {
    const m = detailObj.summary_text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
  } catch {}
  return null
}

onMounted(load)
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-5">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center">
          <History class="w-4 h-4 text-primary" />
        </div>
        <h3 class="text-sm font-semibold text-base-content">Meeting History</h3>
      </div>
      <button
        class="border border-base-300 rounded-md px-3 py-1.5 text-xs hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
        :disabled="loading"
        @click="load"
      >
        <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': loading }" />
        Refresh
      </button>
    </div>

    <!-- Empty -->
    <div v-if="meetings.length === 0 && !loading" class="text-center py-12">
      <FileText class="w-8 h-8 mx-auto mb-3 text-base-content/30" />
      <p class="text-sm text-base-content/50">No meetings yet.</p>
      <p class="text-xs text-base-content/40 mt-1">Your first meeting will appear here after you end it.</p>
    </div>

    <div v-if="loading && meetings.length === 0" class="text-center py-12 text-sm text-base-content/50">
      Loading…
    </div>

    <!-- Toast -->
    <div
      v-if="toast"
      class="fixed bottom-4 right-4 z-50 max-w-sm border rounded-lg px-4 py-3 shadow-lg text-sm"
      :class="toast.isError
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-base-100 border-primary/30 shadow-primary/10'"
    >
      {{ toast.message }}
    </div>

    <!-- List -->
    <div v-if="meetings.length > 0" class="border border-base-300 rounded-lg divide-y divide-base-300 overflow-hidden">
      <div v-for="m in meetings" :key="m.id">
        <button
          class="w-full flex items-center justify-between p-4 hover:bg-base-200/50 transition-colors text-left"
          @click="toggleDetail(m.id)"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span
                v-if="m.clientName"
                class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary"
              >{{ m.clientName }}</span>
              <span class="text-sm font-medium text-base-content/90 truncate">{{ m.title || 'Untitled meeting' }}</span>
            </div>
            <div class="flex items-center gap-3 mt-1 text-[11px] text-base-content/50">
              <span>{{ formatDate(m.startedAt) }}</span>
              <span class="flex items-center gap-1">
                <Clock class="w-3 h-3" />
                {{ formatDuration(m.durationSeconds) }}
              </span>
              <span v-if="m.summaryText" class="text-primary/70">summary</span>
            </div>
          </div>
          <span
            class="text-[10px] font-medium text-base-content/40 hover:text-primary px-2 py-1 rounded hover:bg-primary/5 transition-colors flex items-center gap-1"
            :title="`Regenerate summary for ${m.title || 'meeting'}`"
            @click.stop="regenerateSummary(m.id)"
          >
            <Sparkles class="w-3 h-3" :class="{ 'animate-pulse': regenerating === m.id }" />
            <span>{{ regenerating === m.id ? 'Generating…' : 'Regenerate' }}</span>
          </span>
          <span
            class="text-[10px] font-medium text-base-content/40 hover:text-primary px-2 py-1 rounded hover:bg-primary/5 transition-colors flex items-center gap-1"
            :title="`Export ${m.title || 'meeting'} as PDF`"
            @click.stop="exportPdf(m.id)"
          >
            <Download class="w-3 h-3" :class="{ 'animate-pulse': exporting === m.id }" />
            <span>{{ exporting === m.id ? 'Exporting…' : 'PDF' }}</span>
          </span>
          <component :is="expandedId === m.id ? ChevronUp : ChevronDown" class="w-4 h-4 text-base-content/40 shrink-0" />
        </button>

        <!-- Expanded detail -->
        <div v-if="expandedId === m.id && detail" class="px-4 pb-4 bg-base-200/30">
          <div v-if="parsedSummary(detail)" class="space-y-3">
            <div v-if="parsedSummary(detail).summary" class="text-xs text-base-content/70 leading-relaxed">
              {{ parsedSummary(detail).summary }}
            </div>

            <div v-if="parsedSummary(detail).actionItems?.length">
              <div class="text-[10px] uppercase tracking-wider text-primary/60 mb-1.5">Action Items</div>
              <ul class="space-y-1">
                <li v-for="(item, i) in parsedSummary(detail).actionItems" :key="i" class="text-xs text-base-content/70 flex items-start gap-2">
                  <span class="shrink-0 w-1 h-1 rounded-full bg-primary mt-1.5"></span>
                  <span>
                    {{ item.task }}
                    <span v-if="item.assignee" class="text-primary/70">({{ item.assignee }})</span>
                    <span v-if="item.deadline" class="text-base-content/50"> by {{ item.deadline }}</span>
                  </span>
                </li>
              </ul>
            </div>

            <div v-if="parsedSummary(detail).keyDecisions?.length">
              <div class="text-[10px] uppercase tracking-wider text-base-content/40 mb-1.5">Decisions</div>
              <ul class="space-y-1">
                <li v-for="d in parsedSummary(detail).keyDecisions" :key="d" class="text-xs text-base-content/70 flex items-start gap-2">
                  <span class="shrink-0 w-1 h-1 rounded-full bg-base-content/40 mt-1.5"></span>
                  {{ d }}
                </li>
              </ul>
            </div>
          </div>

          <div v-if="detail.transcript?.length" class="mt-3 pt-3 border-t border-base-300">
            <div class="text-[10px] uppercase tracking-wider text-base-content/40 mb-1.5">Full Transcript ({{ detail.transcript.length }} lines)</div>
            <div class="max-h-48 overflow-y-auto space-y-1 text-[11px] text-base-content/60 leading-relaxed">
              <div v-for="(line, i) in detail.transcript" :key="i">
                <span class="font-medium text-primary/60">{{ line.speaker }}:</span>
                {{ line.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
