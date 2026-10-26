<script setup lang="ts">
withDefaults(defineProps<{ title: string; description?: string; icon?: string }>(), {
  description: '',
  icon: '🗂️',
});
</script>

<template>
  <div class="empty">
    <div class="empty-icon">{{ icon }}</div>
    <h3>{{ title }}</h3>
    <p v-if="description" class="small">{{ description }}</p>
    <slot />
  </div>
</template>
