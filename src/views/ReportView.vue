<template>
  <div class="page">
    <header class="topbar">
      <div class="side">
        <button class="icon-btn" @click="router.push('/dashboard')">←</button>
      </div>
      <div class="title">校对报告</div>
      <div class="side right">
        <button class="icon-btn" @click="router.push('/settings')">⚙️</button>
      </div>
    </header>

    <div class="report-body">
      <!-- 汇总卡片 -->
      <div class="summary card">
        <div class="summary-stages">
          <div class="s-item"><span class="dot" style="background:var(--stage-struct)"></span>结构 <b>{{ r.byStage.struct }}</b></div>
          <div class="s-item"><span class="dot" style="background:var(--stage-single)"></span>单章 <b>{{ r.byStage.single }}</b></div>
          <div class="s-item"><span class="dot" style="background:var(--stage-special)"></span>专项 <b>{{ r.byStage.special }}</b></div>
        </div>
        <div class="summary-fix">
          <div class="fix-rate">修复率 <b>{{ r.fixRate }}%</b></div>
          <div class="fix-bar"><div class="fix-fill" :style="{ width: r.fixRate + '%' }"></div></div>
          <div class="fix-num">已修复 {{ r.fixed }} / {{ r.total }}</div>
        </div>
      </div>

      <!-- 筛选 + CSV 导出 -->
      <div class="toolbar">
        <select v-model="filter" class="filter">
          <option value="all">全部</option>
          <option value="struct">结构</option>
          <option value="single">单章</option>
          <option value="special">专项</option>
        </select>
        <button class="btn btn-ghost" @click="exportCsv">导出错误报告CSV</button>
      </div>

      <!-- 错误列表（按严重性降序） -->
      <div class="err-list">
        <div v-for="row in sortedRows" :key="row.error.id" class="row card" :class="{ fixed: row.error.fixed }">
          <div class="row-head">
            <span class="sev" :class="`sev-${row.error.severity}`">{{ sevLabel[row.error.severity] }}</span>
            <span class="row-title">{{ row.chapterTitle }} · {{ row.error.type }}</span>
          </div>
          <div class="row-orig">原文：{{ row.error.excerpt || row.error.desc || '—' }}</div>
          <div v-if="row.error.suggestion" class="row-sug">建议：{{ row.error.suggestion }}</div>
          <div class="row-foot">
            <span class="status" :class="row.error.fixed ? 'st-fixed' : 'st-open'">{{ row.error.fixed ? '已修复' : '待修复' }}</span>
            <button v-if="!row.error.fixed" class="btn btn-primary small" @click="store.openFixModal(row.chapterId, row.error.id)">去修改</button>
          </div>
        </div>
        <div v-if="sortedRows.length === 0" class="empty">该分类下暂无错误 🎉</div>
      </div>
    </div>

    <!-- 底部固定导出区 -->
    <div class="bottom-area">
      <template v-if="r.deliverable">
        <button class="btn btn-success deliver-btn" @click="finalize">✅ 标记为可交付</button>
      </template>
      <div class="export-btns">
        <button class="btn btn-ghost" @click="store.exportProject('txt')">导出TXT</button>
        <button class="btn btn-primary" @click="store.exportProject('docx')">导出DOCX</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores'
import { triggerDownload } from '@/utils/download'
import { toast } from '@/utils/feedback'

const store = useAppStore()
const router = useRouter()
const filter = ref('all')
const sevLabel = { critical: '严重', major: '中等', minor: '轻微' }
const sevOrder = { critical: 0, major: 1, minor: 2 }

const r = computed(() => store.buildReport())

const rows = computed(() => {
  const list = []
  for (const ch of store.chapters) {
    for (const e of ch.errors || []) {
      list.push({ chapterId: ch.id, chapterTitle: ch.title, error: e })
    }
  }
  return list
})

const sortedRows = computed(() => {
  let arr = rows.value.filter((x) => filter.value === 'all' || x.error.stage === filter.value)
  arr.sort((a, b) => {
    const sa = sevOrder[a.error.severity] - sevOrder[b.error.severity]
    if (sa !== 0) return sa
    return String(a.chapterTitle).localeCompare(String(b.chapterTitle), 'zh')
  })
  return arr
})

function exportCsv() {
  const header = ['章节号', '错误类型', '严重性', '阶段', '原文片段', '建议修改', '状态']
  const lines = [header.join(',')]
  for (const x of sortedRows.value) {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    lines.push([
      esc(x.chapterTitle),
      esc(x.error.type),
      esc(sevLabel[x.error.severity]),
      esc(x.error.stage),
      esc(x.error.excerpt),
      esc(x.error.suggestion),
      esc(x.error.fixed ? '已修复' : '待修复')
    ].join(','))
  }
  const csv = '\ufeff' + lines.join('\n')
  const name = (store.project.file_name || '小说').replace(/\.(txt|docx)$/i, '')
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}_错误报告.csv`, 'text/csv;charset=utf-8')
  toast('错误报告已导出', 'info')
}

async function finalize() {
  const ok = await store.finalize()
  if (ok) router.push('/')
}

onMounted(() => {
  store.buildReport()
})
</script>

<style scoped>
.page { min-height: 100vh; padding-top: 48px; padding-bottom: 170px; }
.topbar .right { display: flex; }
.report-body { padding: 12px; }
.card { background: #fff; border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px; margin-bottom: 10px; }

.summary { display: flex; flex-direction: column; gap: 12px; }
.summary-stages { display: flex; gap: 12px; }
.s-item { flex: 1; background: var(--bg); border-radius: 10px; padding: 10px 8px; text-align: center; font-size: 12px; color: var(--text-2); }
.s-item b { display: block; font-size: 20px; color: var(--text); margin-top: 2px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: 1px; }
.summary-fix { display: flex; align-items: center; gap: 10px; }
.fix-rate { font-size: 13px; white-space: nowrap; }
.fix-rate b { font-size: 18px; color: var(--theme); }
.fix-bar { flex: 1; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.fix-fill { height: 100%; background: linear-gradient(90deg, var(--stage-single), #4ade80); border-radius: 4px; transition: width .4s; }
.fix-num { font-size: 12px; color: var(--text-2); white-space: nowrap; }

.toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
.filter { flex: 1; }

.row .sev { font-size: 11px; padding: 2px 8px; border-radius: 10px; color: #fff; }
.sev-critical { background: var(--danger); }
.sev-major { background: var(--warn); }
.sev-minor { background: #6b7280; }
.row-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.row-title { font-weight: 600; font-size: 13px; flex: 1; }
.row-orig { font-size: 12px; color: var(--danger); line-height: 1.6; word-break: break-all; margin-bottom: 2px; }
.row-sug { font-size: 12px; color: var(--text-2); line-height: 1.6; margin-bottom: 6px; }
.row-foot { display: flex; align-items: center; justify-content: space-between; }
.status { font-size: 12px; }
.st-fixed { color: var(--ok); }
.st-open { color: var(--warn); }
.btn.small { padding: 5px 12px; font-size: 12px; }
.row.fixed { opacity: .6; background: #f9fafb; }
.empty { text-align: center; color: var(--text-2); padding: 30px 0; font-size: 13px; }

.bottom-area {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  padding: 10px 12px calc(10px + var(--safe-bottom));
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(6px);
  border-top: 1px solid var(--border);
  z-index: 800;
}
.export-btns { display: flex; gap: 8px; }
.export-btns .btn { flex: 1; }
.deliver-btn { width: 100%; padding: 14px; font-size: 15px; margin-bottom: 10px; box-shadow: 0 4px 16px rgba(22,163,74,.35); }
</style>
