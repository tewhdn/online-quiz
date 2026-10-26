<script setup lang="ts">
import { computed, watch } from 'vue';
import { NConfigProvider, NDialogProvider, NMessageProvider, darkTheme } from 'naive-ui';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useTheme } from './composables/useTheme';
import { getThemeOverrides } from './theme/naive';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { isDark } = useTheme();

const naiveTheme = computed(() => (isDark.value ? darkTheme : null));
const themeOverrides = computed(() => getThemeOverrides(isDark.value));

// 会话过期或被禁用时，受保护页面立即回到登录页
watch(
  () => auth.user,
  (user) => {
    if (!user && route.meta.requiresAuth) {
      router.replace({ name: 'login', query: { redirect: route.fullPath } });
    }
  },
);
</script>

<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <NMessageProvider placement="top" :max="3">
      <NDialogProvider>
        <RouterView />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
