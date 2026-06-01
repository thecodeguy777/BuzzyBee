<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Search, X, Phone, Building2, Mail, CornerDownLeft } from 'lucide-vue-next'
import { useLeads, type Lead } from '../composables/useLeads'
import { useGlobalSearch } from '../composables/useGlobalSearch'
import LeadStatusBadge from './dialer/LeadStatusBadge.vue'
import CrmStageBadge from './crm/CrmStageBadge.vue'

const emit = defineEmits<{
  (e: 'select', leadId: string): void
}>()

const leads = useLeads()
const search = useGlobalSearch()

const inputRef = ref<HTMLInputElement | null>(null)
const highlightIdx = ref(0)

const results = computed<Lead[]>(() => {
  const q = search.query.value.trim().toLowerCase()
  const all = leads.leads.value
  if (!q) {
    // No query — show most recently touched leads as a starting list
    return [...all]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 30)
  }
  return all
    .filter(l =>
      l.fullName.toLowerCase().includes(q)
      || l.phoneE164.toLowerCase().includes(q)
      || (l.company?.toLowerCase().includes(q) ?? false)
      || (l.email?.toLowerCase().includes(q) ?? false)
      || (l.notes?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 50)
})

// Reset highlight + autofocus whenever the modal opens
watch(() => search.isOpen.value, (open) => {
  if (open) {
    highlightIdx.value = 0
    nextTick(() => inputRef.value?.focus())
  }
}, { immediate: true })

// Reset highlight when query changes
watch(() => search.query.value, () => {
  highlightIdx.value = 0
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); search.close(); return }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIdx.value = Math.min(highlightIdx.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIdx.value = Math.max(0, highlightIdx.value - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const lead = results.value[highlightIdx.value]
    if (lead) selectLead(lead.id)
  }
}

function selectLead(id: string) {
  emit('select', id)
  search.close()
}

function fmtPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
}
</script>

<template>
  <transition name="search-fade">
    <div
      v-if="search.isOpen.value"
      class="fixed inset-0 z-[150] flex items-start justify-center pt-16 px-4"
      style="background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);"
      @click.self="search.close()"
      @keydown="onKeydown"
    >
      <div class="bg-base-100 border border-base-300 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <!-- Search input -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-base-300">
          <Search class="w-4 h-4 text-base-content/40" />
          <input
            ref="inputRef"
            v-model="search.query.value"
            type="text"
            placeholder="Search any lead by name, phone, company, email, or notes…"
            class="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-base-content/30"
            @keydown="onKeydown"
          />
          <kbd class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-base-200 text-base-content/50">Esc</kbd>
          <button
            class="text-base-content/30 hover:text-base-content transition-colors"
            @click="search.close()"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Results -->
        <div class="max-h-96 overflow-y-auto">
          <div v-if="results.length === 0" class="p-6 text-center">
            <Search class="w-7 h-7 mx-auto mb-2 text-base-content/20" />
            <p class="text-xs text-base-content/50">
              <span v-if="search.query.value">No leads match "{{ search.query.value }}"</span>
              <span v-else>No leads yet — import a CSV or seed demo data first.</span>
            </p>
          </div>

          <button
            v-for="(lead, idx) in results"
            :key="lead.id"
            class="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
            :class="idx === highlightIdx ? 'bg-primary/10' : 'hover:bg-base-200/60'"
            @mouseenter="highlightIdx = idx"
            @click="selectLead(lead.id)"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-medium text-base-content truncate">{{ lead.fullName }}</span>
                <CrmStageBadge :stage="lead.stage" size="xs" />
                <LeadStatusBadge :status="lead.status" size="xs" />
              </div>
              <div class="flex items-center gap-2 mt-0.5 text-[10px] text-base-content/60">
                <span class="font-mono">{{ fmtPhone(lead.phoneE164) }}</span>
                <span v-if="lead.company" class="flex items-center gap-0.5 truncate">
                  <Building2 class="w-2.5 h-2.5 shrink-0" />
                  {{ lead.company }}
                </span>
                <span v-if="lead.email" class="flex items-center gap-0.5 truncate">
                  <Mail class="w-2.5 h-2.5 shrink-0" />
                  {{ lead.email }}
                </span>
              </div>
            </div>
            <CornerDownLeft
              v-if="idx === highlightIdx"
              class="w-3 h-3 text-base-content/40 shrink-0"
            />
          </button>
        </div>

        <!-- Footer hint -->
        <div class="px-4 py-2 border-t border-base-300 bg-base-200/40 text-[10px] text-base-content/50 flex items-center gap-3">
          <span class="flex items-center gap-1">
            <kbd class="px-1 py-0.5 font-mono rounded bg-base-100 text-base-content/60">↑</kbd>
            <kbd class="px-1 py-0.5 font-mono rounded bg-base-100 text-base-content/60">↓</kbd>
            navigate
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1 py-0.5 font-mono rounded bg-base-100 text-base-content/60">↵</kbd>
            open
          </span>
          <div class="flex-1"></div>
          <span>{{ results.length }} of {{ leads.leads.value.length }}</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 0.12s ease;
}
.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}
</style>
