<script setup lang="ts">
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<template>
  <div class="toast-stack" role="status" aria-live="polite">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.type" @click="dismiss(toast.id)">
      <span>{{ toast.type === 'success' ? '✅' : toast.type === 'error' ? '⚠️' : 'ℹ️' }}</span>
      <span style="flex: 1">{{ toast.message }}</span>
    </div>
  </div>
</template>
