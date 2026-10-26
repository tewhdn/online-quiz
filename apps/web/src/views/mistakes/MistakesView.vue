<script setup lang="ts">
import { BookX } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { mistakeApi, practiceApi } from '../../api';
import type { MistakeItem } from '../../types';
import { difficultyLabel, formatPercent, formatRelative, typeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import EmptyState from '../../components/EmptyState.vue';
import PaginationBar from '../../components/PaginationBar.vue';

const router = useRouter();
const toast = useToast();

const items = ref<MistakeItem[]>([]);
const status = ref<'pending' | 'mastered' | 'all'>('pending');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 10;
const loading = ref(true);
const error = ref('');
const acting = ref<string | null>(null);
const starting = ref(false);

const pendingCount = computed(() => items.value.filter((item) => !item.mastered).length);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await mistakeApi.list({ status: status.value === 'all' ? undefined : status.value, page: page.value, pageSize });
    items.value = result.data;
    total.value = result.pagination?.total ?? result.data.length;
    totalPages.value = result.pagination?.totalPages ?? 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function toggleMastered(item: MistakeItem): Promise<void> {
  acting.value = item.id;
  try {
    await mistakeApi.mastered(item.id, !item.mastered);
    toast.success(!item.mastered ? '已标记为掌握' : '已重新加入待复习');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败');
  } finally {
    acting.value = null;
  }
}

async function startPractice(): Promise<void> {
  starting.value = true;
  try {
    const result = await practiceApi.start({ mode: 'mistake', count: 10 });
    await router.push(`/practice/session/${result.data.sessionId}`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '开始错题练习失败');
  } finally {
    starting.value = false;
  }
}

function changeTab(next: 'pending' | 'mastered' | 'all'): void {
  status.value = next;
  page.value = 1;
  void load();
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div>
        <h1>错题本</h1>
        <p>答错的题目会自动收录，答对不会移出，需手动标记掌握</p>
      </div>
      <button class="btn btn-primary" :disabled="starting" @click="startPractice">
        <span v-if="starting" class="spinner" />
        重练错题
      </button>
    </div>

    <div class="row-between">
      <div class="tabs">
        <button type="button" :class="{ active: status === 'pending' }" @click="changeTab('pending')">待复习</button>
        <button type="button" :class="{ active: status === 'mastered' }" @click="changeTab('mastered')">已掌握</button>
        <button type="button" :class="{ active: status === 'all' }" @click="changeTab('all')">全部</button>
      </div>
      <span class="tiny muted">共 {{ total }} 条记录 · 本页待复习 {{ pendingCount }}</span>
    </div>

    <div v-if="error" class="error-box">
      {{ error }} <button class="btn btn-sm btn-ghost" style="margin-left: 8px" @click="load">重试</button>
    </div>
    <LoadingBlock v-if="loading" text="正在加载错题…" />

    <template v-else>
      <EmptyState
        v-if="items.length === 0"
        :title="status === 'pending' ? '没有待复习的错题' : '暂无错题记录'"
        :description="status === 'pending' ? '继续保持，或去做几组练习检验掌握情况' : '做错的题目会自动出现在这里'"
        :icon="BookX"
      >
        <RouterLink class="btn btn-primary btn-sm" to="/practice">去刷题</RouterLink>
      </EmptyState>

      <section v-else class="card list-panel">
        <article v-for="item in items" :key="item.id" class="list-question">
          <div class="question-meta">
            <span class="badge badge-primary">{{ typeLabel(item.question.type) }}</span>
            <span class="badge">难度 {{ item.question.difficulty }} · {{ difficultyLabel(item.question.difficulty) }}</span>
            <span class="badge">{{ item.question.subject }}</span>
            <span v-if="item.mastered" class="badge badge-success">已掌握</span>
            <span v-else class="badge badge-warning">待复习</span>
          </div>
          <p class="question-stem" style="font-size: 1rem">{{ item.question.stem }}</p>
          <div class="row tiny muted" style="gap: 14px; margin-top: 10px">
            <span>答错 {{ item.wrongCount }} 次</span>
            <span>累计作答 {{ item.attemptCount }} 次</span>
            <span>最近答错：{{ formatRelative(item.lastWrongAt) }}</span>
            <span v-if="item.question.category">分类：{{ item.question.category }}</span>
          </div>
          <div class="row" style="margin-top: 14px; justify-content: flex-end">
            <button class="btn btn-sm btn-ghost" :disabled="acting === item.id" @click="toggleMastered(item)">
              {{ item.mastered ? '取消掌握' : '标记已掌握' }}
            </button>
            <RouterLink class="btn btn-sm btn-soft" :to="`/practice`">专项练习</RouterLink>
          </div>
        </article>
      </section>

      <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
    </template>
  </div>
</template>
