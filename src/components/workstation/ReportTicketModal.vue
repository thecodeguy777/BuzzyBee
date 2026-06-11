<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  X,
  Bug,
  Lightbulb,
  HelpCircle,
  MessageSquare,
  Send,
  Sparkles,
  ShieldCheck,
  ChevronDown
} from 'lucide-vue-next'
import { useTicketsStore, type TicketType, type TicketSeverity } from '@/stores/tickets'
import { useClientsStore } from '@/stores/clients'
import { useProjectsStore } from '@/stores/projects'
import { snapshotDiagnostics } from '@/lib/diagnostics'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'submitted', ref: string): void }>()

const tickets = useTicketsStore()
const clients = useClientsStore()
const projects = useProjectsStore()

const types: {
  value: TicketType
  label: string
  icon: any
  description: string
  active: string
  iconBg: string
}[] = [
  {
    value: 'bug',
    label: 'Bug',
    icon: Bug,
    description: 'Something is broken or wrong',
    active: 'border-error/60 bg-error/5 text-error',
    iconBg: 'bg-error/10 text-error'
  },
  {
    value: 'feature_request',
    label: 'Feature',
    icon: Lightbulb,
    description: 'An idea worth building',
    active: 'border-info/60 bg-info/5 text-info',
    iconBg: 'bg-info/10 text-info'
  },
  {
    value: 'question',
    label: 'Question',
    icon: HelpCircle,
    description: 'Not sure how this works',
    active: 'border-warning/60 bg-warning/5 text-warning',
    iconBg: 'bg-warning/10 text-warning'
  },
  {
    value: 'feedback',
    label: 'Feedback',
    icon: MessageSquare,
    description: 'General thoughts',
    active: 'border-primary/60 bg-primary/5 text-primary',
    iconBg: 'bg-primary/10 text-primary'
  }
]

const severities: { value: TicketSeverity; label: string; class: string; activeClass: string }[] = [
  { value: 'low', label: 'Low', class: 'border-base-300 text-base-content/60', activeClass: 'border-base-content/40 bg-base-200 text-base-content' },
  { value: 'medium', label: 'Medium', class: 'border-base-300 text-base-content/70', activeClass: 'border-warning/40 bg-warning/10 text-warning' },
  { value: 'high', label: 'High', class: 'border-base-300 text-base-content/70', activeClass: 'border-warning bg-warning/15 text-warning' },
  { value: 'critical', label: 'Critical', class: 'border-base-300 text-base-content/70', activeClass: 'border-error bg-error/15 text-error' }
]

const type = ref<TicketType>('bug')
const severity = ref<TicketSeverity>('medium')
const title = ref('')
const description = ref('')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)
const showDetails = ref(false)
const titleEl = ref<HTMLInputElement | null>(null)

const showSeverity = computed(() => type.value === 'bug')
const titleCount = computed(() => title.value.length)
const descCount = computed(() => description.value.length)
const canSubmit = computed(() => title.value.trim().length >= 3 && !submitting.value)

watch(
  () => props.open,
  (is) => {
    if (is) {
      type.value = 'bug'
      severity.value = 'medium'
      title.value = ''
      description.value = ''
      errorMsg.value = null
      submitting.value = false
      showDetails.value = false
      setTimeout(() => titleEl.value?.focus(), 50)
    }
  }
)

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMsg.value = null
  try {
    const diag = snapshotDiagnostics()
    const ticket = await tickets.createTicket({
      title: title.value,
      description: description.value,
      type: type.value,
      severity: severity.value,
      page_url: diag.page_url,
      user_agent: diag.user_agent,
      viewport: diag.viewport,
      context: {
        client_id: clients.currentClientId,
        client_name: clients.currentClient?.name,
        project_id: projects.currentProjectId,
        project_name: projects.currentProject?.name,
        timezone: diag.timezone,
        recent_console: diag.console,
        recent_routes: diag.routes
      }
    })
    emit('submitted', ticket.reference_number)
    emit('close')
  } catch (e) {
    errorMsg.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}

function close() {
  if (!submitting.value) emit('close')
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close()
}
function onSubmitShortcut(e: KeyboardEvent) {
  if (!props.open) return
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    void submit()
  }
}
onMounted(() => {
  document.addEventListener('keydown', onEsc)
  document.addEventListener('keydown', onSubmitShortcut)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onEsc)
  document.removeEventListener('keydown', onSubmitShortcut)
})

const placeholderByType: Record<TicketType, string> = {
  bug: 'e.g. Drag handle on the kanban card disappears when…',
  feature_request: 'e.g. Add a dark mode toggle in the sidebar',
  question: 'e.g. How do I assign a task to multiple people?',
  feedback: "e.g. The new calendar view is great, but…"
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        @click="close"
      />
    </Transition>

    <Transition
      enter-active-class="transition-all duration-250 ease-out"
      enter-from-class="opacity-0 translate-y-4 scale-[0.98]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-4 scale-[0.98]"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-4 pointer-events-none"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-lg rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden pointer-events-auto">
          <!-- header -->
          <header class="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
            <div class="flex items-start gap-3">
              <div
                class="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0"
              >
                <Sparkles class="w-5 h-5" :stroke-width="1.75" />
              </div>
              <div>
                <h2 class="font-display text-lg font-semibold leading-tight">
                  Tell us what's up
                </h2>
                <p class="text-xs text-base-content/60 mt-0.5">
                  Bug, idea, question — anything helps us improve.
                </p>
              </div>
            </div>
            <button
              type="button"
              class="w-8 h-8 -mt-1 -mr-2 rounded-full flex items-center justify-center text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors"
              aria-label="Close"
              :disabled="submitting"
              @click="close"
            >
              <X class="w-4 h-4" :stroke-width="2" />
            </button>
          </header>

          <form class="px-6 pb-5 space-y-4" @submit.prevent="submit">
            <!-- type as cards -->
            <div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="t in types"
                  :key="t.value"
                  type="button"
                  class="group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all"
                  :class="
                    type === t.value
                      ? t.active + ' shadow-sm'
                      : 'border-base-300 text-base-content/70 hover:border-base-content/30 hover:bg-base-100'
                  "
                  @click="type = t.value"
                >
                  <div
                    class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                    :class="type === t.value ? t.iconBg : 'bg-base-200/60 text-base-content/60'"
                  >
                    <component :is="t.icon" class="w-4 h-4" :stroke-width="1.75" />
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-medium leading-tight">{{ t.label }}</div>
                    <div class="text-[0.65rem] mt-0.5 leading-tight opacity-80">
                      {{ t.description }}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <!-- severity (bug only) -->
            <Transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 -translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition-all duration-150 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-1"
            >
              <div v-if="showSeverity">
                <div class="text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold mb-1.5">
                  How bad?
                </div>
                <div class="grid grid-cols-4 gap-1.5">
                  <button
                    v-for="s in severities"
                    :key="s.value"
                    type="button"
                    class="rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-colors"
                    :class="severity === s.value ? s.activeClass : s.class + ' hover:bg-base-100'"
                    @click="severity = s.value"
                  >
                    {{ s.label }}
                  </button>
                </div>
              </div>
            </Transition>

            <!-- title -->
            <label class="block">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
                  Title
                </span>
                <span
                  class="text-[0.65rem] tabular-nums"
                  :class="titleCount > 100 ? 'text-warning' : 'text-base-content/40'"
                >
                  {{ titleCount }}/120
                </span>
              </div>
              <input
                ref="titleEl"
                v-model="title"
                type="text"
                maxlength="120"
                :placeholder="placeholderByType[type]"
                class="w-full rounded-lg border border-base-300 px-3 py-2 text-sm bg-base-100 outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <!-- description -->
            <label class="block">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[0.65rem] uppercase tracking-wider text-base-content/60 font-semibold">
                  Details
                  <span class="font-normal lowercase text-base-content/40">(optional)</span>
                </span>
                <span class="text-[0.65rem] text-base-content/40 tabular-nums">{{ descCount }}</span>
              </div>
              <textarea
                v-model="description"
                rows="4"
                placeholder="What did you expect? What happened instead? Steps to reproduce help a lot."
                class="w-full rounded-lg border border-base-300 px-3 py-2 text-sm bg-base-100 outline-none resize-y transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <!-- privacy + diagnostic disclosure -->
            <button
              type="button"
              class="w-full flex items-center gap-2 rounded-lg border border-base-300/60 bg-base-100/40 px-3 py-2 text-left hover:bg-base-200/40 transition-colors"
              @click="showDetails = !showDetails"
            >
              <ShieldCheck class="w-4 h-4 text-success shrink-0" :stroke-width="1.75" />
              <span class="text-xs flex-1 text-base-content/70">
                We'll attach diagnostic info — never screenshots or keystrokes.
              </span>
              <ChevronDown
                class="w-3.5 h-3.5 text-base-content/40 shrink-0 transition-transform"
                :class="showDetails && 'rotate-180'"
                :stroke-width="1.75"
              />
            </button>

            <Transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 max-h-0"
              enter-to-class="opacity-100 max-h-32"
              leave-active-class="transition-all duration-150 ease-in"
              leave-from-class="opacity-100 max-h-32"
              leave-to-class="opacity-0 max-h-0"
            >
              <ul
                v-if="showDetails"
                class="-mt-2 px-3 pb-1 text-[0.7rem] text-base-content/60 space-y-0.5 overflow-hidden"
              >
                <li>· current page URL + viewport size</li>
                <li>· browser user-agent + timezone</li>
                <li>· current client + project</li>
                <li>· last 20 console errors / warnings</li>
                <li>· last 20 route changes</li>
              </ul>
            </Transition>

            <p v-if="errorMsg" class="text-xs text-error">{{ errorMsg }}</p>
          </form>

          <!-- footer -->
          <footer
            class="flex items-center justify-between gap-2 px-6 py-3 border-t border-base-300/60 bg-base-200/40"
          >
            <span class="text-[0.65rem] text-base-content/50 hidden sm:inline">
              <kbd class="kbd kbd-xs">Esc</kbd>
              to close ·
              <kbd class="kbd kbd-xs">⌘</kbd>
              <kbd class="kbd kbd-xs">↵</kbd>
              to send
            </span>
            <div class="flex items-center gap-2 ml-auto">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="submitting"
                @click="close"
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm gap-2"
                :disabled="!canSubmit"
                @click="submit"
              >
                <Send class="w-3.5 h-3.5" :stroke-width="1.75" />
                {{ submitting ? 'Sending…' : 'Send report' }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
