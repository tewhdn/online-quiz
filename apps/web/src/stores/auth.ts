import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { authApi } from '../api';
import { setCsrfToken, setUnauthorizedHandler } from '../api/client';
import type { User } from '../types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const siteName = ref('智能答题系统');
  const initialized = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let initPromise: Promise<void> | null = null;

  const isAuthenticated = computed(() => Boolean(user.value));
  const isAdmin = computed(() => user.value?.role === 'admin');
  const mustChangePassword = computed(() => Boolean(user.value?.mustChangePassword));
  const displayName = computed(() => user.value?.displayName || user.value?.username || '');

  async function init(force = false): Promise<void> {
    if (initialized.value && !force) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const result = await authApi.me();
        user.value = result.data.user;
        siteName.value = result.data.siteName || siteName.value;
        setCsrfToken(result.data.csrfToken);
      } catch {
        user.value = null;
        setCsrfToken(null);
      } finally {
        initialized.value = true;
        initPromise = null;
      }
    })();
    return initPromise;
  }

  async function login(username: string, password: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result = await authApi.login({ username, password });
      user.value = result.data.user;
      setCsrfToken(result.data.csrfToken);
      initialized.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '登录失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function register(payload: { username: string; password: string; confirmPassword: string; inviteCode: string }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result = await authApi.register(payload);
      user.value = result.data.user;
      setCsrfToken(result.data.csrfToken);
      initialized.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '注册失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // 忽略退出异常，本地状态仍需清理
    }
    clearLocal();
  }

  async function changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<void> {
    const result = await authApi.changePassword(payload);
    user.value = result.data.user;
    setCsrfToken(result.data.csrfToken);
  }

  function clearLocal(): void {
    user.value = null;
    setCsrfToken(null);
  }

  function setUser(next: User | null): void {
    user.value = next;
  }

  // 会话失效时统一清理本地状态
  setUnauthorizedHandler(() => {
    clearLocal();
  });

  return {
    user,
    siteName,
    initialized,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    mustChangePassword,
    displayName,
    init,
    login,
    register,
    logout,
    changePassword,
    clearLocal,
    setUser,
  };
});
