<script setup lang="ts">
import { computed, h } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { NDropdown, NButton, NIcon, type DropdownOption } from 'naive-ui';
import {
  BookX,
  ChevronDown,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  PencilLine,
  Star,
  Sun,
  User,
} from '@lucide/vue';
import BrandMark from '../components/BrandMark.vue';
import { useAuthStore } from '../stores/auth';
import { useTheme } from '../composables/useTheme';
import { useToast } from '../composables/useToast';

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();
const theme = useTheme();

const navLinks = [
  { to: '/', label: '首页', short: '首页', icon: Home },
  { to: '/practice', label: '刷题', short: '刷题', icon: PencilLine },
  { to: '/exams', label: '模拟考试', short: '考试', icon: FileText },
  { to: '/mistakes', label: '错题本', short: '错题', icon: BookX },
  { to: '/favorites', label: '收藏', short: '收藏', icon: Star },
];

const themeMode = computed(() => theme.mode.value);
const themeIcon = computed(() => (themeMode.value === 'dark' ? Sun : themeMode.value === 'light' ? Moon : Monitor));
const themeTitle = computed(() =>
  themeMode.value === 'dark' ? '切换为浅色' : themeMode.value === 'light' ? '切换为跟随系统' : '切换为深色',
);

const userOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [
    { label: '个人中心', key: 'profile', icon: () => h(NIcon, null, { default: () => h(User) }) },
  ];
  if (auth.isAdmin) {
    options.push({ label: '管理后台', key: 'admin', icon: () => h(NIcon, null, { default: () => h(LayoutDashboard) }) });
  }
  options.push(
    { type: 'divider', key: 'divider' },
    { label: '退出登录', key: 'logout', icon: () => h(NIcon, null, { default: () => h(LogOut) }) },
  );
  return options;
});

async function onUserSelect(key: string | number): Promise<void> {
  if (key === 'profile') await router.push('/profile');
  else if (key === 'admin') await router.push('/admin');
  else if (key === 'logout') await logout();
}

async function logout(): Promise<void> {
  await auth.logout();
  toast.success('已退出登录');
  await router.replace({ name: 'login' });
}

const initials = () => (auth.displayName || 'U').slice(0, 1).toUpperCase();
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="container topbar-inner">
        <RouterLink class="brand" to="/">
          <BrandMark />
          <span class="brand-text">{{ auth.siteName }}</span>
        </RouterLink>

        <nav class="nav" aria-label="主导航">
          <RouterLink v-for="link in navLinks" :key="link.to" :to="link.to" class="nav-link">
            <NIcon :size="17" :stroke-width="1.8"><component :is="link.icon" /></NIcon>
            <span>{{ link.label }}</span>
          </RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" class="nav-link">
            <NIcon :size="17" :stroke-width="1.8"><LayoutDashboard /></NIcon>
            <span>管理后台</span>
          </RouterLink>
        </nav>

        <div class="topbar-actions">
          <NButton quaternary circle :title="themeTitle" @click="theme.toggle()">
            <template #icon>
              <NIcon :size="18"><component :is="themeIcon" /></NIcon>
            </template>
          </NButton>

          <NDropdown :options="userOptions" trigger="click" @select="onUserSelect">
            <button class="user-chip" type="button" aria-label="用户菜单">
              <span class="avatar">{{ initials() }}</span>
              <span class="user-name">{{ auth.displayName }}</span>
              <NIcon :size="14" :depth="3"><ChevronDown /></NIcon>
            </button>
          </NDropdown>
        </div>
      </div>
    </header>

    <main class="page">
      <div class="container">
        <RouterView />
      </div>
    </main>

    <nav class="bottom-nav" aria-label="移动端导航">
      <RouterLink v-for="link in navLinks" :key="link.to" :to="link.to">
        <NIcon :size="20" :stroke-width="1.8"><component :is="link.icon" /></NIcon>
        <span>{{ link.short }}</span>
      </RouterLink>
      <RouterLink to="/profile">
        <NIcon :size="20" :stroke-width="1.8"><User /></NIcon>
        <span>我的</span>
      </RouterLink>
    </nav>
  </div>
</template>
