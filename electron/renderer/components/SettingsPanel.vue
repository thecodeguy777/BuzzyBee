<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Settings, Key, Clock, Mic2, Zap, Sparkles, Brain } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settings'
import Toast from './Toast.vue'
import MicrophoneSetup from './MicrophoneSetup.vue'

const settingsStore = useSettingsStore()
const apiKey = ref('')
const groqKey = ref('')
const elevenLabsKey = ref('')
const deepgramKey = ref('')
const transcriptionProvider = ref<'deepgram' | 'elevenlabs'>('deepgram')
const llmProvider = ref<'groq' | 'gemini'>('groq')
const coachingInterval = ref(60)
const coachingEnabled = ref(true)

const toast = ref({ show: false, message: '', type: 'success' as 'success' | 'error' })

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toast.value = { show: true, message, type }
}

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
  }
})

async function save() {
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
    showToast('Settings saved successfully')
  } catch (err) {
    showToast(`Save failed: ${err}`, 'error')
  }
}

async function testApiKey() {
  if (!apiKey.value.trim()) {
    showToast('Enter an API key first', 'error')
    return
  }
  showToast('Testing connection...', 'success')
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.value.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with just OK' }] }],
        }),
      }
    )
    const data = await res.json()
    if (data.candidates) {
      showToast('Gemini API key works!')
    } else {
      showToast(`API error: ${data.error?.message || 'Unknown'}`, 'error')
    }
  } catch (err) {
    showToast(`Network error: ${err}`, 'error')
  }
}
</script>

<template>
  <div class="p-6 space-y-5">
    <div class="flex items-center gap-3 mb-2">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/15 flex items-center justify-center">
        <Settings class="w-4 h-4 text-primary" />
      </div>
      <h3 class="text-sm font-semibold text-base-content">Settings</h3>
    </div>

    <!-- Transcription provider -->
    <div>
      <label class="text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5 block">Transcription engine</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          class="border rounded-md p-3 text-left transition-all"
          :class="transcriptionProvider === 'deepgram'
            ? 'border-primary bg-primary/5'
            : 'border-base-300 hover:border-primary/50'"
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
          :class="transcriptionProvider === 'elevenlabs'
            ? 'border-primary bg-primary/5'
            : 'border-base-300 hover:border-primary/50'"
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

    <!-- Deepgram API Key -->
    <div>
      <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
        <Zap class="w-3 h-3" />
        Deepgram API Key
      </label>
      <input
        v-model="deepgramKey"
        type="password"
        placeholder="dg_..."
        class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
      />
      <p class="text-[10px] text-base-content/40 mt-1">Get a free key at console.deepgram.com ($200 credit, ~200hr free).</p>
    </div>

    <!-- ElevenLabs API Key -->
    <div>
      <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
        <Mic2 class="w-3 h-3" />
        ElevenLabs API Key (fallback)
      </label>
      <input
        v-model="elevenLabsKey"
        type="password"
        placeholder="sk_..."
        class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
      />
      <p class="text-[10px] text-base-content/40 mt-1">Optional. Only used if you select ElevenLabs as the engine.</p>
    </div>

    <!-- LLM provider toggle -->
    <div>
      <label class="text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5 block">Summary & Coaching engine</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          class="border rounded-md p-3 text-left transition-all"
          :class="llmProvider === 'groq'
            ? 'border-primary bg-primary/5'
            : 'border-base-300 hover:border-primary/50'"
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
          :class="llmProvider === 'gemini'
            ? 'border-primary bg-primary/5'
            : 'border-base-300 hover:border-primary/50'"
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

    <!-- Groq API Key -->
    <div>
      <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
        <Sparkles class="w-3 h-3" />
        Groq API Key
      </label>
      <input
        v-model="groqKey"
        type="password"
        placeholder="gsk_..."
        class="w-full border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
      />
      <p class="text-[10px] text-base-content/40 mt-1">Free at console.groq.com/keys. Used for summaries and coaching prompts.</p>
    </div>

    <!-- Gemini API Key -->
    <div>
      <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
        <Key class="w-3 h-3" />
        Gemini API Key (fallback)
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
          @click="testApiKey"
        >
          Test
        </button>
      </div>
      <p class="text-[10px] text-base-content/40 mt-1">Used for coaching prompts and meeting summaries (free at ai.google.dev).</p>
    </div>

    <!-- Coaching interval -->
    <div>
      <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/50 mb-1.5">
        <Clock class="w-3 h-3" />
        Coaching interval (seconds)
      </label>
      <input
        v-model.number="coachingInterval"
        type="number"
        min="30"
        max="300"
        class="w-24 border border-base-300 rounded-md px-3 py-2 text-sm bg-base-100 focus:border-primary focus:outline-none transition-colors"
      />
    </div>

    <!-- Coaching toggle -->
    <label class="flex items-center gap-3 cursor-pointer">
      <input v-model="coachingEnabled" type="checkbox" class="toggle toggle-primary toggle-sm" />
      <span class="text-sm text-base-content/70">Enable real-time coaching</span>
    </label>

    <!-- Microphone setup -->
    <MicrophoneSetup />

    <!-- Save -->
    <button
      class="inline-flex items-center gap-2 bg-primary text-primary-content font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity text-sm"
      @click="save"
    >
      Save Settings
    </button>

    <Toast
      :show="toast.show"
      :message="toast.message"
      :type="toast.type"
      @close="toast.show = false"
    />
  </div>
</template>
