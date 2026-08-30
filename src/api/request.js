/**
 * 统一请求封装
 * - 响应体约定：{ code:0, data, msg }，code !== 0 视为业务错误
 * - 静默重试最多 3 次，间隔递增（500ms / 1000ms / 2000ms）
 * - 网络彻底失败：Toast 提示并记录到本地 offline_ops
 * - 特殊错误码：1001 = AI 配置不兼容，401 = API Key 无效
 */
import axios from 'axios'
import { toast } from '@/utils/feedback'
import { offlineOps } from '@/utils/storage'

const client = axios.create({
  baseURL: '/api',
  timeout: 30000
})

const RETRY_DELAYS = [500, 1000, 2000]

/** 是否启用 mock（无真实后端时可全流程演示） */
export const USE_MOCK = true

/**
 * @param {string} method GET|POST|PUT|DELETE
 * @param {string} url 以 / 开头的路径
 * @param {object} [options]
 * @param {object} [options.data] JSON body
 * @param {object} [options.params] query 参数
 * @param {FormData} [options.formData] 文件上传
 * @param {boolean} [options.blob] 期望二进制响应
 * @param {object} [options.skipToast] 失败时不自动 toast（调用方自行处理）
 */
export async function request(method, url, options = {}) {
  const { data, params, formData, blob = false, skipToast = false } = options
  let lastErr = null

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let resp
      if (USE_MOCK) {
        // 走 mock 适配层，模拟真实延迟
        const mockFn = (await import('./mock')).default
        resp = await mockFn(method, url, { data, params, formData, blob })
        return resp
      } else {
        const cfg = {
          method,
          url,
          params,
          responseType: blob ? 'blob' : 'json'
        }
        if (formData) cfg.data = formData
        else if (data !== undefined) cfg.data = data
        const raw = await client.request(cfg)
        // 统一返回响应体 { code, data, msg }；blob 场景 data 即文件
        return blob ? { code: 0, data: raw.data, msg: '' } : raw.data
      }
    } catch (err) {
      lastErr = err
      // 业务错误码（如 1001 / 401）：不重试
      if (err.__biz) {
        handleBizError(err)
        throw err
      }
      // 网络类错误：静默重试
      if (attempt < 3) {
        await sleep(RETRY_DELAYS[attempt])
        continue
      }
      break
    }
  }

  // 彻底失败
  const e = lastErr || new Error('网络不稳定，请稍后')
  toast('网络不稳定，请稍后', 'error')
  if (!skipToast) {
    offlineOps.push({ method, url, data: data || null, params: params || null })
    // 网络恢复检测
    window.dispatchEvent(new CustomEvent('np:offline', { detail: { method, url } }))
  }
  throw e
}

function handleBizError(err) {
  const { code } = err
  if (code === 401) {
    toast('API Key无效或已过期，请重新设置', 'error')
    window.dispatchEvent(new CustomEvent('np:auth-error'))
  } else if (code === 1001) {
    toast('当前AI配置可能不兼容，请检查设置', 'warn')
    window.dispatchEvent(new CustomEvent('np:ai-incompatible'))
  } else {
    toast(err.msg || '操作失败', 'error')
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 便捷方法 */
export const get = (url, options = {}) => request('GET', url, options)
export const post = (url, data = {}, options = {}) => request('POST', url, { ...options, data })
export const put = (url, data = {}, options = {}) => request('PUT', url, { ...options, data })
export const del = (url, options = {}) => request('DELETE', url, options)

/** 上传文件 */
export function uploadFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  return request('POST', '/upload', { formData: fd })
}
