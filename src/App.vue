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
  return 'admin'
})
</script>

<template>
  <WorkstationLayout v-if="layout === 'workstation'">
    <router-view />
  </WorkstationLayout>
  <AppLayout v-else-if="layout === 'admin'">
    <router-view />
  </AppLayout>
  <router-view v-else />
</template>
