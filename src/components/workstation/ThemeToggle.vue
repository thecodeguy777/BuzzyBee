<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'

const { theme, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    class="w-9 h-9 rounded-lg flex items-center justify-center text-base-content/60 hover:bg-base-200 transition-colors"
    :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    :title="theme === 'dark' ? 'Light mode' : 'Dark mode'"
    @click="toggle"
  >
    <Sun v-if="theme === 'dark'" class="w-4 h-4" :stroke-width="1.75" />
    <Moon v-else class="w-4 h-4" :stroke-width="1.75" />
  </button>
</template>
