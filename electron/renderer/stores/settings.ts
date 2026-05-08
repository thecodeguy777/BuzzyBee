import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppSettings } from '../../shared/ipc-channels'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({
    geminiApiKey: '',
    overlayPosition: { x: 0, y: 0 },
    overlayOpacity: 0.9,
    coachingEnabled: true,
    coachingIntervalSeconds: 60,
  })

  const loaded = ref(false)

  async function load() {
    settings.value = await window.electronAPI.settings.get()
    loaded.value = true
  }

  async function save(partial: Partial<AppSettings>) {
    Object.assign(settings.value, partial)
    await window.electronAPI.settings.set(partial)
  }

  return { settings, loaded, load, save }
})
