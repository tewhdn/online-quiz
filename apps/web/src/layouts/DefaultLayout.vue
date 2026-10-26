<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useTheme } from '../composables/useTheme';
import { useToast } from '../composables/useToast';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const theme = useTheme();
const menuOpen = ref(false);
const loggingOut = ref(false);

const navLinks = [
  { to: '/', label: '首页', short: '首页', icon: '🏠' },
  { to: '/practice', label: '刷题', short: '刷题', icon: '✏️' },
  { to: '/exams', label: '模拟考试', short: '考试', icon: '📝' },
  { to: '/mistakes', label: '错题本', short: '错题', icon: '📕' },
  { to: '/favorites', label: '收藏', short: '收藏', icon: '⭐' },
];

function closeMenu(): void {
  menuOpen.value = false;
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && target.closest('.user-chip') === null && target.closest('.menu') === null) closeMenu();
}

async function logout(): Promise<void> {
  loggingOut.value = true;
  try {
    await auth.logout();
    toast.success('已退出登录');
    router.replace({ name: 'login' });
  } finally {
    loggingOut.value = false;
    closeMenu();
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
watch(
  () => route.fullPath,
  () => closeMenu(),
);

const initials = () => (auth.displayName || 'U').slice(0, 1).toUpperCase();
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="container topbar-inner">
        <RouterLink class="brand" to="/">
          <span class="brand-mark">答</span>
          <span class="brand-text">{{ auth.siteName }}</span>
        </RouterLink>

        <nav class="nav" aria-label="主导航">
          <RouterLink v-for="link in navLinks" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin">管理后台</RouterLink>
        </nav>

        <div class="row" style="gap: 6px">
          <button
            class="btn btn-icon btn-ghost"
            type="button"
            :title="theme.mode.value === 'dark' ? '切换为浅色' : theme.mode.value === 'light' ? '切换为自动' : '切换为深色'"
            @click="theme.toggle()"
          >
            {{ theme.mode.value === 'dark' ? '☀️' : theme.mode.value === 'light' ? '🌗' : '🌙' }}
          </button>
          <button class="user-chip" type="button" @click.stop="menuOpen = !menuOpen">
            <span class="avatar">{{ initials() }}</span>
            <span class="small strong">{{ auth.displayName }}</span>
            <span class="tiny muted">▾</span>
          </button>
        </div>
      </div>

      <div v-if="menuOpen" class="menu" role="menu">
        <RouterLink to="/profile" role="menuitem">👤 个人中心</RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin" role="menuitem">🛠️ 管理后台</RouterLink>
        <button type="button" class="danger" :disabled="loggingOut" role="menuitem" @click="logout">
          🚪 {{ loggingOut ? '退出中…' : '退出登录' }}
        </button>
      </div>
    </header>

    <main class="page">
      <div class="container">
        <RouterView />
      </div>
    </main>

    <nav class="bottom-nav" aria-label="移动端导航">
      <RouterLink v-for="link in navLinks" :key="link.to" :to="link.to">
        <span class="bn-icon">{{ link.icon }}</span>
        <span>{{ link.short }}</span>
      </RouterLink>
      <RouterLink to="/profile">
        <span class="bn-icon">👤</span>
        <span>我的</span>
      </RouterLink>
    </nav>
  </div>
</template>
