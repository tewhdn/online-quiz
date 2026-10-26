import { useMessage } from 'naive-ui';

/**
 * 提示消息统一交给 Naive UI 的 Message 管理。
 * 保留原有 API，避免各业务页面改动。
 */
export function useToast() {
  const message = useMessage();
  return {
    success: (text: string, duration = 3000) => message.success(text, { duration }),
    error: (text: string, duration = 5000) => message.error(text, { duration }),
    info: (text: string, duration = 3500) => message.info(text, { duration }),
  };
}
