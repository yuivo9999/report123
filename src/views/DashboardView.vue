<template>
  <div class="page">
    <header class="topbar">
      <div class="side">
        <button class="icon-btn" @click="goNew">＋</button>
      </div>
      <div class="title">{{ store.project.file_name || '校对看板' }}</div>
      <div class="side right">
        <button class="icon-btn" @click="goReport">📊</button>
        <button class="icon-btn" @click="goSettings">⚙️</button>
      </div>
    </header>

    <!-- AI 不兼容警告条 -->
    <div v-if="store.ui.warning_banner" class="banner banner-warn">
      <span>{{ store.ui.warning_banner.msg }}</span>
      <button @click="goSettings">去设置</button>
    </div>

    <div class="banner banner-ok" v-else-if="store.project.status === 'done'">
      <span>三阶段校对完成，共发现问题 {{ store.final_report?.total ?? 0 }} 处</span>
      <button @click="goReport">查看报告</button>
    </div>

    <!-- 章节列表（虚拟滚动） -->
    <div class="chapter-scroll">
      <RecycleScroller
        v-if="store.chapters.length"
        class="scroller"
        :items="store.chapters"
        :item-size="104"
        key-field="id"
      >
        <template #default="{ item }">
          <ChapterCard :chapter="item" @open="openChapter" />
        </template>
      </RecycleScroller>
      <div v-else class="empty">
        <p>暂无章节</p>
        <button class="btn btn-primary" @click="goNew">新建项目</button>
      </div>
    </div>

    <ErrorDrawer />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useAppStore } from '@/stores'
import ChapterCard from '@/components/ChapterCard.vue'
import ErrorDrawer from '@/components/ErrorDrawer.vue'

const store = useAppStore()
const router = useRouter()

const goNew = () => { store.stopPolling(); router.push('/') }
const goSettings = () => router.push('/settings')
const goReport = () => router.push('/report')
const openChapter = (id) => store.openDrawer(id)

// 三阶段全部完成自动跳转报告
const unwatch = watch(
  () => [store.pipeline.struct, store.pipeline.special],
  ([struct, special]) => {
    if (struct === 'done' && special === 'done') {
      store.buildReport()
      setTimeout(() => router.push('/report'), 600)
    }
  }
)

onMounted(async () => {
  // 若 store 尚未有项目，恢复断点
  if (!store.project.id) {
    await store.restoreLatest()
  }
  if (store.project.status === 'done' && store.ui.active_tab === 'dashboard') {
    store.buildReport()
  }
})

onBeforeUnmount(() => unwatch())
</script>

<style scoped>
.page { min-height: 100vh; padding-top: 48px; padding-bottom: calc(var(--progress-h) + var(--safe-bottom) + 16px); }
.topbar { position: fixed; top: 0; left: 0; right: 0; }
.topbar .right { display: flex; gap: 0; }
.chapter-scroll { padding: 4px 12px 0; }
.scroller { height: calc(100vh - 48px - var(--progress-h) - 24px); overflow-y: auto; }
.empty { text-align: center; padding: 80px 0; color: var(--text-2); }
</style>
