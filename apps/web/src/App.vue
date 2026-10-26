<script setup lang="ts">
import { watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import ToastStack from './components/ToastStack.vue';
import { useAuthStore } from './stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

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
  <RouterView />
  <ToastStack />
</template>
