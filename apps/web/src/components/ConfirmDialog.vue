<script setup lang="ts">
import { NButton, NModal } from 'naive-ui';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    loading?: boolean;
  }>(),
  { message: '', confirmText: '确认', cancelText: '取消', danger: false, loading: false },
);
const emit = defineEmits<{ (event: 'confirm'): void; (event: 'cancel'): void }>();

function onShow(show: boolean): void {
  if (!show && !props.loading) emit('cancel');
}
</script>

<template>
  <NModal
    :show="open"
    preset="card"
    :title="title"
    :mask-closable="!loading"
    :closable="!loading"
    :style="{ width: 'min(480px, calc(100vw - 32px))' }"
    @update:show="onShow"
  >
    <p v-if="message" class="muted" style="white-space: pre-wrap">{{ message }}</p>
    <slot />
    <template #footer>
      <div class="dialog-actions">
        <NButton :disabled="loading" @click="emit('cancel')">{{ cancelText }}</NButton>
        <NButton :type="danger ? 'error' : 'primary'" :loading="loading" @click="emit('confirm')">
          {{ confirmText }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>
