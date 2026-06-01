<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Settings, Mic2, Brain, Sparkles, Headphones, Phone,
  ShieldCheck, User, Palette, Zap, Key, Clock, Check,
  AlertCircle, Loader2,
} from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import Toast from './Toast.vue'
import MicrophoneSetup from './MicrophoneSetup.vue'

const settingsStore = useSettingsStore()

// ── Section navigation ─────────────────────────────────────────────
type Section = 'transcription' | 'ai' | 'coaching' | 'audio'
  | 'dialer' | 'compliance' | 'profile' | 'display'

interface NavItem {
  id: Section
  label: string
  icon: any
  available: boolean
  description?: string
}

const SECTIONS: NavItem[] = [
  { id: 'transcription', label: 'Transcription', icon: Mic2, available: true, description: 'Engine and API keys for speech-to-text' },
  { id: 'ai',            label: 'AI Models',     icon: Brain, available: true, description: 'LLM provider for summaries and coaching prompts' },
  { id: 'coaching',      label: 'Coaching',      icon: Sparkles, available: true, description: 'Real-time coaching cadence and toggles' },
  { id: 'audio',         label: 'Audio',         icon: Headphones, available: true, description: 'Microphone selection and capture test' },
  { id: 'dialer',        label: 'Dialer',        icon: Phone, available: false, description: 'SignalWire credentials, DID, softphone preferences' },
  { id: 'compliance',    label: 'Compliance',    icon: ShieldCheck, available: false, description: 'TCPA call windows, max attempts, cooldown' },
  { id: 'profile',       label: 'Profile',       icon: User, available: false, description: 'Display name, timezone, default lead source' },
  { id: 'display',       label: 'Display',       icon: Palette, available: false, description: 'Theme, density, font size' },
]

const activeSection = ref<Section>('transcription')

const activeMeta = computed(() => SECTIONS.find(s => s.id === activeSection.value))

// ── Settings state ─────────────────────────────────────────────────
const apiKey = ref('')
const groqKey = ref('')
const elevenLabsKey = ref('')
const deepgramKey = ref('')
const transcriptionProvider = ref<'deepgram' | 'elevenlabs'>('deepgram')
const llmProvider = ref<'groq' | 'gemini'>('groq')
const coachingInterval = ref(60)
const coachingEnabled = ref(true)

const isLoading = ref(true)
const savingState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const savingError = ref<string | null>(null)
const lastSavedAt = ref<number | null>(null)

const toast = ref({ show: false, message: '', type: 'success' as 'success' | 'error' })
function showToast(message: string, type: 'success' | 'error' = 'success') {
  toast.value = { show: true, message, type }
}

// ── Auto-save ──────────────────────────────────────────────────────
// Debounced commit so typing into an API key field doesn't write on every
// keystroke. 500ms is short enough to feel responsive, long enough to batch.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let savedClearTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (isLoading.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(commitNow, 500)
}

async function commitNow() {
  if (isLoading.value) return
  savingState.value = 'saving'
  try {
    await settingsStore.save({
      geminiApiKey: apiKey.value.trim(),
      groqApiKey: groqKey.value.trim(),
      elevenLabsApiKey: elevenLabsKey.value.trim(),
      deepgramApiKey: deepgramKey.value.trim(),
      transcriptionProvider: transcriptionProvider.value,
      llmProvider: llmProvider.value,
      coachingIntervalSeconds: coachingInterval.value,
      coachingEnabled: coachingEnabled.value,
    })
    savingState.value = 'saved'
    savingError.value = null
    lastSavedAt.value = Date.now()
    // Clear the "saved" pill after 2s so it doesn't loiter
    if (savedClearTimer) clearTimeout(savedClearTimer)
    savedClearTimer = setTimeout(() => {
      if (savingState.value === 'saved') savingState.value = 'idle'
    }, 2000)
  } catch (err: any) {
    savingState.value = 'error'
    savingError.value = err?.message ?? String(err)
  }
}

// Watch every settings ref. The settings panel is small enough that one
// combined watcher is fine — no need to per-field.
watch(
  [apiKey, groqKey, elevenLabsKey, deepgramKey, transcriptionProvider, llmProvider, coachingInterval, coachingEnabled],
  scheduleSave,
  { deep: false },
)

onMounted(async () => {
  try {
    await settingsStore.load()
    apiKey.value = settingsStore.settings.geminiApiKey
    groqKey.value = settingsStore.settings.groqApiKey || ''
    elevenLabsKey.value = settingsStore.settings.elevenLabsApiKey || ''
    deepgramKey.value = settingsStore.settings.deepgramApiKey || ''
    transcriptionProvider.value = settingsStore.settings.transcriptionProvider || 'deepgram'
    llmProvider.value = settingsStore.settings.llmProvider || 'groq'
    coachingInterval.value = settingsStore.settings.coachingIntervalSeconds
    coachingEnabled.value = settingsStore.settings.coachingEnabled
  } catch (err) {
    showToast(`Failed to load settings: ${err}`, 'error')
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
  if (savedClearTimer) clearTimeout(savedClearTimer)
  // Flush any pending save on close so the user doesn't lose half-typed keys
  if (savingState.value === 'saving' || saveTimer) commitNow()
})

// ── Test buttons (per-key) ─────────────────────────────────────────
async function testGeminiKey() {
  if (!apiKey.value.trim()) {
    showToast('Enter a Gemini API key first', 'error')
    return
  }
  showToast('Testing Gemini…')
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.value.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with just OK' }] }] }),
      },
    )
    const data = await res.json()
    if (data.candidates) showToast('Gemini API key works')
    else showToast(`Gemini error: ${data.error?.message || 'Unknown'}`, 'error')
  } catch (err) {
    showToast(`Network error: ${err}`, 'error')
  }
}
</script>

<template>
  <div class="h-full flex bg-base-100">
    <!-- ── Left nav ─────────────────────────────────────────────── -->
    <aside class="w-52 shrink-0 border-r border-base-300 bg-base-200/40 p-3 overflow-y-auto">
      <div class="flex items-center gap-2 mb-4 px-2 pt-1">
        <Settings class="w-4 h-4 text-primary" />
        <h2 class="text-sm font-semibold text-base-content">Settings</h2>
      </div>

      <nav class="space-y-0.5">
        <button
          v-for="s in SECTIONS"
          :key="s.id"
          class="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors"
          :class="[
            activeSection === s.id
              ? 'bg-primary/10 text-primary font-semibold'
              : s.available
                ? 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
                : 'text-base-content/30 cursor-not-allowed',
          ]"
          :disabled="!s.available"
          :title="s.available ? s.description : 'Coming soon'"
          @click="s.available && (activeSection = s.id)"
        >
          <component :is="s.icon" class="w-3.5 h-3.5 shrink-0" />
          <span class="flex-1 truncate">{{ s.label }}</span>
          <span v-if="!s.available" class="text-[8px] uppercase tracking-wider opacity-60">soon</span>
        </button>
      </nav>
    </aside>

    <!-- ── Right pane ───────────────────────────────────────────── -->
    <main class="flex-1 overflow-y-auto">
      <!-- Sticky header with save state indicator -->
      <div class="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 class="text-base font-semibold text-base-content">{{ activeMeta?.label }}</h1>
          <p v-if="activeMeta?.description" class="text-[11px] text-base-content/50 mt-0.5">{{ activeMeta.description }}</p>
        </div>
        <div class="text-[10px] flex items-center gap-1.5 shrink-0 ml-4">
          <template v-if="savingState === 'saving'">
            <Loader2 class="w-3 h-3 animate-spin text-base-content/40" />
            <span class="text-base-content/40">Saving…</span>
          </template>
          <template v-else-if="savingState === 'saved'">
            <Check class="w-3 h-3 text-emerald-500" />
            <span class="text-emerald-600 dark:text-emerald-400">Saved</span>
          </template>
          <template v-else-if="savingState === 'error'">
            <AlertCircle class="w-3 h-3 text-red-500" />
            <span class="text-red-500 truncate max-w-[200px]" :title="savingError ?? ''">
              {{ savingError ?? 'Save failed' }}
            </span>
          </template>
          <template v-else-if="lastSavedAt">
            <span class="text-base-content/30">Auto-saves on change</span>
          </template>
          <template v-else>
            <span class="text-base-content/30">Auto-saves on change</span>
          </template>
        </div>
      </div>

      <!-- ── Sections ─────────────────────────────────────────── -->
      <div class="px-6 py-5 max-w-2xl">

        <!-- Transcription -->
        <section v-if="activeSection === 'transcription'" class="space-y-5">
          <div>
            <label class="text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5 block">Transcription engine</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                class="border rounded-md p-3 text-left transition-all"
                :class="transcriptionProvider === 'deepgram' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50'"
                @click="transcriptionProvider = 'deepgram'"
              >
                <div class="flex items-center gap-1.5 mb-1">
                  <Zap class="w-3.5 h-3.5" :class="transcriptionProvider === 'deepgram' ? 'text-primary' : 'text-base-content/50'" />
                  <span class="text-xs font-semibold" :class="transcriptionProvider === 'deepgram' ? 'text-primary' : 'text-base-content/80'">Deepgram (live)</span>
                </div>
                <div class="text-[10px] text-base-content/50 leading-tight">~300ms streaming. Word-level. Free 200hr.</div>
              </button>
              <button
                class="border rounded-md p-3 text-left transition-all"
                :class="transcriptionProvider === 'elevenlabs' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50'"
                @click="transcriptionProvider = 'elevenlabs'"
              >
                <div class="flex items-center gap-1.5 mb-1">
                  <Mic2 class="w-3.5 h-3.5" :class="transcriptionProvider === 'elevenlabs' ? 'text-primary' : 'text-base-content/50'" />
                  <span class="text-xs font-semibold" :class="transcriptionProvider === 'elevenlabs' ? 'text-primary' : 'text-base-content/80'">ElevenLabs Scribe</span>
                </div>
                <div class="text-[10px] text-base-content/50 leading-tight">5s batch. $0.39/hr.</div>
              </button>
            </div>
          </div>

          <div>
            <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
              <Zap class="w-3 h-3" /> Deepgram API key
            </label>
            <input
              v-model="deepgramKey"
              type="password"
              placeholder="dg_..."
              class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
            />
            <p class="text-[10px] text-base-content/40 mt-1">Get a free key at console.deepgram.com ($200 credit, ~200hr free).</p>
          </div>

          <div>
            <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
              <Mic2 class="w-3 h-3" /> ElevenLabs API key (fallback)
            </label>
            <input
              v-model="elevenLabsKey"
              type="password"
              placeholder="sk_..."
              class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
            />
            <p class="text-[10px] text-base-content/40 mt-1">Optional. Only used if you select ElevenLabs as the engine.</p>
          </div>
        </section>

        <!-- AI Models -->
        <section v-else-if="activeSection === 'ai'" class="space-y-5">
          <div>
            <label class="text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5 block">Summary &amp; coaching engine</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                class="border rounded-md p-3 text-left transition-all"
                :class="llmProvider === 'groq' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50'"
                @click="llmProvider = 'groq'"
              >
                <div class="flex items-center gap-1.5 mb-1">
                  <Sparkles class="w-3.5 h-3.5" :class="llmProvider === 'groq' ? 'text-primary' : 'text-base-content/50'" />
                  <span class="text-xs font-semibold" :class="llmProvider === 'groq' ? 'text-primary' : 'text-base-content/80'">Groq</span>
                </div>
                <div class="text-[10px] text-base-content/50 leading-tight">Llama 3.3 70B. 14,400 free req/day.</div>
              </button>
              <button
                class="border rounded-md p-3 text-left transition-all"
                :class="llmProvider === 'gemini' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-primary/50'"
                @click="llmProvider = 'gemini'"
              >
                <div class="flex items-center gap-1.5 mb-1">
                  <Brain class="w-3.5 h-3.5" :class="llmProvider === 'gemini' ? 'text-primary' : 'text-base-content/50'" />
                  <span class="text-xs font-semibold" :class="llmProvider === 'gemini' ? 'text-primary' : 'text-base-content/80'">Gemini</span>
                </div>
                <div class="text-[10px] text-base-content/50 leading-tight">2.5 Flash. Free tier limited to 20 req/day.</div>
              </button>
            </div>
          </div>

          <div>
            <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
              <Sparkles class="w-3 h-3" /> Groq API key
            </label>
            <input
              v-model="groqKey"
              type="password"
              placeholder="gsk_..."
              class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
            />
            <p class="text-[10px] text-base-content/40 mt-1">Free at console.groq.com/keys.</p>
          </div>

          <div>
            <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
              <Key class="w-3 h-3" /> Gemini API key (fallback)
            </label>
            <div class="flex gap-2">
              <input
                v-model="apiKey"
                type="password"
                placeholder="AIza..."
                class="flex-1 border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
              />
              <button
                class="border border-base-300 text-base-content/70 px-3 py-2 rounded-md text-xs hover:border-primary hover:text-primary transition-colors"
                @click="testGeminiKey"
              >
                Test
              </button>
            </div>
            <p class="text-[10px] text-base-content/40 mt-1">Free at ai.google.dev. Used as fallback for summaries and coaching.</p>
          </div>
        </section>

        <!-- Coaching -->
        <section v-else-if="activeSection === 'coaching'" class="space-y-5">
          <div>
            <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
              <Clock class="w-3 h-3" /> Coaching interval (seconds)
            </label>
            <input
              v-model.number="coachingInterval"
              type="number"
              min="30"
              max="300"
              class="w-32 border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
            />
            <p class="text-[10px] text-base-content/40 mt-1">How often HiveMind generates a coaching prompt during a live meeting.</p>
          </div>

          <label class="flex items-center gap-3 cursor-pointer">
            <input v-model="coachingEnabled" type="checkbox" class="toggle toggle-primary toggle-sm" />
            <span class="text-sm text-base-content/80">Enable real-time coaching</span>
          </label>
        </section>

        <!-- Audio -->
        <section v-else-if="activeSection === 'audio'">
          <MicrophoneSetup />
        </section>

        <!-- Placeholder sections (visible only via direct nav — currently disabled in left nav) -->
        <section v-else class="text-center py-12">
          <div class="w-12 h-12 mx-auto mb-3 rounded-lg bg-base-200 flex items-center justify-center">
            <component :is="activeMeta?.icon" class="w-5 h-5 text-base-content/40" />
          </div>
          <h3 class="text-sm font-semibold text-base-content/80">{{ activeMeta?.label }} — coming soon</h3>
          <p class="text-[11px] text-base-content/50 mt-1.5 max-w-sm mx-auto leading-relaxed">
            {{ activeMeta?.description }}
          </p>
        </section>

      </div>
    </main>

    <Toast
      :show="toast.show"
      :message="toast.message"
      :type="toast.type"
      @close="toast.show = false"
    />
  </div>
</template>
