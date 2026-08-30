import { reactive } from 'vue'

/** 全局轻提示（Toast） */
const state = reactive({ list: [] })
let seed = 0

export function toast(msg, type = 'info', duration = 2200) {
  const id = ++seed
  state.list.push({ id, msg, type })
  setTimeout(() => {
    const i = state.list.findIndex((t) => t.id === id)
    if (i > -1) state.list.splice(i, 1)
  }, duration)
}

export function toastState() {
  return state
}

/** 确认弹窗 */
export function confirmDialog({ title = '确认', message = '', confirmText = '确认', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const mask = document.createElement('div')
    mask.className = 'modal-mask'
    mask.innerHTML = `
      <div class="modal-box">
        <div style="font-weight:600;font-size:15px;margin-bottom:6px;">${title}</div>
        <div style="font-size:14px;color:var(--text-2);margin-bottom:16px;word-break:break-all;">${message}</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn btn-ghost" data-cancel>${cancelText}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmText}</button>
        </div>
      </div>`
    document.body.appendChild(mask)
    const close = (val) => { document.body.removeChild(mask); resolve(val) }
    mask.querySelector('[data-ok]').addEventListener('click', () => close(true))
    mask.querySelector('[data-cancel]').addEventListener('click', () => close(false))
    mask.addEventListener('click', (e) => { if (e.target === mask) close(false) })
  })
}
