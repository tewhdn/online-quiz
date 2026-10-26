<script setup lang="ts">
import { Star } from '@lucide/vue';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { favoriteApi, questionApi, practiceApi } from '../../api';
import type { FavoriteItem } from '../../types';
import { difficultyLabel, formatRelative, typeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import EmptyState from '../../components/EmptyState.vue';
import PaginationBar from '../../components/PaginationBar.vue';

const router = useRouter();
const toast = useToast();

const items = ref<FavoriteItem[]>([]);
const loading = ref(true);
const error = ref('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 10;
const removing = ref<string | null>(null);
const starting = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await favoriteApi.list({ page: page.value, pageSize });
    items.value = result.data;
    total.value = result.pagination?.total ?? result.data.length;
    totalPages.value = result.pagination?.totalPages ?? 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function remove(item: FavoriteItem): Promise<void> {
  removing.value = item.id;
  try {
    await questionApi.toggleFavorite(item.question.id, false);
    toast.success('已取消收藏');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败');
  } finally {
    removing.value = null;
  }
}

async function startPractice(): Promise<void> {
  starting.value = true;
  try {
    const result = await practiceApi.start({ mode: 'favorite', count: 10 });
    await router.push(`/practice/session/${result.data.sessionId}`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '开始收藏练习失败');
  } finally {
    starting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div>
        <h1>我的收藏</h1>
        <p>收藏重点题目，随时集中复习</p>
      </div>
      <button class="btn btn-primary" :disabled="starting" @click="startPractice">
        <span v-if="starting" class="spinner" />
        练习收藏题
      </button>
    </div>

    <div v-if="error" class="error-box">
      {{ error }} <button class="btn btn-sm btn-ghost" style="margin-left: 8px" @click="load">重试</button>
    </div>
    <LoadingBlock v-if="loading" text="正在加载收藏…" />

    <template v-else>
      <EmptyState v-if="items.length === 0" title="还没有收藏题目" description="答题时点击「收藏」，题目会出现在这里" :icon="Star">
        <RouterLink class="btn btn-primary btn-sm" to="/practice">去刷题</RouterLink>
      </EmptyState>

      <section v-else class="card list-panel">
        <article v-for="item in items" :key="item.id" class="list-question">
          <div class="question-meta">
            <span class="badge badge-primary">{{ typeLabel(item.question.type) }}</span>
            <span class="badge">难度 {{ item.question.difficulty }} · {{ difficultyLabel(item.question.difficulty) }}</span>
            <span class="badge">{{ item.question.subject }}</span>
            <span class="tiny muted">收藏于 {{ formatRelative(item.createdAt) }}</span>
          </div>
          <p class="question-stem" style="font-size: 1rem">{{ item.question.stem }}</p>
          <div class="row" style="margin-top: 12px; justify-content: flex-end">
            <button class="btn btn-sm btn-ghost" :disabled="removing === item.id" @click="remove(item)">取消收藏</button>
            <RouterLink class="btn btn-sm btn-soft" to="/practice">练习同类题</RouterLink>
          </div>
        </article>
      </section>

      <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
    </template>
  </div>
</template>
