<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../composables/useToast';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const drawerOpen = ref(false);

const groups = [
  {
    title: '概览',
    items: [{ to: '/admin', label: '仪表盘', icon: '📊', exact: true }],
  },
  {
    title: '用户与权限',
    items: [
      { to: '/admin/users', label: '用户管理', icon: '👥' },
      { to: '/admin/invites', label: '邀请码', icon: '🎟️' },
    ],
  },
  {
    title: '题库与考试',
    items: [
      { to: '/admin/questions', label: '题库管理', icon: '📚', exact: true },
      { to: '/admin/import', label: '批量导入', icon: '📥' },
      { to: '/admin/exams', label: '考试管理', icon: '🗓️' },
      { to: '/admin/announcements', label: '公告管理', icon: '📢' },
    ],
  },
  {
    title: 'AI 出题',
    items: [
      { to: '/admin/ai', label: 'AI 出题中心', icon: '✨' },
      { to: '/admin/ai/review', label: 'AI 题目审核', icon: '🔍' },
    ],
  },
  {
    title: '系统',
    items: [
      { to: '/admin/logs', label: '操作日志', icon: '📜' },
      { to: '/admin/settings', label: '系统设置', icon: '⚙️' },
    ],
  },
];

const pageTitle = computed(() => (route.meta.title as string | undefined) ?? '管理后台');

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  },
);

async function logout(): Promise<void> {
  await auth.logout();
  toast.success('已退出登录');
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar" :class="{ open: drawerOpen }" aria-label="管理导航">
      <RouterLink class="brand" to="/admin">
        <span class="brand-mark">答</span>
        <span class="brand-text">管理后台</span>
      </RouterLink>
      <nav class="admin-nav">
        <div v-for="group in groups" :key="group.title">
          <div class="nav-group">{{ group.title }}</div>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            :class="{ 'router-link-active': item.exact ? route.path === item.to : undefined }"
            :exact-active-class="item.exact ? 'router-link-active' : ''"
          >
            <span>{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>
        <div class="nav-group">其他</div>
        <RouterLink to="/">🏠 返回学习端</RouterLink>
        <a href="#" @click.prevent="logout">🚪 退出登录</a>
      </nav>
    </aside>

    <div v-if="drawerOpen" class="admin-overlay" @click="drawerOpen = false" />

    <div class="admin-main">
      <header class="admin-topbar">
        <div class="row" style="gap: 10px">
          <button class="btn btn-icon btn-ghost admin-mobile-toggle" type="button" @click="drawerOpen = true">☰</button>
          <strong>{{ pageTitle }}</strong>
        </div>
        <div class="row" style="gap: 8px">
          <span class="badge badge-primary">管理员</span>
          <span class="small muted">{{ auth.displayName }}</span>
        </div>
      </header>
      <div class="admin-content">
        <RouterView />
      </div>
    </div>
  </div>
</template>
