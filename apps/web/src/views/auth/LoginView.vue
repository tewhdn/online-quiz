<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useToast } from '../../composables/useToast';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const toast = useToast();

const username = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }
  submitting.value = true;
  try {
    await auth.login(username.value.trim(), password.value);
    toast.success('登录成功');
    if (auth.mustChangePassword) {
      await router.replace({ name: 'change-password' });
    } else {
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
      await router.replace(redirect.startsWith('/') ? redirect : '/');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="stack" novalidate @submit.prevent="submit">
    <div>
      <h1 class="auth-title">登录</h1>
      <p class="auth-sub">使用管理员分配的账号继续学习</p>
    </div>
    <div class="field">
      <label for="login-username">用户名</label>
      <input id="login-username" v-model="username" class="input" autocomplete="username" placeholder="请输入用户名" maxlength="24" />
    </div>
    <div class="field">
      <label for="login-password">密码</label>
      <input
        id="login-password"
        v-model="password"
        class="input"
        type="password"
        autocomplete="current-password"
        placeholder="请输入密码"
        maxlength="72"
      />
    </div>

    <div v-if="error" class="error-box" role="alert">{{ error }}</div>

    <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="submitting">
      <span v-if="submitting" class="spinner" />
      {{ submitting ? '登录中…' : '登录' }}
    </button>

    <p class="auth-switch">
      还没有账号？
      <RouterLink to="/auth/register">使用邀请码注册</RouterLink>
    </p>
    <p class="hint" style="text-align: center">忘记密码请联系管理员重置，系统不提供邮件找回。</p>
  </form>
</template>
