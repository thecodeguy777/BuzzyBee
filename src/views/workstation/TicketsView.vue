<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Bug,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  Send,
  Hash,
  Search
} from 'lucide-vue-next'
import { useTicketsStore, type TicketType, type TicketStatus, type TicketSeverity, type Ticket } from '@/stores/tickets'
import { useAuthStore } from '@/stores/auth'

const tickets = useTicketsStore()
const auth = useAuthStore()

const filterStatus = ref<'all' | TicketStatus>('open')
const filterType = ref<'all' | TicketType>('all')
const search = ref('')
const showInternal = ref(true)

const newComment = ref('')
const newCommentInternal = ref(false)
const sending = ref(false)

const filteredList = computed(() => {
  return tickets.visibleTickets.filter((t) => {
    if (filterStatus.value !== 'all') {
      if (filterStatus.value === 'open') {
        // "open" filter shows anything not in a terminal state
        if (['resolved', 'wont_fix', 'duplicate'].includes(t.status)) return false
      } else if (t.status !== filterStatus.value) return false
    }
    if (filterType.value !== 'all' && t.type !== filterType.value) return false
    if (search.value.trim()) {
      const q = search.value.trim().toLowerCase()
      const hay =
        (t.title + ' ' + (t.description ?? '') + ' ' + t.reference_number + ' ' + (t.reporter_name ?? '')).toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

watch(
  () => tickets.selectedTicketId,
  (id) => {
    if (id) {
      void tickets.fetchComments(id)
      newComment.value = ''
      newCommentInternal.value = false
    }
  }
)

function typeIcon(t: TicketType) {
  return t === 'bug' ? Bug : t === 'feature_request' ? Lightbulb : t === 'question' ? HelpCircle : MessageSquare
}
function typeColor(t: TicketType) {
  return t === 'bug'
    ? 'text-error'
    : t === 'feature_request'
      ? 'text-info'
      : t === 'question'
        ? 'text-warning'
        : 'text-base-content/60'
}
function severityClass(s: TicketSeverity) {
  return s === 'critical'
    ? 'bg-error/15 text-error'
    : s === 'high'
      ? 'bg-warning/15 text-warning'
      : s === 'medium'
        ? 'bg-base-200 text-base-content/70'
        : 'bg-base-200/60 text-base-content/50'
}
function statusBadge(s: TicketStatus) {
  return {
    open: 'bg-info/15 text-info',
    in_review: 'bg-base-200 text-base-content',
    in_progress: 'bg-warning/15 text-warning',
    resolved: 'bg-success/15 text-success',
    wont_fix: 'bg-base-200 text-base-content/50',
    duplicate: 'bg-base-200 text-base-content/50'
  }[s]
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const detail = computed<Ticket | null>(() => tickets.selectedTicket as Ticket | null)
const detailComments = computed(() =>
  detail.value ? tickets.commentsByTicket[detail.value.id] ?? [] : []
)
const visibleComments = computed(() =>
  detailComments.value.filter((c) => showInternal.value || !c.is_internal)
)

async function setStatus(id: string, status: TicketStatus) {
  try {
    await tickets.setStatus(id, status)
  } catch (e) {
    console.warn('[tickets] setStatus:', (e as Error).message)
  }
}

async function setType(id: string, type: TicketType) {
  try {
    await tickets.updateTicket(id, { type })
  } catch (e) {
    console.warn('[tickets] setType:', (e as Error).message)
  }
}

async function setSeverity(id: string, severity: TicketSeverity) {
  try {
    await tickets.updateTicket(id, { severity })
  } catch (e) {
    console.warn('[tickets] setSeverity:', (e as Error).message)
  }
}

async function sendComment() {
  if (!detail.value || !newComment.value.trim()) return
  sending.value = true
  try {
    await tickets.addComment(detail.value.id, newComment.value, newCommentInternal.value && tickets.isAdmin)
    newComment.value = ''
    newCommentInternal.value = false
  } catch (e) {
    console.warn('[tickets] addComment:', (e as Error).message)
  } finally {
    sending.value = false
  }
}

const statusOptions: { value: 'all' | TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't fix" },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'all', label: 'All' }
]
const typeOptions: { value: 'all' | TicketType; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'bug', label: 'Bugs' },
  { value: 'feature_request', label: 'Features' },
  { value: 'question', label: 'Questions' },
  { value: 'feedback', label: 'Feedback' }
]
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-4">
    <!-- LEFT: list -->
    <div class="space-y-3 min-w-0">
      <header>
        <h1 class="font-display text-xl font-semibold">Tickets</h1>
        <p class="text-xs text-base-content/60 mt-0.5">
          {{ tickets.isAdmin ? 'All beta reports across users.' : 'Reports you submitted.' }}
        </p>
      </header>

      <div class="flex items-center gap-2 flex-wrap">
        <select v-model="filterStatus" class="select select-bordered select-sm">
          <option v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="filterType" class="select select-bordered select-sm">
          <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <label class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-base-300 flex-1 min-w-[10rem] focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/40">
          <Search class="w-4 h-4 text-base-content/50" :stroke-width="1.75" />
          <input
            v-model="search"
            type="text"
            placeholder="Search title, ref, reporter…"
            class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/40"
          />
        </label>
      </div>

      <ul
        v-if="filteredList.length"
        class="bg-white rounded-xl border border-base-300 shadow-md overflow-hidden divide-y divide-base-300/60"
      >
        <li v-for="t in filteredList" :key="t.id">
          <button
            type="button"
            class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-base-200/40 transition-colors"
            :class="tickets.selectedTicketId === t.id && 'bg-primary/5'"
            @click="tickets.selectTicket(t.id)"
          >
            <div
              class="w-8 h-8 rounded-md bg-base-200/60 flex items-center justify-center shrink-0"
              :class="typeColor(t.type)"
            >
              <component :is="typeIcon(t.type)" class="w-4 h-4" :stroke-width="1.75" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium truncate">{{ t.title }}</span>
                <span class="text-[0.65rem] font-mono text-base-content/50">{{ t.reference_number }}</span>
              </div>
              <div class="flex items-center gap-2 mt-1 text-xs text-base-content/60 flex-wrap">
                <span class="px-1.5 py-0.5 rounded text-[0.65rem] font-medium" :class="statusBadge(t.status)">
                  {{ t.status.replace('_', ' ') }}
                </span>
                <span
                  v-if="t.type === 'bug'"
                  class="px-1.5 py-0.5 rounded text-[0.65rem] font-medium"
                  :class="severityClass(t.severity)"
                >
                  {{ t.severity }}
                </span>
                <span class="text-base-content/30">·</span>
                <span class="truncate">{{ t.reporter_name ?? '—' }}</span>
                <span class="text-base-content/30">·</span>
                <span>{{ timeAgo(t.created_at) }}</span>
              </div>
            </div>
          </button>
        </li>
      </ul>
      <div v-else class="bg-white rounded-xl border border-base-300 shadow-md px-6 py-10 text-center text-sm text-base-content/60">
        No tickets match your filters.
      </div>
    </div>

    <!-- RIGHT: detail -->
    <aside class="lg:sticky lg:top-4 self-start min-w-0">
      <div
        v-if="!detail"
        class="bg-white rounded-xl border border-base-300 shadow-md px-6 py-12 text-center text-sm text-base-content/50"
      >
        Select a ticket to view its details.
      </div>
      <div
        v-else
        class="bg-white rounded-xl border border-base-300 shadow-md flex flex-col max-h-[calc(100vh-6rem)]"
      >
        <header class="px-4 py-3 border-b border-base-300 shrink-0">
          <div class="flex items-center gap-2 text-xs text-base-content/60">
            <Hash class="w-3 h-3" :stroke-width="1.75" />
            <span class="font-mono">{{ detail.reference_number }}</span>
            <span class="text-base-content/30">·</span>
            <span>{{ timeAgo(detail.created_at) }}</span>
          </div>
          <h2 class="text-sm font-semibold mt-1">{{ detail.title }}</h2>
        </header>

        <div class="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <!-- meta controls -->
          <div class="grid grid-cols-3 gap-2">
            <label class="form-control">
              <span class="label-text text-[0.65rem] font-medium mb-0.5 uppercase tracking-wider text-base-content/60">Status</span>
              <select
                :value="detail.status"
                class="select select-bordered select-xs"
                :disabled="!tickets.isAdmin"
                @change="setStatus(detail.id, ($event.target as HTMLSelectElement).value as TicketStatus)"
              >
                <option value="open">Open</option>
                <option value="in_review">In review</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="wont_fix">Won't fix</option>
                <option value="duplicate">Duplicate</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-[0.65rem] font-medium mb-0.5 uppercase tracking-wider text-base-content/60">Type</span>
              <select
                :value="detail.type"
                class="select select-bordered select-xs"
                :disabled="!tickets.isAdmin"
                @change="setType(detail.id, ($event.target as HTMLSelectElement).value as TicketType)"
              >
                <option value="bug">Bug</option>
                <option value="feature_request">Feature</option>
                <option value="question">Question</option>
                <option value="feedback">Feedback</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text text-[0.65rem] font-medium mb-0.5 uppercase tracking-wider text-base-content/60">Severity</span>
              <select
                :value="detail.severity"
                class="select select-bordered select-xs"
                :disabled="!tickets.isAdmin"
                @change="setSeverity(detail.id, ($event.target as HTMLSelectElement).value as TicketSeverity)"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>

          <!-- reporter -->
          <div class="text-xs text-base-content/60">
            Reported by <span class="font-medium text-base-content">{{ detail.reporter_name ?? 'Unknown' }}</span>
          </div>

          <!-- description -->
          <div v-if="detail.description" class="text-sm whitespace-pre-wrap">
            {{ detail.description }}
          </div>
          <p v-else class="text-xs italic text-base-content/40">No description.</p>

          <!-- context -->
          <details v-if="tickets.isAdmin" class="text-xs text-base-content/70">
            <summary class="cursor-pointer font-medium">Diagnostic context</summary>
            <dl class="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 font-mono text-[0.7rem]">
              <dt class="text-base-content/50">URL</dt>
              <dd class="col-span-2 truncate">{{ detail.page_url ?? '—' }}</dd>
              <dt class="text-base-content/50">Viewport</dt>
              <dd class="col-span-2">{{ detail.viewport ?? '—' }}</dd>
              <dt class="text-base-content/50">UA</dt>
              <dd class="col-span-2 truncate" :title="detail.user_agent ?? ''">{{ detail.user_agent ?? '—' }}</dd>
            </dl>
            <pre class="mt-2 text-[0.65rem] bg-base-200/60 rounded p-2 overflow-x-auto max-h-48">{{ JSON.stringify(detail.context, null, 2) }}</pre>
          </details>

          <!-- comments -->
          <div class="border-t border-base-300/60 pt-3">
            <div class="flex items-center justify-between text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold mb-2">
              <span>Comments ({{ visibleComments.length }})</span>
              <label v-if="tickets.isAdmin" class="flex items-center gap-1 text-[0.65rem]">
                <input v-model="showInternal" type="checkbox" class="checkbox checkbox-xs" />
                Show internal
              </label>
            </div>

            <ul class="space-y-2">
              <li
                v-for="c in visibleComments"
                :key="c.id"
                class="rounded-md border border-base-300/60 px-3 py-2"
                :class="c.is_internal && 'border-warning/40 bg-warning/5'"
              >
                <div class="flex items-center justify-between gap-2 text-[0.7rem] text-base-content/60">
                  <span class="font-medium text-base-content">{{ c.user_name ?? '—' }}</span>
                  <span>{{ timeAgo(c.created_at) }}</span>
                </div>
                <div class="text-sm whitespace-pre-wrap mt-1">{{ c.message }}</div>
                <div v-if="c.is_internal" class="text-[0.65rem] text-warning font-semibold mt-1">Internal note</div>
              </li>
              <li
                v-if="visibleComments.length === 0"
                class="text-xs text-base-content/40 italic px-1 py-2"
              >
                No comments yet.
              </li>
            </ul>
          </div>
        </div>

        <footer class="border-t border-base-300/60 p-3 space-y-2 shrink-0">
          <textarea
            v-model="newComment"
            rows="2"
            placeholder="Reply…"
            class="textarea textarea-bordered text-sm w-full"
          />
          <div class="flex items-center justify-between gap-2">
            <label v-if="tickets.isAdmin" class="flex items-center gap-1.5 text-xs">
              <input v-model="newCommentInternal" type="checkbox" class="checkbox checkbox-xs" />
              Internal note
            </label>
            <span v-else></span>
            <button
              type="button"
              class="btn btn-primary btn-xs gap-1.5"
              :disabled="!newComment.trim() || sending"
              @click="sendComment"
            >
              <Send class="w-3 h-3" :stroke-width="1.75" />
              {{ sending ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </footer>
      </div>
    </aside>
  </div>
</template>
