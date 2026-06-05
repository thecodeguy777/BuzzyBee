<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/shared/AppLayout.vue'
import WorkstationLayout from '@/components/shared/WorkstationLayout.vue'

const route = useRoute()

const layout = computed<'workstation' | 'admin' | 'bare'>(() => {
  const meta = route.meta as { bareLayout?: boolean; layout?: 'workstation' | 'admin' }
  if (meta.bareLayout) return 'bare'
  if (meta.layout === 'workstation') return 'workstation'
  if (meta.layout === 'admin') return 'admin'
  // Undetermined route (e.g. before the initial navigation resolves) → render
  // no chrome rather than flashing the admin layout.
  return 'bare'
})
</script>

<template>
  <WorkstationLayout v-if="layout === 'workstation'">
    <router-view v-slot="{ Component, route: r }">
      <transition name="page" mode="out-in">
        <component :is="Component" :key="r.path" />
      </transition>
    </router-view>
  </WorkstationLayout>
  <AppLayout v-else-if="layout === 'admin'">
    <router-view v-slot="{ Component, route: r }">
      <transition name="page" mode="out-in">
        <component :is="Component" :key="r.path" />
      </transition>
    </router-view>
  </AppLayout>
  <router-view v-else />
</template>
