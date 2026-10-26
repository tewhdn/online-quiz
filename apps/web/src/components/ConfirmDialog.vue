<script setup lang="ts">
withDefaults(
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
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>{{ title }}</h2>
        </div>
        <p v-if="message" class="muted" style="white-space: pre-wrap">{{ message }}</p>
        <slot />
        <div class="modal-footer">
          <button class="btn btn-ghost" :disabled="loading" @click="emit('cancel')">{{ cancelText }}</button>
          <button class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" :disabled="loading" @click="emit('confirm')">
            <span v-if="loading" class="spinner" />
            {{ loading ? '处理中…' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
