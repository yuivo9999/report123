<template>
  <div class="toast-wrap">
    <TransitionGroup name="toast">
      <div v-for="t in state.list" :key="t.id" class="toast" :class="`toast-${t.type}`">
        {{ t.msg }}
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { toastState } from '@/utils/feedback'
const state = toastState()
</script>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
