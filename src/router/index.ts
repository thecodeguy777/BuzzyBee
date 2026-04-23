import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/shared/LandingPage.vue'),
    meta: { requiresAuth: false, bareLayout: true }
  },
  {
    path: '/assets',
    name: 'assets',
    component: () => import('@/views/shared/AssetsPreview.vue'),
    meta: { requiresAuth: false, bareLayout: true }
  },
  {
    path: '/admin',
    name: 'dashboard',
    component: () => import('@/views/admin/Dashboard.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
