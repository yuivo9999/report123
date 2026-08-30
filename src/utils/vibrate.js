/** 轻量震动反馈（支持时使用，失败静默） */
export function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  } catch { /* 不支持时忽略 */ }
}

/** 完成一章：轻震 30ms */
export const vibrateChapterDone = () => vibrate(30)

/** 发现错误：震动两次（30ms 间隔 50ms） */
export const vibrateError = () => vibrate([30, 50, 30])
