<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useToast } from '../../composables/useToast';
import BrandMark from '../../components/BrandMark.vue';

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const submitting = ref(false);

const hint = computed(() => {
  if (!newPassword.value) return '至少 8 位，必须同时包含字母和数字';
  if (newPassword.value.length < 8) return '密码至少 8 位';
  if (!/[A-Za-z]/.test(newPassword.value) || !/[0-9]/.test(newPassword.value)) return '密码必须同时包含字母和数字';
  if (newPassword.value === currentPassword.value) return '新密码不能与当前密码相同';
  return '';
});

async function submit(): Promise<void> {
  error.value = '';
  if (!currentPassword.value || !newPassword.value) {
    error.value = '请填写当前密码与新密码';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致';
    return;
  }
  if (hint.value) {
    error.value = hint.value;
    return;
  }
  submitting.value = true;
  try {
    await auth.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      confirmPassword: confirmPassword.value,
    });
    toast.success('密码已更新，请使用新密码继续');
    await router.replace('/');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '修改失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card card">
      <div class="auth-brand">
        <BrandMark />
        <div>
          <div class="auth-title">修改密码</div>
          <div class="auth-sub">为了账号安全，首次登录或密码被重置后必须修改密码</div>
        </div>
      </div>

      <div class="info-box" style="margin-bottom: 16px">
        当前账号：<strong>{{ auth.user?.username }}</strong>
        <span v-if="auth.mustChangePassword"> · 需要设置新密码后才能继续使用</span>
      </div>

      <form class="stack" novalidate @submit.prevent="submit">
        <div class="field">
          <label for="cp-current">当前密码</label>
          <input id="cp-current" v-model="currentPassword" class="input" type="password" autocomplete="current-password" maxlength="72" />
        </div>
        <div class="field">
          <label for="cp-new">新密码</label>
          <input id="cp-new" v-model="newPassword" class="input" type="password" autocomplete="new-password" maxlength="72" />
          <span class="hint">{{ hint || '密码需至少 8 位且包含字母和数字' }}</span>
        </div>
        <div class="field">
          <label for="cp-confirm">确认新密码</label>
          <input id="cp-confirm" v-model="confirmPassword" class="input" type="password" autocomplete="new-password" maxlength="72" />
        </div>

        <div v-if="error" class="error-box" role="alert">{{ error }}</div>

        <button class="btn btn-primary btn-block btn-lg" type="submit" :disabled="submitting">
          <span v-if="submitting" class="spinner" />
          {{ submitting ? '保存中…' : '保存新密码' }}
        </button>
        <button class="btn btn-ghost btn-block" type="button" :disabled="submitting" @click="auth.logout().then(() => router.replace('/auth/login'))">
          退出登录
        </button>
      </form>
    </div>
  </div>
</template>
