/**
 * Mock 后端适配层
 * 模拟真实后端行为，使前端无需后端即可全流程演示：
 * - 章节拆分、三阶段串行流水线（结构/单章/专项）与实时进度
 * - 断点续检：流水线状态持久化到 localStorage，页面重载后自动续跑
 * - 错误码模拟：1001（AI不兼容）/ 401（API Key无效）/ 40001（未激活模型）
 * - 导出 TXT / DOCX（真实文件）
 */
import JSZip from 'jszip'
import { SAMPLE_CHAPTERS, SAMPLE_TITLE } from './sample'
import { storage } from '@/utils/storage'

const STORE_KEY = 'mock_backend'

/* ============ 规则引擎 ============ */
const RULES = [
  // 结构类（stage: struct）
  { stage: 'struct', severity: 'critical', type: '章节标题缺失', check: (ch) => !/第\s*[0-9一二三四五六七八九十百千]+\s*章/.test(ch.title), desc: '章节标题不符合“第X章”规范' },
  { stage: 'struct', severity: 'major', type: '章节过短', check: (ch) => ch.content.trim().length < 200, desc: '章节内容过短，疑似内容不完整' },
  { stage: 'struct', severity: 'major', type: '结尾标点缺失', check: (ch) => /[\u4e00-\u9fa5）】"]$/.test(ch.content.trim()), desc: '章节结尾缺少句号/感叹号/问号' },
  // 单章类（stage: single）错别字/标点
  { stage: 'single', severity: 'critical', type: '错别字', pattern: /以经/g, suggestion: '已经', desc: '常见错别字，应为“已经”' },
  { stage: 'single', severity: 'major', type: '错别字', pattern: /时后/g, suggestion: '时候', desc: '常见错别字，应为“时候”' },
  { stage: 'single', severity: 'critical', type: '错别字', pattern: /知到/g, suggestion: '知道', desc: '常见错别字，应为“知道”' },
  { stage: 'single', severity: 'major', type: '错别字', pattern: /什莫/g, suggestion: '什么', desc: '常见错别字，应为“什么”' },
  { stage: 'single', severity: 'major', type: '错别字', pattern: /应为/g, suggestion: '因为', desc: '语境中应为“因为”' },
  { stage: 'single', severity: 'major', type: '错别字', pattern: /竞然/g, suggestion: '竟然', desc: '常见错别字，应为“竟然”' },
  { stage: 'single', severity: 'minor', type: '错别字', pattern: /须要/g, suggestion: '需要', desc: '常见错别字，应为“需要”' },
  { stage: 'single', severity: 'minor', type: '错别字', pattern: /毕竞/g, suggestion: '毕竟', desc: '常见错别字，应为“毕竟”' },
  { stage: 'single', severity: 'minor', type: '错别字', pattern: /彷佛/g, suggestion: '仿佛', desc: '常见错别字，应为“仿佛”' },
  { stage: 'single', severity: 'major', type: '重复赘述', pattern: /他他/g, suggestion: '他', desc: '字词重复' },
  { stage: 'single', severity: 'minor', type: '标点错误', pattern: /。。/g, suggestion: '。', desc: '连续句号重复' },
  { stage: 'single', severity: 'minor', type: '标点错误', pattern: /，,/g, suggestion: '，', desc: '中英文标点混用' },
  // 专项类（stage: special）人称/逻辑/时态
  { stage: 'special', severity: 'critical', type: '逻辑矛盾', pattern: /天亮了，[^。]*月光/g, suggestion: '', desc: '前后场景矛盾：天已亮却写月光', logic: true },
  { stage: 'special', severity: 'major', type: '人称混乱', pattern: /他对自己说[^。]*你/g, suggestion: '', desc: '人称代词混乱（他/你混用）', logic: true },
  { stage: 'special', severity: 'major', type: '用词不当', pattern: /竟然.*竟/g, suggestion: '', desc: '“竟然/竟”连用略显重复', logic: true },
  { stage: 'special', severity: 'minor', type: '口语化', pattern: /就那么简单/g, suggestion: '', desc: '行文偏口语化，可调整书面表达', logic: true }
]

let idSeed = 1
const nextId = () => `id_${idSeed++}_${Date.now().toString(36)}`

/* ============ Mock 存储（持久化到 localStorage） ============ */
function defaultSettings() {
  return {
    groups: [
      {
        id: 'g_default',
        name: '默认组',
        models: [
          { id: 'm_deepseek', name: 'DeepSeek-R1', api_key: 'sk-mock-deepseek-123', temperature: 0.3, enabled: true },
          { id: 'm_gpt', name: 'GPT-4o', api_key: '', temperature: 0.5, enabled: true }
        ]
      }
    ],
    active_group_id: 'g_default',
    active_model_id: 'm_deepseek'
  }
}

function createStore() {
  const s = {
    project: null,
    chapters: [],
    pipeline: { struct: 'idle', single: { current_index: 0, total: 0, progress: 0 }, special: 'idle' },
    settings: defaultSettings(),
    finalized: false,
    _timer: null,
    _queue: null
  }
  return s
}

let store = createStore()
function persist() {
  const { _timer, _queue, ...rest } = store
  storage.set(STORE_KEY, {
    ...rest,
    pipelineRunning: isPipelineRunning(),
    singlePos: store.singlePos || null
  })
}
function hydrate() {
  const saved = storage.get(STORE_KEY)
  if (saved) {
    store.project = saved.project
    store.chapters = saved.chapters
    store.pipeline = saved.pipeline
    store.settings = saved.settings
    store.finalized = saved.finalized
    store.singlePos = saved.singlePos
    // 若上次流水线仍在运行，标记待续跑
    if (saved.pipelineRunning) {
      store._resumePending = true
    }
  }
}
hydrate()

function isPipelineRunning() {
  return store.pipeline.struct === 'running' ||
    (store.pipeline.single && store.pipeline.single.progress > 0 && store.pipeline.single.progress < store.pipeline.single.total) ||
    store.pipeline.special === 'running'
}

/* ============ 章节拆分 ============ */
function splitChapters(fullText) {
  const titleMatch = fullText.match(/^\s*(《?[^《\n]{1,30}》?)\s*(\n|$)/)
  const bookTitle = titleMatch ? titleMatch[1].trim() : '未命名小说'
  const titleLine = titleMatch ? titleMatch[0] : ''
  const body = fullText.replace(titleLine, '')
  const parts = body.split(/(?=第\s*[0-9一二三四五六七八九十百千]+\s*章)/).filter((s) => s.trim())
  if (parts.length === 0) {
    return { bookTitle, chapters: [{ title: '第1章', content: fullText.trim() }] }
  }
  const chapters = parts.map((p, i) => {
    const m = p.match(/^(第\s*[0-9一二三四五六七八九十百千]+\s*章[^\n]*)/)
    const title = m ? m[1].trim() : `第${i + 1}章`
    const content = p.replace(/^第\s*[0-9一二三四五六七八九十百千]+\s*章[^\n]*\n/, '').trim()
    return { title, content }
  })
  return { bookTitle, chapters }
}

/* ============ 校对规则扫描 ============ */
function scanChapter(ch, stageOnly = null) {
  const errors = []
  const content = ch.content
  for (const rule of RULES) {
    if (stageOnly && rule.stage !== stageOnly) continue
    if (rule.pattern) {
      const re = new RegExp(rule.pattern.source, 'g')
      let m
      while ((m = re.exec(content)) !== null) {
        const start = Math.max(0, m.index - 12)
        const excerpt = content.slice(start, m.index + m[0].length + 12)
        errors.push({
          id: nextId(),
          severity: rule.severity,
          type: rule.type,
          stage: rule.stage,
          original: m[0],
          suggestion: rule.suggestion || '',
          excerpt,
          desc: rule.desc,
          fixed: false
        })
        if (re.lastIndex === m.index) re.lastIndex++
      }
    } else if (rule.check && rule.check(ch)) {
      errors.push({
        id: nextId(),
        severity: rule.severity,
        type: rule.type,
        stage: rule.stage,
        original: '',
        suggestion: '',
        excerpt: content.slice(0, 60),
        desc: rule.desc,
        fixed: false
      })
    }
  }
  return errors
}

function chapterErrorCount(errors) {
  return errors.filter((e) => !e.fixed).length
}

/* ============ 流水线模拟 ============ */
function activeModel() {
  const s = store.settings
  const group = s.groups.find((g) => g.id === s.active_group_id) || s.groups[0]
  const model = (group?.models || []).find((m) => m.id === s.active_model_id) || (group?.models || []).find((m) => m.enabled)
  return { group, model }
}

function checkModelHealth() {
  const { model } = activeModel()
  if (!model || !model.enabled) return { code: 40001, msg: '请先在设置中激活一个模型' }
  if (!model.api_key) return { code: 40001, msg: 'API Key不能为空，请到设置中配置' }
  if (model.api_key.startsWith('invalid')) return { code: 401, msg: 'API Key无效或已过期' }
  if (/不兼容|incompat/i.test(model.name)) return { code: 1001, msg: '当前AI配置可能不兼容' }
  return null
}

function startPipeline() {
  if (store._timer) return
  const chapters = store.chapters
  store.pipeline = {
    struct: 'running',
    single: { current_index: 0, total: chapters.length, progress: 0 },
    special: 'idle'
  }
  store.singlePos = null
  for (const ch of chapters) {
    ch.status = 'pending'
    ch.error_count = 0
    ch.errors = []
  }
  persist()

  const tickMs = 650
  store._timer = setInterval(() => {
    const p = store.pipeline
    if (p.struct === 'running') {
      const ch = chapters[store.structIndex = (store.structIndex || 0)]
      if (ch) {
        ch.status = 'checking'
        const errs = scanChapter(ch, 'struct')
        setTimeout(() => {
          ch.status = 'done'
          ch.errors = errs
          ch.error_count = chapterErrorCount(errs)
          if (errs.length) vibrateError()
          else vibrateChapterDone()
          store.structIndex++
          if (store.structIndex >= chapters.length) {
            p.struct = 'done'
            p.single = { current_index: 0, total: chapters.length, progress: 0 }
            persist()
          } else {
            persist()
          }
        }, tickMs * 0.7)
      }
      return
    }
    if (p.single && p.single.current_index < p.single.total) {
      const idx = p.single.current_index
      const ch = chapters[idx]
      if (ch) {
        ch.status = 'checking'
        const errs = scanChapter(ch, 'single')
        setTimeout(() => {
          ch.status = 'done'
          ch.errors = (ch.errors || []).concat(errs)
          ch.error_count = chapterErrorCount(ch.errors)
          if (errs.length) vibrateError()
          else vibrateChapterDone()
          p.single.current_index++
          p.single.progress = Math.round((p.single.current_index / p.single.total) * 100)
          store.singlePos = p.single.current_index
          if (p.single.current_index >= p.single.total) {
            p.special = 'running'
          }
          persist()
        }, tickMs * 0.8)
      }
      return
    }
    if (p.special === 'running') {
      const ch = chapters[store.specialIndex = (store.specialIndex || 0)]
      if (ch) {
        ch.status = 'checking'
        const errs = scanChapter(ch, 'special')
        setTimeout(() => {
          ch.status = 'done'
          ch.errors = (ch.errors || []).concat(errs)
          ch.error_count = chapterErrorCount(ch.errors)
          if (errs.length) vibrateError()
          else vibrateChapterDone()
          store.specialIndex++
          if (store.specialIndex >= chapters.length) {
            p.special = 'done'
            store.project.status = 'done'
            store.singlePos = null
            stopTimer()
            emitProjectDone()
          }
          persist()
        }, tickMs * 0.6)
      }
      return
    }
    // 全部完成
    stopTimer()
  }, tickMs)
}

function stopTimer() {
  if (store._timer) {
    clearInterval(store._timer)
    store._timer = null
  }
  store.structIndex = 0
  store.specialIndex = 0
}

function resumeIfNeeded() {
  if (store._resumePending && isPipelineRunning()) {
    store._resumePending = false
    // 续跑：从保存位置继续单章进度
    if (store.singlePos) {
      store.pipeline.single.current_index = store.singlePos
    }
    startPipeline()
  }
}

const listeners = new Set()
function emitProjectDone() {
  listeners.forEach((fn) => fn(store.project))
}
export function onProjectDone(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function vibrateError() { try { navigator.vibrate && navigator.vibrate([30, 50, 30]) } catch {} }
function vibrateChapterDone() { try { navigator.vibrate && navigator.vibrate(30) } catch {} }

/* ============ 章节摘要 ============ */
function chapterSummary(ch) {
  return {
    id: ch.id,
    index: ch.index,
    title: ch.title,
    status: ch.status,
    error_count: ch.error_count,
    content_preview: ch.content.slice(0, 60) + (ch.content.length > 60 ? '…' : '')
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

/* ============ 导出生成 ============ */
async function buildTxt() {
  const lines = []
  lines.push(store.project.file_name.replace(/\.(txt|docx)$/i, '') || '校对稿')
  lines.push('')
  for (const ch of store.chapters) {
    lines.push(ch.title)
    lines.push('')
    lines.push(applyFixes(ch.content, ch.errors))
    lines.push('')
  }
  return lines.join('\n')
}

function applyFixes(content, errors) {
  let text = content
  for (const e of errors) {
    if (e.fixed && e.original && e.suggestion) {
      text = text.split(e.original).join(e.suggestion)
    }
  }
  return text
}

async function buildDocx() {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`)
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.folder('word').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:style>
</w:styles>`)

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let paras = []
  const bookTitle = (store.project.file_name || SAMPLE_TITLE).replace(/\.(txt|docx)$/i, '')
  paras.push(`<w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${esc(bookTitle)}（校对完稿）</w:t></w:r></w:p>`)
  for (const ch of store.chapters) {
    paras.push(`<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(ch.title)}</w:t></w:r></w:p>`)
    const content = applyFixes(ch.content, ch.errors)
    content.split('\n').filter((l) => l.trim()).forEach((line) => {
      paras.push(`<w:p><w:r><w:t>${esc(line)}</w:t></w:r></w:p>`)
    })
  }
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paras.join('')}
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`)
  return zip.generateAsync({ type: 'blob' })
}

/* ============ 路由分发 ============ */
async function route(method, url, { data, params, formData, blob }) {
  await sleep(120 + Math.random() * 200)
  const seg = url.split('?')[0].split('/').filter(Boolean)

  // GET /projects/latest —— 断点续检
  if (method === 'GET' && seg.join('/') === 'projects/latest') {
    if (!store.project) return ok(null)
    resumeIfNeeded()
    return ok({
      project: { id: store.project.id, status: store.project.status, file_name: store.project.file_name, file_type: store.project.file_type, source_type: store.project.source_type, finalized: store.finalized },
      pipeline: serializePipeline(),
      chapters: store.chapters.map(chapterSummary)
    })
  }

  // GET /settings
  if (method === 'GET' && seg.join('/') === 'settings') {
    return ok(store.settings)
  }

  // PUT /settings
  if (method === 'PUT' && seg.join('/') === 'settings') {
    store.settings = data
    persist()
    return ok(store.settings)
  }

  // POST /settings/test
  if (method === 'POST' && seg.join('/') === 'settings/test') {
    const group = store.settings.groups.find((g) => g.id === data.group_id)
    const model = group?.models.find((m) => m.id === data.model_id)
    await sleep(600)
    if (!model) return ok({ success: false, msg: '模型不存在' })
    if (!model.enabled) return ok({ success: false, msg: '该模型未启用' })
    if (!model.api_key) return ok({ success: false, msg: 'API Key不能为空' })
    if (model.api_key.startsWith('invalid')) return ok({ success: false, msg: 'API Key无效或已过期，请重新设置' })
    if (/不兼容|incompat/i.test(model.name)) return ok({ success: false, msg: '当前AI配置可能不兼容，请检查模型名称' })
    return ok({ success: true, msg: '连接成功' })
  }

  // POST /upload —— 文件上传
  if (method === 'POST' && seg.join('/') === 'upload') {
    const file = formData.get('file')
    const text = await file.text()
    return createProject({ text, file_name: file.name, file_type: file.type || file.name.split('.').pop(), source_type: 'file' })
  }

  // POST /projects —— 文字输入
  if (method === 'POST' && seg.join('/') === 'projects') {
    if (!data.full_text || !data.full_text.trim()) {
      return err(400, '请输入文字内容')
    }
    return createProject({ text: data.full_text, file_name: '', file_type: 'text', source_type: 'text' })
  }

  // POST /projects/:id/start-struct
  if (method === 'POST' && seg[0] === 'projects' && seg[2] === 'start-struct') {
    const health = checkModelHealth()
    if (health) return err(health.code, health.msg)
    startPipeline()
    return ok({ started: true })
  }

  // GET /projects/:id/progress
  if (method === 'GET' && seg[0] === 'projects' && seg[2] === 'progress') {
    resumeIfNeeded()
    return ok({
      pipeline: serializePipeline(),
      chapters: store.chapters.map(chapterSummary),
      overall: overallProgress()
    })
  }

  // GET /projects/:id/export
  if (method === 'GET' && seg[0] === 'projects' && seg[2] === 'export') {
    const format = params.format || 'txt'
    const name = (store.project.file_name || SAMPLE_TITLE).replace(/\.(txt|docx)$/i, '')
    if (format === 'docx') {
      const blob = await buildDocx()
      return { __blob: blob, filename: `${name}_校对完稿.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    }
    const text = await buildTxt()
    return { __blob: new Blob([text], { type: 'text/plain;charset=utf-8' }), filename: `${name}_校对完稿.txt`, mime: 'text/plain;charset=utf-8' }
  }

  // POST /projects/:id/finalize
  if (method === 'POST' && seg[0] === 'projects' && seg[2] === 'finalize') {
    store.finalized = true
    store.project.status = 'finalized'
    persist()
    return ok({ finalized: true })
  }

  // GET /chapters?limit=20 —— 预加载元数据
  if (method === 'GET' && seg.join('/') === 'chapters') {
    const limit = Number(params?.limit) || 20
    return ok(store.chapters.slice(0, limit).map(chapterSummary))
  }

  // GET /chapters/:id —— 章节详情（含错误）
  if (method === 'GET' && seg[0] === 'chapters' && seg[1]) {
    const ch = store.chapters.find((c) => c.id === seg[1])
    if (!ch) return err(404, '章节不存在')
    return ok({ ...ch, content: ch.content })
  }

  // POST /chapters/:id/recheck —— 修复并复检
  if (method === 'POST' && seg[0] === 'chapters' && seg[2] === 'recheck') {
    const health = checkModelHealth()
    if (health) return err(health.code, health.msg)
    const ch = store.chapters.find((c) => c.id === seg[1])
    if (!ch) return err(404, '章节不存在')
    await sleep(900)
    // 标记指定错误已修复
    const fixIds = data.fix_ids || []
    ch.errors = (ch.errors || []).map((e) => {
      if (fixIds.includes(e.id)) return { ...e, fixed: true }
      return e
    })
    // 复检：重新扫描，排除已修复项
    const fresh = scanChapter(ch).filter((e) => !fixIds.includes(e.id))
    ch.errors = ch.errors.concat(fresh)
    ch.error_count = chapterErrorCount(ch.errors)
    ch.status = 'done'
    persist()
    return ok(chapterSummary(ch))
  }

  return err(404, `Mock 未实现: ${method} ${url}`)
}

function createProject({ text, file_name, file_type, source_type }) {
  stopTimer()
  const { bookTitle, chapters } = splitChapters(text)
  store.project = {
    id: `p_${Date.now().toString(36)}`,
    status: 'parsed',
    file_name: file_name || `${bookTitle || SAMPLE_TITLE}.txt`,
    file_type,
    source_type
  }
  store.chapters = chapters.map((c, i) => ({
    id: `c_${i}_${Date.now().toString(36)}`,
    index: i + 1,
    title: c.title,
    content: c.content,
    status: 'idle',
    error_count: 0,
    errors: []
  }))
  store.pipeline = { struct: 'idle', single: { current_index: 0, total: store.chapters.length, progress: 0 }, special: 'idle' }
  store.finalized = false
  store.singlePos = null
  persist()
  return ok({
    project: { id: store.project.id, file_name: store.project.file_name, source_type },
    chapters: store.chapters.map(chapterSummary)
  })
}

function serializePipeline() {
  return {
    struct: store.pipeline.struct,
    single: { current_index: store.pipeline.single.current_index, total: store.pipeline.single.total, progress: store.pipeline.single.progress },
    special: store.pipeline.special
  }
}

function overallProgress() {
  const p = store.pipeline
  const s = p.single || { progress: 0 }
  if (p.struct === 'running') return Math.round((s.progress * 0.33))
  if (p.struct === 'done' && p.special === 'idle' && s.progress < s.total) return 33 + Math.round((s.progress / Math.max(s.total, 1)) * 33)
  if (p.special === 'running' || p.special === 'done') return 66 + (p.special === 'done' ? 34 : 0)
  return 0
}

function ok(data) {
  return { code: 0, data, msg: '' }
}

function err(code, msg) {
  const e = new Error(msg)
  e.__biz = true
  e.code = code
  e.msg = msg
  throw e
}

/** mock 入口：与真实 axios 响应同构 */
export default async function mockRequest(method, url, options) {
  const result = await route(method, url, options)
  if (result.__blob) {
    return { code: 0, data: { blob: result.__blob, filename: result.filename, mime: result.mime }, msg: '' }
  }
  return result
}
