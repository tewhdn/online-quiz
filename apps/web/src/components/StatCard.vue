<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    hint?: string;
    tone?: 'default' | 'success' | 'danger' | 'warning';
  }>(),
  { tone: 'default', hint: '' },
);
</script>

<template>
  <div class="card stat-card" :class="tone">
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value">{{ value }}</div>
    <div v-if="hint" class="stat-hint">{{ hint }}</div>
  </div>
</template>
