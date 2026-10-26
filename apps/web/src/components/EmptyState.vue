<script setup lang="ts">
import { computed, type Component } from 'vue';
import { NEmpty } from 'naive-ui';
import { Inbox } from '@lucide/vue';

const props = withDefaults(defineProps<{ title: string; description?: string; icon?: Component }>(), {
  description: '',
});
const icon = computed(() => props.icon ?? Inbox);
</script>

<template>
  <NEmpty :description="title" class="empty-state">
    <template #icon>
      <component :is="icon" :size="28" :stroke-width="1.7" />
    </template>
    <template #extra>
      <p v-if="description" class="small muted empty-description">{{ description }}</p>
      <slot />
    </template>
  </NEmpty>
</template>
