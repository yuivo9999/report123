<template>
  <div class="app-root">
    <router-view />
    <GlobalProgressBar v-if="showProgress" />
    <ToastContainer />
    <FixModal />
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores'
import GlobalProgressBar from '@/components/GlobalProgressBar.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import FixModal from '@/components/FixModal.vue'
import { confirmDialog, toast } from '@/utils/feedback'
import { offlineOps } from '@/utils/storage'
import { request } from '@/api/request'

const store = useAppStore()
const router = useRouter()
const route = useRoute()

// 全局进度条仅在看板与报告页底部展示
const showProgress = computed(() => ['dashboard', 'report'].includes(route.name))

// 集中状态树 active_tab 驱动路由跳转
watch(
  () => store.ui.active_tab,
  (tab) => {
    const map = { input: '/', dashboard: '/dashboard', report: '/report', settings: '/settings' }
    const target = map[tab]
    if (target && router.currentRoute.value.path !== target) {
      router.push(target)
    }
  }
)

let handlers = []

onMounted(async () => {
  // 启动断点续检
  await store.restoreLatest()

  // 认证错误 → 引导至设置页
  const onAuth = () => {
    toast('API Key无效或已过期，请重新设置', 'error')
    router.push('/settings')
  }
  // AI 不兼容 → 看板警告条
  const onIncompat = () => {
    store.ui.warning_banner = { type: 'incompat', msg: '当前AI配置可能不兼容，请检查设置' }
  }
  // 网络恢复 → 询问是否继续未完成操作
  const onOnline = async () => {
    const ops = offlineOps.list()
    if (ops.length === 0) return
    const ok = await confirmDialog({
      title: '网络已恢复',
      message: `检测到 ${ops.length} 个未完成的操作，是否继续？`,
      confirmText: '继续'
    })
    if (!ok) return
    for (const op of ops) {
      try {
        await request(op.method, op.url, { data: op.data, params: op.params })
      } catch { /* 单个失败继续 */ }
    }
    offlineOps.clear()
    toast('未完成操作已继续', 'info')
  }
  window.addEventListener('np:auth-error', onAuth)
  window.addEventListener('np:ai-incompatible', onIncompat)
  window.addEventListener('online', onOnline)
  handlers = [onAuth, onIncompat, onOnline]
})

onBeforeUnmount(() => {
  window.removeEventListener('np:auth-error', handlers[0])
  window.removeEventListener('np:ai-incompatible', handlers[1])
  window.removeEventListener('online', handlers[2])
})
</script>

<style scoped>
.app-root { min-height: 100vh; }
</style>
