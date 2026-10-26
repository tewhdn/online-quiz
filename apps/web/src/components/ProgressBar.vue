<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ value: number; max?: number; label?: string }>(), { max: 100, label: '' });
const percent = computed(() => {
  if (props.max <= 0) return 0;
  return Math.min(100, Math.max(0, (props.value / props.max) * 100));
});
</script>

<template>
  <div>
    <div v-if="label" class="row-between tiny muted" style="margin-bottom: 6px">
      <span>{{ label }}</span>
      <span>{{ Math.round(percent) }}%</span>
    </div>
    <div class="progress" role="progressbar" :aria-valuenow="Math.round(percent)" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${percent}%` }" />
    </div>
  </div>
</template>
