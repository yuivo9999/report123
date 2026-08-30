<template>
  <div class="progress-bar" :class="{ 'has-project': !!store.project.id }">
    <div class="segments" @click="toggleDetail">
      <div class="seg">
        <div class="fill fill-struct" :class="{ running: store.pipeline.struct === 'running' }" :style="{ width: structFill }"></div>
      </div>
      <div class="arrow">›</div>
      <div class="seg">
        <div class="fill fill-single" :class="{ running: store.pipeline.single && store.pipeline.single.progress > 0 && store.pipeline.single.progress < 100 }" :style="{ width: singleFill }"></div>
      </div>
      <div class="arrow">›</div>
      <div class="seg">
        <div class="fill fill-special" :class="{ running: store.pipeline.special === 'running' }" :style="{ width: specialFill }"></div>
      </div>
    </div>
    <div class="stage-text">{{ stageText }}</div>
    <Transition name="fade">
      <div v-if="detailOpen" class="detail-pop">
        <div><span class="dot" style="background:var(--stage-struct)"></span>结构检查：{{ stageState(store.pipeline.struct) }}</div>
        <div><span class="dot" style="background:var(--stage-single)"></span>单章检查：{{ store.pipeline.single.current_index }}/{{ store.pipeline.single.total }}（{{ store.pipeline.single.progress }}%）</div>
        <div><span class="dot" style="background:var(--stage-special)"></span>专项检查：{{ stageState(store.pipeline.special) }}</div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores'

const store = useAppStore()
const detailOpen = ref(false)
const toggleDetail = () => { detailOpen.value = !detailOpen.value }

const stageState = (s) => ({ idle: '待开始', running: '进行中', done: '已完成', error: '出错' }[s] || s)

const structFill = computed(() => {
  const s = store.pipeline.struct
  if (s === 'done') return '100%'
  if (s === 'running') return '45%'
  return '0%'
})
const singleFill = computed(() => `${store.pipeline.single.progress}%`)
const specialFill = computed(() => {
  const s = store.pipeline.special
  if (s === 'done') return '100%'
  if (s === 'running') return '40%'
  return '0%'
})

const stageText = computed(() => {
  const p = store.pipeline
  if (p.struct === 'running') return '结构检查中…'
  if (p.struct === 'done' && p.special === 'idle') return `单章检查 ${p.single.current_index}/${p.single.total}`
  if (p.special === 'running') return '专项检查中…'
  if (p.struct === 'done' && p.special === 'done') return '全部完成 ✓'
  if (store.project.id) return '等待启动'
  return ''
})
</script>

<style scoped>
.progress-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: var(--progress-h);
  background: rgba(17, 24, 39, 0.88);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px calc(env(safe-area-inset-bottom, 0px) / 2);
  z-index: 900;
  color: #fff;
  font-size: 12px;
}
.progress-bar:not(.has-project) { display: none; }
.segments {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  height: 18px;
}
.seg {
  flex: 1;
  position: relative;
  height: 18px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
}
.fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
  position: relative;
}
.fill.running::after {
  content: '';
  position: absolute; inset: 0;
  background: repeating-linear-gradient(45deg, rgba(255,255,255,.22) 0 6px, transparent 6px 12px);
  animation: stripes 1s linear infinite;
}
@keyframes stripes { to { background-position: 17px 0; } }
.fill-struct { background: var(--stage-struct); }
.fill-single { background: var(--stage-single); }
.fill-special { background: var(--stage-special); }
.arrow { color: rgba(255, 255, 255, 0.5); font-size: 12px; flex-shrink: 0; }
.stage-text { min-width: 86px; text-align: right; white-space: nowrap; }
.detail-pop {
  position: fixed;
  bottom: calc(var(--progress-h) + 8px);
  right: 12px;
  background: rgba(17, 24, 39, 0.95);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.9;
  box-shadow: 0 4px 16px rgba(0,0,0,.3);
}
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
