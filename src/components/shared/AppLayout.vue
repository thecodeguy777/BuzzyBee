<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="min-h-screen bg-base-200">
    <header class="bg-base-100 border-b border-base-300">
      <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <RouterLink to="/admin" class="text-lg font-semibold">BuzzyHive Admin</RouterLink>
        <nav class="flex gap-2">
          <RouterLink to="/" class="btn btn-ghost btn-sm">Landing</RouterLink>
          <RouterLink to="/admin" class="btn btn-ghost btn-sm">Dashboard</RouterLink>
        </nav>
      </div>
    </header>
    <main class="max-w-4xl mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>
