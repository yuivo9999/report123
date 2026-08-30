/**
 * 集中式状态树（对应文档规范）
 * state = { project, chapters, pipeline, ui, settings }
 */
import { defineStore } from 'pinia'
import { api } from '@/api'
import { toast } from '@/utils/feedback'
import { storage } from '@/utils/storage'
import { vibrateError, vibrateChapterDone } from '@/utils/vibrate'

const POLL_INTERVAL = 800

export const useAppStore = defineStore('app', {
  state: () => ({
    project: {
      id: '',
      status: 'idle', // idle | parsed | running | done | finalized | error
      file_name: '',
      file_type: '',
      source_type: 'text' // file | text
    },
    chapters: [],
    pipeline: {
      struct: 'idle', // idle | running | done | error
      single: { current_index: 0, total: 0, progress: 0 },
      special: 'idle' // idle | running | done | error
    },
    ui: {
      active_tab: 'input', // input | dashboard | report | settings
      error_drawer_open: false,
      selected_chapter_id: null,
      settings_visible: false,
      fix_chapter_id: null,
      fix_error_id: null,
      warning_banner: null, // { type, msg }
      drawer_tab: 'critical' // critical | major | minor | all
    },
    settings: {
      groups: [],
      active_group_id: '',
      active_model_id: ''
    },
    overall_progress: 0,
    polling: false,
    submitting: false,
    final_report: null // { byStage, bySeverity, fixRate, deliverable }
  }),

  getters: {
    activeGroup(state) {
      return state.settings.groups.find((g) => g.id === state.settings.active_group_id) || null
    },
    activeModel(state) {
      const g = this.activeGroup
      if (!g) return null
      return g.models.find((m) => m.id === state.settings.active_model_id) || null
    },
    isRunning(state) {
      return state.pipeline.struct === 'running' ||
        (state.pipeline.single && state.pipeline.single.progress > 0 && state.pipeline.single.progress < state.pipeline.single.total) ||
        state.pipeline.special === 'running'
    },
    selectedChapter(state) {
      return state.chapters.find((c) => c.id === state.ui.selected_chapter_id) || null
    },
    fixChapter(state) {
      return state.chapters.find((c) => c.id === state.ui.fix_chapter_id) || null
    }
  },

  actions: {
    /* ================= 断点续检 ================= */
    async restoreLatest() {
      try {
        const { data } = await api.getLatestProject()
        if (!data) return false
        this.project = { ...this.project, ...data.project }
        this.chapters = data.chapters
        this.pipeline = data.pipeline
        this.overall_progress = this.calcOverall()
        if (this.isRunning) {
          this.startPolling()
        }
        // 存在项目则进入看板展示（进行中自动重连轮询，已完成展示结果）
        this.ui.active_tab = 'dashboard'
        if (data.project.status === 'done' || data.project.status === 'finalized') {
          this.fetchAllChapters().then(() => this.buildReport())
        }
        return true
      } catch {
        return false
      }
    },

    /* ================= 内容提交 ================= */
    async submitContent({ file, fullText }) {
      this.submitting = true
      try {
        let resp
        if (file) {
          resp = await api.upload(file)
        } else if (fullText && fullText.trim()) {
          resp = await api.createProjectFromText(fullText)
        } else {
          toast('请上传文件或输入文字内容', 'warn')
          return false
        }
        const { project, chapters } = resp.data
        this.project = {
          id: project.id,
          status: 'parsed',
          file_name: project.file_name || '',
          file_type: project.file_type || '',
          source_type: file ? 'file' : 'text'
        }
        this.chapters = chapters
        this.pipeline = { struct: 'idle', single: { current_index: 0, total: chapters.length, progress: 0 }, special: 'idle' }
        this.ui.active_tab = 'dashboard'
        this.ui.warning_banner = null
        // 自动启动结构检查
        await this.startStruct()
        return true
      } catch (e) {
        if (e.code === 401 || e.code === 40001) {
          toast(e.msg || '请先到设置中配置模型', 'warn')
          this.ui.active_tab = 'settings'
        }
        return false
      } finally {
        this.submitting = false
      }
    },

    /* ================= 三阶段流水线 ================= */
    async startStruct() {
      try {
        await api.startStruct(this.project.id)
        this.project.status = 'running'
        this.startPolling()
      } catch (e) {
        if (e.code === 40001) {
          toast('请先在设置中激活一个模型', 'warn')
          this.ui.active_tab = 'settings'
        } else if (e.code === 401) {
          toast('API Key无效或已过期，请重新设置', 'error')
          this.ui.active_tab = 'settings'
        } else if (e.code === 1001) {
          this.ui.warning_banner = { type: 'incompat', msg: '当前AI配置可能不兼容，请检查设置' }
        } else {
          toast(e.msg || '启动失败', 'error')
        }
      }
    },

    startPolling() {
      if (this.polling) return
      this.polling = true
      this._pollTimer = setInterval(() => this.tickProgress(), POLL_INTERVAL)
    },

    stopPolling() {
      this.polling = false
      if (this._pollTimer) {
        clearInterval(this._pollTimer)
        this._pollTimer = null
      }
    },

    async tickProgress() {
      if (!this.project.id) return
      try {
        const { data } = await api.getProgress(this.project.id)
        // 合并章节状态（保留 errors 详情缓存）
        const map = new Map(data.chapters.map((c) => [c.id, c]))
        this.chapters = this.chapters.map((c) => {
          const meta = map.get(c.id)
          if (!meta) return c
          return { ...c, ...meta, errors: c.errors || [] }
        })
        this.pipeline = data.pipeline
        this.overall_progress = data.overall ?? this.calcOverall()
        const wasRunning = this.isRunning
        if (!wasRunning && this.pipeline.struct === 'done' && this.pipeline.special === 'done') {
          // 全部完成
          this.stopPolling()
          this.project.status = 'done'
          toast('三阶段校对完成', 'info')
          vibrateChapterDone()
          this.fetchAllChapters().then(() => this.buildReport())
        } else if (this.project.status !== 'running') {
          this.project.status = 'running'
        }
      } catch (e) {
        // 轮询失败静默，网络恢复后继续
      }
    },

    calcOverall() {
      const p = this.pipeline
      const s = p.single || { progress: 0, total: 0 }
      if (p.struct === 'running') return 5 + Math.round(s.progress * 0.28)
      if (p.struct === 'done' && p.special === 'idle') return 33 + Math.round((s.progress / Math.max(s.total, 1)) * 33)
      if (p.special === 'running') return 66
      if (p.special === 'done') return 100
      return 0
    },

    /* ================= 错误抽屉 ================= */
    /** 拉取章节完整错误详情（抽屉展示用） */
    async fetchChapterDetail(chapterId) {
      try {
        const { data } = await api.getChapter(chapterId)
        const ch = this.chapters.find((c) => c.id === chapterId)
        if (ch) {
          ch.errors = data.errors || []
          ch.error_count = data.error_count
          ch.content = data.content
        }
        return data
      } catch {
        return null
      }
    },

    /** 拉取全部章节完整详情（报告页 / 完成时用） */
    async fetchAllChapters() {
      const list = []
      for (const c of this.chapters) {
        try {
          const { data } = await api.getChapter(c.id)
          list.push({ ...c, ...data, errors: data.errors || [] })
        } catch {
          list.push(c)
        }
      }
      this.chapters = list
      return list
    },

    async openDrawer(chapterId) {
      this.ui.selected_chapter_id = chapterId
      this.ui.error_drawer_open = true
      this.ui.drawer_tab = 'critical'
      await this.fetchChapterDetail(chapterId)
    },
    closeDrawer() {
      this.ui.error_drawer_open = false
      this.ui.selected_chapter_id = null
    },
    openFixModal(chapterId, errorId) {
      this.ui.fix_chapter_id = chapterId
      this.ui.fix_error_id = errorId
      // 恢复草稿
      this.fixDraft = storage.get(`fix_draft_${chapterId}_${errorId}`) || null
    },
    closeFixModal() {
      this.ui.fix_chapter_id = null
      this.ui.fix_error_id = null
      this.fixDraft = null
    },

    /* ================= 修复并复检 ================= */
    async fixAndRecheck(chapterId, fixIds, correctedText) {
      try {
        const { data } = await api.recheckChapter(chapterId, fixIds)
        const ch = this.chapters.find((c) => c.id === chapterId)
        if (ch) {
          Object.assign(ch, data)
          // 同步本地错误状态（保留详情，标记已修复）
          ch.errors = ch.errors.map((e) => (fixIds.includes(e.id) ? { ...e, fixed: true } : e))
        }
        // 清除草稿
        fixIds.forEach((id) => storage.remove(`fix_draft_${chapterId}_${id}`))
        this.closeFixModal()
        this.buildReport()
        toast('复检完成', 'info')
        return true
      } catch (e) {
        if (e.code === 401 || e.code === 40001) {
          toast(e.msg || '模型未配置', 'warn')
          this.ui.active_tab = 'settings'
        } else {
          toast(e.msg || '复检失败', 'error')
        }
        return false
      }
    },

    /* ================= 最终报告 ================= */
    buildReport() {
      let total = 0
      let fixed = 0
      const byStage = { struct: 0, single: 0, special: 0 }
      const bySeverity = { critical: 0, major: 0, minor: 0 }
      for (const ch of this.chapters) {
        for (const e of ch.errors || []) {
          total++
          if (e.fixed) fixed++
          if (byStage[e.stage] !== undefined) byStage[e.stage]++
          if (bySeverity[e.severity] !== undefined) bySeverity[e.severity]++
        }
      }
      const criticalUnfixed = this.chapters.reduce((acc, ch) => {
        return acc + (ch.errors || []).filter((e) => e.severity === 'critical' && !e.fixed).length
      }, 0)
      const allDone = this.chapters.every((c) => c.status === 'done')
      this.final_report = {
        total,
        fixed,
        fixRate: total ? Math.round((fixed / total) * 100) : 100,
        byStage,
        bySeverity,
        deliverable: criticalUnfixed === 0 && allDone
      }
      return this.final_report
    },

    async finalize() {
      try {
        await api.finalize(this.project.id)
        this.project.status = 'finalized'
        this.stopPolling()
        this.ui.active_tab = 'input'
        this.clearProject()
        toast('已标记为可交付', 'info')
        return true
      } catch (e) {
        toast(e.msg || '操作失败', 'error')
        return false
      }
    },

    clearProject() {
      this.project = { id: '', status: 'idle', file_name: '', file_type: '', source_type: 'text' }
      this.chapters = []
      this.pipeline = { struct: 'idle', single: { current_index: 0, total: 0, progress: 0 }, special: 'idle' }
      this.overall_progress = 0
      this.final_report = null
    },

    /* ================= 设置 ================= */
    async loadSettings() {
      try {
        const { data } = await api.getSettings()
        this.settings = data
        // 恢复草稿覆盖
        const draft = storage.get('settings_draft')
        if (draft && draft._ts && Date.now() - draft._ts < 1000 * 60 * 60 * 24) {
          this.settings = draft
        }
        return this.settings
      } catch {
        return null
      }
    },

    async saveSettings() {
      try {
        const { data } = await api.saveSettings(this.settings)
        this.settings = data
        storage.remove('settings_draft')
        toast('已保存', 'info')
        return true
      } catch (e) {
        toast(e.msg || '保存失败', 'error')
        return false
      }
    },

    /** 设置本地草稿缓存（每次修改调用） */
    persistSettingsDraft() {
      storage.set('settings_draft', { ...this.settings, _ts: Date.now() })
    },

    async testConnection(groupId, modelId) {
      try {
        const { data } = await api.testConnection(groupId, modelId)
        toast(data.msg || (data.success ? '连接成功' : '连接失败'), data.success ? 'info' : 'error')
        return data.success
      } catch (e) {
        toast(e.msg || '连接失败', 'error')
        return false
      }
    },

    /* ================= 导出 ================= */
    async exportProject(format) {
      const baseName = (this.project.file_name || '小说').replace(/\.(txt|docx)$/i, '')
      try {
        await api.exportProject(this.project.id, format, baseName)
        toast(`已导出 ${format.toUpperCase()}`, 'info')
      } catch (e) {
        toast(e.msg || '导出失败', 'error')
      }
    }
  }
})
