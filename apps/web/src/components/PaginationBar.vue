<script setup lang="ts">
import { NPagination } from 'naive-ui';

withDefaults(defineProps<{ page: number; totalPages: number; total: number; pageSize?: number }>(), { pageSize: 20 });
const emit = defineEmits<{ (event: 'change', page: number): void }>();
</script>

<template>
  <div v-if="total > 0" class="pagination-bar">
    <span class="small muted">共 {{ total }} 条</span>
    <NPagination
      :page="page"
      :page-count="Math.max(1, totalPages)"
      :page-slot="5"
      @update:page="emit('change', $event)"
    />
  </div>
</template>
