<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useToast } from '../../composables/useToast';

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();

const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const inviteCode = ref('');
const error = ref('');
const submitting = ref(false);

const usernameHint = computed(() => {
  if (!username.value) return '3-24 个字符，可包含字母、数字、下划线、连字符或中文';
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username.value)) return '格式不正确：需 3-24 个字符';
  return '';
});
const passwordHint = computed(() => {
  if (!password.value) return '至少 8 位，必须同时包含字母和数字';
  if (password.value.length < 8) return '密码至少 8 位';
  if (!/[A-Za-z]/.test(password.value) || !/[0-9]/.test(password.value)) return '密码必须同时包含字母和数字';
  return '';
});

async function submit(): Promise<void> {
  error.value = '';
  if (!username.value.trim() || !password.value || !inviteCode.value.trim()) {
    error.value = '请完整填写用户名、密码和邀请码';
    return;
  }
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致';
    return;
  }
  if (usernameHint.value || passwordHint.value) {
    error.value = usernameHint.value || passwordHint.value;
    return;
  }
  submitting.value = true;
  try {
    await auth.register({
      username: username.value.trim(),
      password: password.value,
      confirmPassword: confirmPassword.value,
      inviteCode: inviteCode.value.trim(),
    });
    toast.success('注册成功，欢迎开始学习');
    await router.replace('/');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '注册失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="stack" novalidate @submit.prevent="submit">
    <div class="field">
      <label for="reg-username">用户名</label>
      <input id="reg-username" v-model="username" class="input" autocomplete="username" placeholder="设置用户名" maxlength="24" />
      <span class="hint">{{ usernameHint || '用户名注册后不可修改' }}</span>
    </div>
    <div class="field">
      <label for="reg-password">密码</label>
      <input
        id="reg-password"
        v-model="password"
        class="input"
        type="password"
        autocomplete="new-password"
        placeholder="设置密码"
        maxlength="72"
      />
      <span class="hint">{{ passwordHint || '密码需至少 8 位且包含字母和数字' }}</span>
    </div>
    <div class="field">
      <label for="reg-confirm">确认密码</label>
      <input
        id="reg-confirm"
        v-model="confirmPassword"
        class="input"
        type="password"
        autocomplete="new-password"
        placeholder="再次输入密码"
        maxlength="72"
      />
    </div>
    <div class="field">
      <label for="reg-invite">邀请码</label>
      <input
        id="reg-invite"
        v-model="inviteCode"
        class="input mono"
        placeholder="例如 QZ-XXXX-XXXX-XXXX"
        autocomplete="off"
        maxlength="40"
      />
      <span class="hint">邀请码由管理员发放，不区分大小写</span>
    </div>

    <div v-if="error" class="error-box" role="alert">{{ error }}</div>

    <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="submitting">
      <span v-if="submitting" class="spinner" />
      {{ submitting ? '注册中…' : '注册' }}
    </button>

    <p class="auth-switch">
      已有账号？
      <RouterLink to="/auth/login">返回登录</RouterLink>
    </p>
  </form>
</template>
