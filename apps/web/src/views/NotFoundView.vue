<script setup lang="ts">
import { Compass } from '@lucide/vue';
</script>

<template>
  <div class="auth-shell">
    <div class="card auth-card" style="text-align: center">
      <Compass :size="32" :stroke-width="1.6" style="color: var(--muted)" />
      <h1 style="margin-top: 10px">页面不存在</h1>
      <p class="muted small" style="margin-top: 6px">你访问的页面可能已被移动或删除。</p>
      <RouterLink class="btn btn-primary" style="margin-top: 18px" to="/">返回首页</RouterLink>
    </div>
  </div>
</template>
