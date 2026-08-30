/**
 * 业务 API 服务层
 * 统一封装后端 RESTful 接口（响应体 { code:0, data, msg }）
 */
import { get, post, put, request } from './request'
import { triggerDownload } from '@/utils/download'

export const api = {
  /** 断点续检：恢复上次未完成状态 */
  getLatestProject() {
    return get('/projects/latest')
  },

  /** 上传文件（FormData） */
  upload(file) {
    const fd = new FormData()
    fd.append('file', file)
    return request('POST', '/upload', { formData: fd })
  },

  /** 文字输入创建项目 */
  createProjectFromText(fullText) {
    return post('/projects', { full_text: fullText })
  },

  /** 启动结构检查（三阶段流水线） */
  startStruct(projectId) {
    return post(`/projects/${projectId}/start-struct`)
  },

  /** 轮询进度（含各章状态） */
  getProgress(projectId) {
    return get(`/projects/${projectId}/progress`)
  },

  /** 预加载章节元数据 */
  preloadChapters(limit = 20) {
    return get('/chapters', { params: { limit } })
  },

  /** 获取章节详情（含错误列表） */
  getChapter(chapterId) {
    return get(`/chapters/${chapterId}`)
  },

  /** 修复并复检指定章节 */
  recheckChapter(chapterId, fixIds) {
    return post(`/chapters/${chapterId}/recheck`, { fix_ids: fixIds })
  },

  /** 导出校对后小说，触发下载 */
  async exportProject(projectId, format, baseName = '小说') {
    const resp = await get(`/projects/${projectId}/export`, { params: { format }, blob: true })
    const d = resp.data
    const blob = d && typeof d === 'object' && d.blob ? d.blob : d
    const mime = (d && d.mime) || (format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain;charset=utf-8')
    const filename = (d && d.filename) || `${baseName}_校对完稿.${format}`
    triggerDownload(blob, filename, mime)
    return { filename }
  },

  /** 标记可交付（锁定项目） */
  finalize(projectId) {
    return post(`/projects/${projectId}/finalize`)
  },

  /** 读取设置（恢复激活组/模型） */
  getSettings() {
    return get('/settings')
  },

  /** 保存设置 */
  saveSettings(settings) {
    return put('/settings', settings)
  },

  /** 测试连通性 */
  testConnection(groupId, modelId) {
    return post('/settings/test', { group_id: groupId, model_id: modelId })
  }
}
