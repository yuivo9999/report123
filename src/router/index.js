import { createRouter, createWebHashHistory } from 'vue-router'
import { useAppStore } from '@/stores'

const routes = [
  { path: '/', name: 'input', component: () => import('@/views/InputView.vue'), meta: { title: '新建项目' } },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '校对看板' } },
  { path: '/report', name: 'report', component: () => import('@/views/ReportView.vue'), meta: { title: '校对报告' } },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: 'API设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  // 使用 hash 模式（/#/dashboard）：GitHub Pages 为纯静态托管，
  // 无服务端回退，hash 路由刷新不会 404，最适合 Pages 部署
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  const store = useAppStore()
  if (store.ui.active_tab !== to.name) store.ui.active_tab = to.name
})

export default router
