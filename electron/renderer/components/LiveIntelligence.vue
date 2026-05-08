<script setup lang="ts">
import { computed } from 'vue'
import { ListChecks, HelpCircle, CheckCircle2, AlertTriangle, Heart, Sparkles } from 'lucide-vue-next'
import { useMeetingStore } from '../stores/meeting'

const meeting = useMeetingStore()

const stateEmpty = computed(() => {
  const i = meeting.intelligence
  return i.actionItems.length === 0
    && i.openQuestions.length === 0
    && i.decisions.length === 0
    && i.clientPreferences.length === 0
    && i.redFlags.length === 0
})

function statusBadge(status: string) {
  switch (status) {
    case 'new': return { label: 'NEW', cls: 'bg-blue-500/15 text-blue-600' }
    case 'expanded': return { label: 'EXPANDED', cls: 'bg-purple-500/15 text-purple-600' }
    case 'simplified': return { label: 'CLARIFIED', cls: 'bg-cyan-500/15 text-cyan-600' }
    case 'done': return { label: 'DONE', cls: 'bg-green-500/15 text-green-600' }
    default: return { label: status.toUpperCase(), cls: 'bg-base-200 text-base-content/60' }
  }
}
</script>

<template>
  <div class="h-full flex flex-col border-r border-base-300 bg-gradient-to-br from-base-200/30 to-primary/[0.02]">
    <div class="px-4 py-3 border-b border-base-300 flex items-center gap-2">
      <Sparkles class="w-3.5 h-3.5 text-primary" />
      <span class="text-[11px] font-semibold uppercase tracking-wider text-base-content/70">Live Intelligence</span>
      <span v-if="meeting.isActive" class="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
      <!-- Empty -->
      <div v-if="stateEmpty" class="text-center py-8 text-xs text-base-content/40 leading-relaxed">
        Items will appear here as the conversation unfolds.
        <br>
        <span class="text-base-content/30">Action items, decisions, open questions, and red flags surface live.</span>
      </div>

      <!-- Action Items -->
      <section v-if="meeting.intelligence.actionItems.length > 0">
        <div class="flex items-center gap-1.5 mb-2">
          <ListChecks class="w-3 h-3 text-primary" />
          <span class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Action Items</span>
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="item in meeting.intelligence.actionItems"
            :key="item.id"
            class="text-xs p-2 rounded border bg-base-100 transition-all"
            :class="item.status === 'done'
              ? 'border-green-200 opacity-70'
              : item.status === 'expanded'
                ? 'border-purple-300/50 ring-1 ring-purple-200'
                : 'border-base-300'"
          >
            <div class="flex items-start gap-1.5 mb-1">
              <span
                class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0 mt-0.5"
                :class="item.assignee === 'VA' ? 'bg-primary/15 text-primary' : 'bg-purple-500/15 text-purple-600'"
              >{{ item.assignee }}</span>
              <span
                class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0 mt-0.5"
                :class="statusBadge(item.status).cls"
              >{{ statusBadge(item.status).label }}</span>
            </div>
            <div :class="item.status === 'done' ? 'line-through text-base-content/50' : 'text-base-content/85'">
              {{ item.task }}
            </div>
            <div v-if="item.deadline" class="text-[10px] text-base-content/50 mt-1">
              ⏱ {{ item.deadline }}
            </div>
          </li>
        </ul>
      </section>

      <!-- Open Questions -->
      <section v-if="meeting.intelligence.openQuestions.length > 0">
        <div class="flex items-center gap-1.5 mb-2">
          <HelpCircle class="w-3 h-3 text-amber-500" />
          <span class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Open Questions</span>
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="q in meeting.intelligence.openQuestions"
            :key="q.id"
            class="text-xs p-2 rounded border border-amber-200/50 bg-amber-50/50"
          >
            <div class="flex items-start gap-1.5 mb-1">
              <span
                class="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0"
                :class="q.asked_by === 'VA' ? 'bg-primary/15 text-primary' : 'bg-purple-500/15 text-purple-600'"
              >{{ q.asked_by }} ASKED</span>
            </div>
            <div class="text-base-content/85">{{ q.question }}</div>
            <div v-if="q.context" class="text-[10px] text-base-content/50 mt-1 italic">{{ q.context }}</div>
          </li>
        </ul>
      </section>

      <!-- Decisions -->
      <section v-if="meeting.intelligence.decisions.length > 0">
        <div class="flex items-center gap-1.5 mb-2">
          <CheckCircle2 class="w-3 h-3 text-green-600" />
          <span class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Decisions</span>
        </div>
        <ul class="space-y-1">
          <li
            v-for="d in meeting.intelligence.decisions"
            :key="d.id"
            class="text-xs text-base-content/85 flex items-start gap-2 pl-1"
          >
            <span class="shrink-0 w-1 h-1 rounded-full bg-green-500 mt-1.5"></span>
            <span>{{ d.decision }}</span>
          </li>
        </ul>
      </section>

      <!-- Client Preferences -->
      <section v-if="meeting.intelligence.clientPreferences.length > 0">
        <div class="flex items-center gap-1.5 mb-2">
          <Heart class="w-3 h-3 text-pink-500" />
          <span class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Client Preferences</span>
        </div>
        <ul class="space-y-1">
          <li
            v-for="p in meeting.intelligence.clientPreferences"
            :key="p"
            class="text-xs text-base-content/80 flex items-start gap-2 pl-1"
          >
            <span class="shrink-0 w-1 h-1 rounded-full bg-pink-500 mt-1.5"></span>
            <span>{{ p }}</span>
          </li>
        </ul>
      </section>

      <!-- Red Flags -->
      <section v-if="meeting.intelligence.redFlags.length > 0">
        <div class="flex items-center gap-1.5 mb-2">
          <AlertTriangle class="w-3 h-3 text-red-500" />
          <span class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Red Flags</span>
        </div>
        <ul class="space-y-1">
          <li
            v-for="r in meeting.intelligence.redFlags"
            :key="r"
            class="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2"
          >
            🚩 {{ r }}
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
