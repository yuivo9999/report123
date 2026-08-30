<template>
  <div
    class="chapter-card"
    :class="{ 'card-checking': chapter.status === 'checking' }"
    @click="$emit('open', chapter.id)"
  >
    <div class="card-top">
      <span class="idx">{{ chapter.index }}</span>
      <span class="title">{{ chapter.title }}</span>
      <span class="status" :class="statusClass">
        <template v-if="chapter.status === 'checking'">检查中<span class="dots"></span></template>
        <template v-else-if="chapter.status === 'pending'">排队中</template>
        <template v-else-if="chapter.status === 'done'">
          <span v-if="chapter.error_count > 0">⚠️ {{ chapter.error_count }}处问题</span>
          <span v-else>✅ 通过</span>
        </template>
        <template v-else>{{ statusText }}</template>
      </span>
    </div>
    <div class="card-preview">{{ chapter.content_preview || '（本章暂无预览）' }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ chapter: { type: Object, required: true } })
defineEmits(['open'])

const statusText = computed(() => ({ idle: '待检查', error: '出错' })[props.chapter.status] || props.chapter.status)
const statusClass = computed(() => {
  if (props.chapter.status === 'checking') return 'st-checking'
  if (props.chapter.status === 'done' && props.chapter.error_count > 0) return 'st-warn'
  if (props.chapter.status === 'done') return 'st-ok'
  return 'st-pending'
})
</script>

<style scoped>
.chapter-card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 12px;
  margin-bottom: 8px;
  box-shadow: var(--shadow);
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: transform .1s;
}
.chapter-card:active { transform: scale(0.99); }
.card-top { display: flex; align-items: center; gap: 8px; }
.idx {
  width: 22px; height: 22px;
  border-radius: 6px;
  background: var(--theme-light);
  color: var(--theme);
  font-size: 12px;
  font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.title { flex: 1; font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { font-size: 12px; flex-shrink: 0; }
.st-checking { color: var(--theme); }
.st-warn { color: var(--warn); }
.st-ok { color: var(--ok); }
.st-pending { color: var(--text-2); }
.card-preview {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
