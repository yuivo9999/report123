<template>
  <div class="input-page">
    <!-- 顶部输入区（占屏高 1/3） -->
    <div class="input-area">
      <button class="file-btn" :class="{ disabled: textContent }" @click="pickFile">
        <span class="file-icon">📄</span>
        <span class="file-text">{{ file ? file.name : '选择文件' }}</span>
        <span class="file-ok" v-if="file">✓</span>
      </button>
      <div class="text-area-wrap">
        <textarea
          v-model="textContent"
          :disabled="!!file"
          class="text-input"
          placeholder="或在此粘贴/输入小说全文"
        ></textarea>
        <Transition name="fade">
          <div v-if="file && textContent" class="mutex-hint">已选择文件，文字内容将被忽略</div>
        </Transition>
      </div>
      <input ref="fileInput" type="file" accept=".txt,.docx" hidden @change="onFileChange" />
    </div>

    <div class="body-hint">
      <div class="sample">
        <div class="sample-title">没有小说？试试示例</div>
        <button class="btn btn-ghost" @click="loadSample">加载示例《剑起苍澜》</button>
      </div>
    </div>

    <!-- 右下角加号按钮 -->
    <button class="fab" :class="{ loading: store.submitting }" @click="submit" :disabled="store.submitting">
      <span v-if="store.submitting" class="spinner"></span>
      <span v-else class="plus">＋</span>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores'
import { toast } from '@/utils/feedback'
import { SAMPLE_CHAPTERS, SAMPLE_TITLE } from '@/api/sample'
import { storage } from '@/utils/storage'

const store = useAppStore()
const router = useRouter()
const fileInput = ref(null)
const file = ref(null)
const textContent = ref('')

onMounted(() => {
  // 恢复上次文字草稿
  const draft = storage.get('input_draft')
  if (draft) textContent.value = draft
})

function pickFile() {
  if (textContent.value) {
    toast('输入文字后请清除文字以选择文件，提交优先使用文件', 'info')
    return
  }
  fileInput.value.click()
}

function onFileChange(e) {
  const f = e.target.files && e.target.files[0]
  if (!f) return
  const ext = f.name.split('.').pop().toLowerCase()
  if (!['txt', 'docx'].includes(ext)) {
    toast('仅支持TXT和DOCX格式', 'warn')
    e.target.value = ''
    return
  }
  file.value = f
  textContent.value = ''
  storage.remove('input_draft')
  toast(`已选择文件：${f.name}`, 'info')
}

function loadSample() {
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
  textContent.value = `《${SAMPLE_TITLE}》\n\n` + SAMPLE_CHAPTERS.map((c) => `${c.title}\n${c.content}`).join('\n\n')
  storage.set('input_draft', textContent.value)
  toast('已加载示例小说，点击右下角＋开始校对', 'info')
}

function submit() {
  if (store.submitting) return
  // 互斥：优先取文件
  if (file.value) {
    store.submitContent({ file: file.value, fullText: '' }).then((ok) => {
      if (ok) {
        file.value = null
        if (fileInput.value) fileInput.value.value = ''
        storage.remove('input_draft')
      }
    })
  } else if (textContent.value.trim()) {
    storage.set('input_draft', textContent.value)
    store.submitContent({ file: null, fullText: textContent.value })
  } else {
    toast('请上传文件或输入文字内容', 'warn')
  }
}
</script>

<style scoped>
.input-page { min-height: 100vh; position: relative; padding-bottom: 120px; }

.input-area {
  height: 33.33vh;
  min-height: 220px;
  background: #eceff3;
  display: flex;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.file-btn {
  width: 42%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed #b6c2d4;
  border-radius: var(--radius);
  background: #fff;
  color: var(--text-2);
  font-size: 13px;
  transition: all .2s;
  position: relative;
  padding: 8px;
  word-break: break-all;
}
.file-btn:active { background: var(--theme-light); }
.file-btn.disabled { opacity: .55; }
.file-icon { font-size: 28px; }
.file-ok {
  position: absolute;
  top: 6px; right: 6px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--ok);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.text-area-wrap { flex: 1; display: flex; flex-direction: column; position: relative; }
.text-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  line-height: 1.7;
  background: #fff;
}
.text-input:disabled { opacity: .55; }
.mutex-hint {
  position: absolute;
  top: -26px; left: 0; right: 0;
  text-align: center;
  font-size: 11px;
  color: var(--warn);
}

.body-hint { padding: 20px 16px; }
.sample { text-align: center; }
.sample-title { font-size: 13px; color: var(--text-2); margin-bottom: 10px; }

/* 加号按钮 */
.fab {
  position: fixed;
  right: 20px;
  bottom: calc(var(--progress-h) + 24px + var(--safe-bottom));
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--theme);
  color: #fff;
  box-shadow: 0 6px 18px rgba(31, 111, 235, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 800;
  transition: transform .1s;
}
.fab:active { transform: scale(0.94); }
.plus { font-size: 30px; line-height: 1; }
.spinner {
  width: 24px; height: 24px;
  border: 3px solid rgba(255,255,255,.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
