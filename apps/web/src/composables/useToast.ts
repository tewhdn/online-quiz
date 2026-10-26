import { ref } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const toasts = ref<Toast[]>([]);
let sequence = 0;

function dismiss(id: number): void {
  toasts.value = toasts.value.filter((item) => item.id !== id);
}

function push(type: ToastType, message: string, duration = 3600): number {
  const id = ++sequence;
  toasts.value = [...toasts.value.slice(-4), { id, type, message }];
  if (duration > 0) {
    window.setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export function useToast() {
  return {
    toasts,
    dismiss,
    success: (message: string, duration?: number) => push('success', message, duration),
    error: (message: string, duration?: number) => push('error', message, duration ?? 5000),
    info: (message: string, duration?: number) => push('info', message, duration),
  };
}
