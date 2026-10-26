<script setup lang="ts">
import BrandMark from '../components/BrandMark.vue';
import { RouterView } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
</script>

<template>
  <div class="auth-shell">
    <div class="auth-card card">
      <div class="auth-brand">
        <BrandMark />
        <div>
          <div class="auth-title">{{ auth.siteName }}</div>
          <div class="auth-sub">刷题 · 模拟考试 · 错题复习</div>
        </div>
      </div>
      <RouterView />
    </div>
  </div>
</template>
