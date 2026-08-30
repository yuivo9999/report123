<template>
  <div class="page">
    <header class="topbar">
      <div class="side">
        <button class="icon-btn" @click="onBack">←</button>
      </div>
      <div class="title">API设置</div>
      <div class="side right">
        <button class="reset-btn" @click="resetAll">重置为默认</button>
      </div>
    </header>

    <div class="settings-body">
      <!-- 组别列表 -->
      <div v-for="group in store.settings.groups" :key="group.id" class="group-card">
        <div class="group-head" @click="toggleGroup(group.id)">
          <span class="g-arrow" :class="{ open: openGroups.includes(group.id) }">▸</span>
          <input
            v-model="group.name"
            class="g-name"
            @click.stop
            @input="markDirty"
            placeholder="组别名称"
          />
          <button
            class="g-active"
            :class="{ on: store.settings.active_group_id === group.id }"
            @click.stop="setActiveGroup(group.id)"
          >设为当前组</button>
          <button class="g-del" @click.stop="removeGroup(group.id)">🗑</button>
        </div>

        <div v-if="openGroups.includes(group.id)" class="group-body">
          <!-- 模型列表 -->
          <div v-for="model in group.models" :key="model.id" class="model-row">
            <input type="radio" class="m-radio" :name="'active_' + group.id" :checked="store.settings.active_model_id === model.id"
              @change="setActiveModel(group.id, model.id)" />
            <div class="m-fields">
              <div class="m-line">
                <input v-model="model.name" class="m-name" placeholder="模型名称" @input="markDirty" />
                <label class="switch">
                  <input type="checkbox" v-model="model.enabled" @change="markDirty" />
                  <span class="slider"></span>
                </label>
                <span class="m-enable">{{ model.enabled ? '启用' : '停用' }}</span>
                <button class="m-del" @click="removeModel(group.id, model.id)">✕</button>
              </div>
              <div class="m-line key-line">
                <input :type="showKey[model.id] ? 'text' : 'password'" v-model="model.api_key"
                  class="m-key" placeholder="API Key" @input="markDirty" />
                <button class="eye" @click="showKey[model.id] = !showKey[model.id]">{{ showKey[model.id] ? '🙈' : '👁' }}</button>
              </div>
              <div class="m-line temp-line">
                <span class="temp-label">温度</span>
                <input type="range" min="0" max="2" step="0.1" v-model.number="model.temperature" @input="markDirty" class="temp-range" />
                <span class="temp-val">{{ Number(model.temperature).toFixed(1) }}</span>
              </div>
            </div>
          </div>
          <div v-if="group.models.length === 0" class="no-model">该组暂无模型</div>
          <button class="add-model" @click="addModel(group.id)">＋ 添加模型</button>
        </div>
      </div>

      <!-- 添加组 -->
      <button class="add-group" @click="promptAddGroup">＋ 添加组</button>
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-bar">
      <button class="btn btn-ghost" :disabled="testing" @click="test">
        {{ testing ? '测试中…' : '测试连通性' }}
      </button>
      <button class="btn btn-primary" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存当前选择' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores'
import { toast, confirmDialog } from '@/utils/feedback'
import { storage } from '@/utils/storage'

const store = useAppStore()
const router = useRouter()
const openGroups = ref([])
const showKey = reactive({})
const testing = ref(false)
const saving = ref(false)
const dirty = ref(false)
let nextGid = 1
let nextMid = 1

onMounted(async () => {
  if (store.settings.groups.length === 0) {
    await store.loadSettings()
  }
  openGroups.value = store.settings.groups.map((g) => g.id)
  store.settings.groups.forEach((g) => g.models.forEach((m) => { showKey[m.id] = false }))
  const gid = store.settings.groups.reduce((m, g) => Math.max(m, parseInt(g.id.replace(/\D/g, '') || 0)), 0)
  const mid = store.settings.groups.reduce((m, g) => g.models.reduce((mm, md) => Math.max(mm, parseInt(md.id.replace(/\D/g, '') || 0)), m), 0)
  nextGid = gid + 1
  nextMid = mid + 1
})

const markDirty = () => {
  dirty.value = true
  store.persistSettingsDraft()
}

function toggleGroup(id) {
  const i = openGroups.value.indexOf(id)
  if (i > -1) openGroups.value.splice(i, 1)
  else openGroups.value.push(id)
}

function setActiveGroup(id) {
  store.settings.active_group_id = id
  markDirty()
}

function setActiveModel(groupId, modelId) {
  store.settings.active_model_id = modelId
  markDirty()
}

function removeGroup(id) {
  confirmDialog({
    title: '删除组别',
    message: `确定删除组别「${store.settings.groups.find((g) => g.id === id)?.name || ''}」及其所有模型？`,
    confirmText: '删除', danger: true
  }).then((ok) => {
    if (!ok) return
    store.settings.groups = store.settings.groups.filter((g) => g.id !== id)
    if (store.settings.active_group_id === id) {
      store.settings.active_group_id = store.settings.groups[0]?.id || ''
      store.settings.active_model_id = store.settings.groups[0]?.models[0]?.id || ''
    }
    openGroups.value = openGroups.value.filter((g) => g !== id)
    markDirty()
  })
}

function removeModel(groupId, modelId) {
  const g = store.settings.groups.find((x) => x.id === groupId)
  if (!g) return
  g.models = g.models.filter((m) => m.id !== modelId)
  if (store.settings.active_model_id === modelId) {
    store.settings.active_model_id = g.models.find((m) => m.enabled)?.id || g.models[0]?.id || ''
  }
  markDirty()
}

function addModel(groupId) {
  const g = store.settings.groups.find((x) => x.id === groupId)
  const m = { id: `m_${nextMid++}`, name: '', api_key: '', temperature: 0.5, enabled: true }
  g.models.push(m)
  showKey[m.id] = false
  if (store.settings.active_model_id === '' || !store.settings.active_group_id) {
    store.settings.active_model_id = m.id
    store.settings.active_group_id = groupId
  }
  markDirty()
}

function promptAddGroup() {
  const mask = document.createElement('div')
  mask.className = 'modal-mask'
  mask.innerHTML = `
    <div class="modal-box">
      <div style="font-weight:600;font-size:15px;margin-bottom:12px;">添加组别</div>
      <input id="np_gname" style="width:100%;" placeholder="输入组别名称" maxlength="12" />
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-ghost" data-cancel>取消</button>
        <button class="btn btn-primary" data-ok>添加</button>
      </div>
    </div>`
  document.body.appendChild(mask)
  const input = mask.querySelector('#np_gname')
  setTimeout(() => input.focus(), 50)
  const close = (val) => { document.body.removeChild(mask); if (val) commitAddGroup(input.value.trim()) }
  mask.querySelector('[data-ok]').addEventListener('click', () => close(true))
  mask.querySelector('[data-cancel]').addEventListener('click', () => close(false))
  mask.addEventListener('click', (e) => { if (e.target === mask) close(false) })
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(true) })
}

function commitAddGroup(name) {
  if (!name) { toast('组别名称不能为空', 'warn'); return }
  const g = { id: `g_${nextGid++}`, name, models: [] }
  store.settings.groups.push(g)
  openGroups.value.push(g.id)
  if (!store.settings.active_group_id) {
    store.settings.active_group_id = g.id
  }
  markDirty()
}

function resetAll() {
  confirmDialog({
    title: '重置为默认',
    message: '将清空所有组别与模型配置，确定继续？',
    confirmText: '重置', danger: true
  }).then((ok) => {
    if (!ok) return
    store.settings.groups = []
    store.settings.active_group_id = ''
    store.settings.active_model_id = ''
    markDirty()
  })
}

async function test() {
  if (!store.settings.active_group_id || !store.settings.active_model_id) {
    toast('请先在设置中激活一个模型', 'warn')
    return
  }
  testing.value = true
  await store.testConnection(store.settings.active_group_id, store.settings.active_model_id)
  testing.value = false
}

async function save() {
  if (!store.settings.active_group_id || !store.settings.active_model_id) {
    toast('请先选择激活的组别与模型', 'warn')
    return
  }
  saving.value = true
  const ok = await store.saveSettings()
  saving.value = false
  if (ok) {
    dirty.value = false
    router.back()
  }
}

function onBack() {
  if (dirty.value) {
    confirmDialog({
      title: '未保存的更改',
      message: '有未保存的更改，是否保存？',
      confirmText: '保存', cancelText: '放弃'
    }).then(async (ok) => {
      if (ok) await save()
      else {
        storage.remove('settings_draft')
        dirty.value = false
        router.back()
      }
    })
  } else {
    router.back()
  }
}

onBeforeUnmount(() => {
  document.querySelectorAll('.modal-mask').forEach((el) => el.remove())
})
</script>

<style scoped>
.page { min-height: 100vh; padding-top: 48px; padding-bottom: calc(72px + var(--safe-bottom)); }
.topbar .right { justify-content: flex-end; }
.reset-btn { font-size: 12px; color: var(--danger); padding: 4px 8px; border-radius: 8px; background: #fef2f2; white-space: nowrap; }
.settings-body { padding: 12px; }

.group-card { background: #fff; border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 8px; box-shadow: var(--shadow); }
.group-head { display: flex; align-items: center; gap: 6px; }
.g-arrow { transition: transform .2s; color: var(--text-2); font-size: 12px; }
.g-arrow.open { transform: rotate(90deg); }
.g-name { flex: 1; border: none; padding: 4px 6px; font-weight: 600; background: transparent; }
.g-name:focus { background: var(--bg); }
.g-active { font-size: 11px; padding: 4px 8px; border-radius: 8px; background: var(--bg); color: var(--text-2); white-space: nowrap; }
.g-active.on { background: var(--theme); color: #fff; }
.g-del { font-size: 14px; padding: 4px; }
.g-body { margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px; }
.no-model { font-size: 12px; color: var(--text-2); padding: 8px 0; }

.model-row { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.model-row:last-child { border-bottom: none; }
.m-radio { accent-color: var(--theme); margin-top: 14px; }
.m-fields { flex: 1; min-width: 0; }
.m-line { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.m-name { flex: 1; padding: 5px 8px; font-size: 13px; }
.m-key { flex: 1; padding: 5px 8px; font-size: 12px; }
.key-line { margin-bottom: 6px; }
.eye { font-size: 13px; padding: 4px; }
.temp-line { margin-bottom: 0; }
.temp-label { font-size: 12px; color: var(--text-2); }
.temp-range { flex: 1; accent-color: var(--theme); }
.temp-val { font-size: 12px; width: 30px; text-align: right; color: var(--text); }
.m-enable { font-size: 11px; color: var(--text-2); }
.m-del { color: var(--danger); font-size: 13px; padding: 4px 6px; }

.switch { position: relative; width: 38px; height: 22px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0; cursor: pointer;
  background: #d1d5db; border-radius: 22px; transition: .2s;
}
.slider::before {
  content: ''; position: absolute; width: 18px; height: 18px;
  left: 2px; top: 2px; background: #fff; border-radius: 50%; transition: .2s;
}
.switch input:checked + .slider { background: var(--theme); }
.switch input:checked + .slider::before { transform: translateX(16px); }

.add-model { width: 100%; margin-top: 8px; padding: 8px; border: 1px dashed #b6c2d4; border-radius: var(--radius-sm); color: var(--theme); font-size: 13px; background: var(--theme-light); }
.add-group { width: 100%; padding: 12px; border: 1.5px dashed #b6c2d4; border-radius: var(--radius); color: var(--theme); font-size: 14px; background: transparent; }

.bottom-bar {
  position: fixed; left: 0; right: 0; bottom: 0;
  height: 56px;
  display: flex; gap: 10px;
  padding: 0 12px calc(env(safe-area-inset-bottom, 0px) / 2 + 6px);
  align-items: center;
  background: #fff; border-top: 1px solid var(--border); z-index: 800;
}
.bottom-bar .btn { flex: 1; padding: 12px 0; }
</style>
