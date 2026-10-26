<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ page: number; totalPages: number; total: number; pageSize?: number }>();
const emit = defineEmits<{ (event: 'change', page: number): void }>();

const pages = computed(() => {
  const result: number[] = [];
  const start = Math.max(1, props.page - 2);
  const end = Math.min(props.totalPages, start + 4);
  for (let i = start; i <= end; i += 1) result.push(i);
  return result;
});

function go(page: number): void {
  if (page < 1 || page > props.totalPages || page === props.page) return;
  emit('change', page);
}
</script>

<template>
  <div v-if="total > 0" class="pagination">
    <span>共 {{ total }} 条 · 第 {{ page }} / {{ totalPages }} 页</span>
    <div class="pages">
      <button class="btn btn-sm btn-ghost" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
      <button
        v-for="item in pages"
        :key="item"
        class="btn btn-sm"
        :class="item === page ? 'btn-primary' : 'btn-ghost'"
        @click="go(item)"
      >
        {{ item }}
      </button>
      <button class="btn btn-sm btn-ghost" :disabled="page >= totalPages" @click="go(page + 1)">下一页</button>
    </div>
  </div>
</template>
