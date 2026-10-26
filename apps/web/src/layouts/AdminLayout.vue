<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { NButton, NDropdown, NIcon, NMenu, NTag, type DropdownOption, type MenuOption } from 'naive-ui';
import {
  CalendarDays,
  House,
  Library,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  ScanSearch,
  ScrollText,
  Settings,
  Sparkles,
  Ticket,
  Upload,
  Users,
} from '@lucide/vue';
import BrandMark from '../components/BrandMark.vue';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../composables/useToast';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const drawerOpen = ref(false);

const groups = [
  { title: '概览', items: [{ to: '/admin', label: '仪表盘', icon: LayoutDashboard }] },
  {
    title: '用户与权限',
    items: [
      { to: '/admin/users', label: '用户管理', icon: Users },
      { to: '/admin/invites', label: '邀请码', icon: Ticket },
    ],
  },
  {
    title: '题库与考试',
    items: [
      { to: '/admin/questions', label: '题库管理', icon: Library },
      { to: '/admin/import', label: '批量导入', icon: Upload },
      { to: '/admin/exams', label: '考试管理', icon: CalendarDays },
      { to: '/admin/announcements', label: '公告管理', icon: Megaphone },
    ],
  },
  {
    title: 'AI 出题',
    items: [
      { to: '/admin/ai', label: 'AI 出题中心', icon: Sparkles },
      { to: '/admin/ai/review', label: 'AI 题目审核', icon: ScanSearch },
    ],
  },
  {
    title: '系统',
    items: [
      { to: '/admin/logs', label: '操作日志', icon: ScrollText },
      { to: '/admin/settings', label: '系统设置', icon: Settings },
    ],
  },
];

const menuOptions = computed<MenuOption[]>(() =>
  groups.map((group) => ({
    type: 'group',
    label: group.title,
    key: `group-${group.title}`,
    children: group.items.map((item) => ({
      label: item.label,
      key: item.to,
      icon: () => h(NIcon, null, { default: () => h(item.icon) }),
    })),
  })),
);

const activeKey = computed(() => route.path);
const pageTitle = computed(() => (route.meta.title as string | undefined) ?? '管理后台');

const userOptions = computed<DropdownOption[]>(() => [
  { label: '返回学习端', key: 'site', icon: () => h(NIcon, null, { default: () => h(House) }) },
  { type: 'divider', key: 'divider' },
  { label: '退出登录', key: 'logout', icon: () => h(NIcon, null, { default: () => h(LogOut) }) },
]);

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  },
);

async function onMenuSelect(key: string): Promise<void> {
  if (key !== route.path) await router.push(key);
}

async function onUserSelect(key: string | number): Promise<void> {
  if (key === 'site') await router.push('/');
  else if (key === 'logout') await logout();
}

async function logout(): Promise<void> {
  await auth.logout();
  toast.success('已退出登录');
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="admin-shell">
    <div v-if="drawerOpen" class="admin-overlay" @click="drawerOpen = false" />

    <aside class="admin-sidebar" :class="{ open: drawerOpen }" aria-label="管理导航">
      <RouterLink class="brand admin-brand" to="/admin">
        <BrandMark />
        <span class="admin-brand-text">
          <strong>管理后台</strong>
          <small>在线答题系统</small>
        </span>
      </RouterLink>

      <NMenu
        class="admin-menu"
        :options="menuOptions"
        :value="activeKey"
        :indent="14"
        :root-indent="6"
        @update:value="onMenuSelect"
      />

      <div class="admin-sidebar-foot">
        <RouterLink class="admin-side-link" to="/">
          <NIcon :size="17"><House /></NIcon>
          <span>返回学习端</span>
        </RouterLink>
        <button class="admin-side-link" type="button" @click="logout">
          <NIcon :size="17"><LogOut /></NIcon>
          <span>退出登录</span>
        </button>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <div class="admin-topbar-title">
          <NButton class="admin-mobile-toggle" quaternary circle @click="drawerOpen = true">
            <template #icon><NIcon :size="18"><MenuIcon /></NIcon></template>
          </NButton>
          <strong>{{ pageTitle }}</strong>
        </div>
        <div class="admin-topbar-user">
          <NTag size="small" :bordered="false" type="success">管理员</NTag>
          <NDropdown :options="userOptions" trigger="click" @select="onUserSelect">
            <button class="admin-user" type="button">{{ auth.displayName }}</button>
          </NDropdown>
        </div>
      </header>
      <div class="admin-content">
        <RouterView />
      </div>
    </div>
  </div>
</template>
