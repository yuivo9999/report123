<template>
  <Teleport to="body">
    <div v-if="store.ui.error_drawer_open" class="drawer-layer">
      <div class="drawer-mask"></div>
      <div class="drawer" :style="{ transform: drag ? `translateY(${drag}px)` : '' }" :class="{ dragging: drag }">
        <div class="drawer-handle"
          @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd"
          @mousedown="onMouseStart" @mousemove="onMouseMove" @mouseup="onMouseEnd"
        ></div>
        <div class="drawer-head">
          <div class="drawer-title">{{ chapter?.title }}</div>
          <div class="drawer-close" @click="store.closeDrawer()">▼</div>
        </div>

        <!-- 严重性标签页 -->
        <div class="tabs">
          <button v-for="t in tabs" :key="t.key" class="tab" :class="{ active: store.ui.drawer_tab === t.key }"
            @click="store.ui.drawer_tab = t.key">
            {{ t.label }}<span v-if="countOf(t.key) > 0" class="tab-n"> {{ countOf(t.key) }}</span>
          </button>
        </div>

        <div class="drawer-body">
          <div v-if="filteredErrors.length === 0" class="empty">该级别暂无错误</div>
          <div v-for="e in filteredErrors" :key="e.id" class="err-item" :class="{ fixed: e.fixed }">
            <div class="err-head">
              <span class="sev" :class="`sev-${e.severity}`">{{ sevLabel[e.severity] }}</span>
              <span class="tag" :class="`tag-${e.stage}`">{{ stageLabel[e.stage] }}</span>
              <span v-if="e.fixed" class="fixed-badge">已修复</span>
            </div>
            <div class="err-type">{{ e.type }}</div>
            <div class="err-orig">原文：{{ e.excerpt || '—' }}</div>
            <div v-if="e.suggestion" class="err-sug">建议：{{ e.suggestion }}</div>
            <button v-if="!e.fixed" class="btn btn-primary btn-fix" @click="store.openFixModal(chapter.id, e.id)">
              修复并复检
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores'

const store = useAppStore()
const sevLabel = { critical: '严重', major: '中等', minor: '轻微' }
const stageLabel = { struct: '结构', single: '单章', special: '专项' }
const tabs = [
  { key: 'critical', label: '严重' },
  { key: 'major', label: '中等' },
  { key: 'minor', label: '轻微' },
  { key: 'all', label: '全部' }
]

const chapter = computed(() => store.selectedChapter)
const errors = computed(() => chapter.value?.errors || [])
const countOf = (key) => key === 'all' ? errors.value.length : errors.value.filter((e) => e.severity === key).length
const filteredErrors = computed(() => {
  const k = store.ui.drawer_tab
  return k === 'all' ? errors.value : errors.value.filter((e) => e.severity === k)
})

/* 下拉关闭 */
const drag = ref(0)
let startY = 0
let dragging = false
const onTouchStart = (e) => { startY = e.touches[0].clientY; dragging = true }
const onTouchMove = (e) => {
  if (!dragging) return
  const dy = e.touches[0].clientY - startY
  drag.value = dy > 0 ? dy : 0
}
const onTouchEnd = () => {
  dragging = false
  if (drag.value > 90) store.closeDrawer()
  drag.value = 0
}
const onMouseStart = (e) => { startY = e.clientY; dragging = true }
const onMouseMove = (e) => { if (dragging) drag.value = Math.max(0, e.clientY - startY) }
const onMouseEnd = () => {
  dragging = false
  if (drag.value > 90) store.closeDrawer()
  drag.value = 0
}
</script>

<style scoped>
.drawer-layer { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.drawer-layer > * { pointer-events: auto; }
.drawer { position: fixed; left: 0; right: 0; bottom: 0; height: 70vh; background: #fff; border-radius: 18px 18px 0 0; z-index: 1001; display: flex; flex-direction: column; animation: drawerUp .28s cubic-bezier(.32,.72,.28,1); transition: transform .2s ease; }
.drawer.dragging { transition: none; }
@keyframes drawerUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.drawer-handle { width: 40px; height: 4px; border-radius: 2px; background: #d1d5db; margin: 10px auto 4px; touch-action: none; }
.drawer-head { display: flex; align-items: center; justify-content: center; position: relative; padding: 0 16px 8px; }
.drawer-title { font-weight: 600; font-size: 15px; max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.drawer-close { position: absolute; right: 16px; font-size: 14px; color: var(--text-2); padding: 6px; }
.tabs { display: flex; gap: 6px; padding: 0 16px 8px; border-bottom: 1px solid var(--border); }
.tab { flex: 1; padding: 6px 0; border-radius: 8px; font-size: 12px; color: var(--text-2); background: var(--bg); }
.tab.active { background: var(--theme-light); color: var(--theme); font-weight: 600; }
.tab-n { font-weight: 600; }
.drawer-body { flex: 1; overflow-y: auto; padding: 12px 16px calc(16px + var(--safe-bottom)); }
.empty { text-align: center; color: var(--text-2); padding: 40px 0; font-size: 13px; }
.err-item { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; background: #fff; }
.err-item.fixed { opacity: .6; background: #f9fafb; }
.err-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.sev { font-size: 11px; padding: 2px 8px; border-radius: 10px; color: #fff; }
.sev-critical { background: var(--danger); }
.sev-major { background: var(--warn); }
.sev-minor { background: #6b7280; }
.tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border); color: var(--text-2); }
.fixed-badge { font-size: 11px; color: var(--ok); margin-left: auto; }
.err-type { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.err-orig { font-size: 12px; color: var(--danger); line-height: 1.6; word-break: break-all; margin-bottom: 2px; }
.err-sug { font-size: 12px; color: var(--text-2); line-height: 1.6; margin-bottom: 6px; }
.btn-fix { padding: 6px 14px; font-size: 12px; }
</style>
