import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

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
    path: '/industries/:slug',
    name: 'industry-page',
    component: () => import('@/views/shared/IndustryPage.vue'),
    props: true,
    meta: { requiresAuth: false, bareLayout: true }
  },
  {
    path: '/bundles/:slug',
    name: 'bundle-page',
    component: () => import('@/views/shared/BundlePage.vue'),
    props: true,
    meta: { requiresAuth: false, bareLayout: true }
  },
  {
    path: '/services/:slug',
    name: 'service-page',
    component: () => import('@/views/shared/ServicePage.vue'),
    props: true,
    meta: { requiresAuth: false, bareLayout: true }
  },
  {
    path: '/who-we-serve',
    name: 'who-we-serve-overview',
    redirect: { name: 'industry-page', params: { slug: 'real-estate' } }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/workstation/LoginView.vue'),
    meta: { requiresAuth: false, bareLayout: true }
  },
  {
    path: '/meet/:token',
    name: 'meeting-room',
    component: () => import('@/views/shared/MeetingRoom.vue'),
    props: true,
    meta: { requiresAuth: false, bareLayout: true }
  },
  {
    path: '/app',
    name: 'workstation-home',
    component: () => import('@/views/workstation/HomeView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/profile',
    name: 'workstation-profile',
    component: () => import('@/views/workstation/ProfileView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/clients',
    name: 'workstation-clients',
    component: () => import('@/views/workstation/ClientsView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/time',
    name: 'workstation-time',
    component: () => import('@/views/workstation/TimeView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/tasks',
    name: 'workstation-tasks',
    component: () => import('@/views/workstation/TasksView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/my-tasks',
    name: 'workstation-my-tasks',
    component: () => import('@/views/workstation/MyTasksView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/inbox',
    name: 'workstation-inbox',
    component: () => import('@/views/workstation/InboxView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/comms',
    name: 'workstation-comms',
    component: () => import('@/views/workstation/CommsView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/messages',
    name: 'workstation-messages',
    component: () => import('@/views/workstation/MessagesView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/crm',
    name: 'workstation-crm',
    component: () => import('@/views/workstation/CrmView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/tickets',
    name: 'workstation-tickets',
    component: () => import('@/views/workstation/TicketsView.vue'),
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/app/team/:vaId?',
    name: 'workstation-team',
    component: () => import('@/views/workstation/TeamView.vue'),
    props: true,
    meta: { requiresAuth: true, layout: 'workstation' }
  },
  {
    path: '/admin',
    name: 'dashboard',
    component: () => import('@/views/admin/Dashboard.vue'),
    meta: { requiresAuth: true, layout: 'admin' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'workstation-home' }
  }
})

export default router
