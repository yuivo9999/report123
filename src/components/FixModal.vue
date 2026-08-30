<template>
  <Teleport to="body">
    <div v-if="chapter" class="modal-mask" @click.self="store.closeFixModal()">
      <div class="modal-box fix-box">
        <div class="fix-head">
          <div>
            <div class="fix-title">{{ chapter.title }}</div>
            <div class="fix-sub">{{ error?.type }} · {{ severityLabel }} · {{ stageLabel }}</div>
          </div>
          <button class="icon-btn" @click="store.closeFixModal()">✕</button>
        </div>

        <div class="field">
          <div class="label">原文引用</div>
          <div class="orig">{{ error?.excerpt || error?.desc || '—' }}</div>
        </div>

        <div class="field">
          <div class="label">错误说明</div>
          <div class="desc">{{ error?.desc }}</div>
        </div>

        <div class="field">
          <div class="label">修复建议（可编辑）</div>
          <textarea
            v-model="draft"
            rows="3"
            :placeholder="error?.suggestion || '请输入修正后的内容'"
            @input="autosave"
          ></textarea>
          <div class="draft-hint">{{ draftSaved ? '草稿已保存 ✓' : '' }}</div>
        </div>

        <div class="fix-actions">
          <button class="btn btn-ghost" @click="store.closeFixModal()">取消</button>
          <button class="btn btn-primary" :disabled="fixing" @click="submit">
            {{ fixing ? '复检中…' : '提交复检' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores'
import { storage } from '@/utils/storage'
import { debounce } from '@/utils/debounce'

const store = useAppStore()
const fixing = ref(false)
const draftSaved = ref(false)

const chapter = computed(() => store.fixChapter)
const error = computed(() => {
  if (!chapter.value) return null
  return chapter.value.errors?.find((e) => e.id === store.ui.fix_error_id) || null
})

const draft = ref('')
watch(
  [() => store.ui.fix_chapter_id, () => store.ui.fix_error_id],
  () => {
    draft.value = error.value?.suggestion || ''
    const saved = storage.get(`fix_draft_${chapter.value?.id}_${store.ui.fix_error_id}`)
    if (saved) draft.value = saved
    draftSaved.value = false
  },
  { immediate: true }
)

const autosave = debounce(() => {
  if (!chapter.value) return
  storage.set(`fix_draft_${chapter.value.id}_${store.ui.fix_error_id}`, draft.value)
  draftSaved.value = true
}, 500)

const severityLabel = { critical: '严重', major: '中等', minor: '轻微' }[error.value?.severity] || ''
const stageLabel = { struct: '结构', single: '单章', special: '专项' }[error.value?.stage] || ''

async function submit() {
  if (!chapter.value || !error.value) return
  fixing.value = true
  await store.fixAndRecheck(chapter.value.id, [error.value.id], draft.value)
  fixing.value = false
}
</script>

<style scoped>
.fix-box { max-height: 86vh; overflow-y: auto; }
.fix-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.fix-title { font-weight: 600; font-size: 15px; }
.fix-sub { font-size: 12px; color: var(--text-2); margin-top: 2px; }
.field { margin-bottom: 12px; }
.label { font-size: 12px; color: var(--text-2); margin-bottom: 4px; }
.orig {
  background: var(--bg);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--danger);
  word-break: break-all;
  line-height: 1.6;
}
.desc { font-size: 13px; color: var(--text); line-height: 1.6; }
textarea { width: 100%; resize: none; line-height: 1.6; }
.draft-hint { font-size: 11px; color: var(--ok); margin-top: 4px; min-height: 14px; }
.fix-actions { display: flex; gap: 10px; justify-content: flex-end; }
</style>
