<script setup lang="ts">
import { NSpin } from 'naive-ui';

withDefaults(defineProps<{ text?: string }>(), { text: '加载中…' });
</script>

<template>
  <NSpin size="small" :show="true">
    <div class="loading-block">{{ text }}</div>
  </NSpin>
</template>
