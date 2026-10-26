<script setup lang="ts">
import { computed } from 'vue';
import { NProgress } from 'naive-ui';

const props = withDefaults(defineProps<{ value: number; max?: number; label?: string }>(), { max: 100, label: '' });
const percent = computed(() => {
  if (props.max <= 0) return 0;
  return Math.min(100, Math.max(0, (props.value / props.max) * 100));
});
</script>

<template>
  <div class="progress-block">
    <div v-if="label" class="row-between tiny muted" style="margin-bottom: 6px">
      <span>{{ label }}</span>
      <span>{{ Math.round(percent) }}%</span>
    </div>
    <NProgress type="line" :percentage="percent" :height="6" :show-indicator="false" />
  </div>
</template>
