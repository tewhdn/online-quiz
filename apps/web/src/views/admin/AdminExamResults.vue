<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { adminApi } from '../../api';
import type { ExamResultRow, ExamSummary } from '../../types';
import { formatDateTime, formatDuration } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';

const route = useRoute();
const toast = useToast();
const examId = computed(() => String(route.params.id ?? ''));
const exam = ref<ExamSummary | null>(null);
const results = ref<ExamResultRow[]>([]);
const loading = ref(true);
const error = ref('');
const exporting = ref(false);

const average = computed(() => {
  if (results.value.length === 0) return 0;
  return Math.round((results.value.reduce((sum, item) => sum + item.score, 0) / results.value.length) * 10) / 10;
});
const best = computed(() => (results.value.length > 0 ? Math.max(...results.value.map((item) => item.score)) : 0));

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = (await adminApi.examResults(examId.value)).data;
    exam.value = data.exam;
    results.value = data.results;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function exportCsv(): Promise<void> {
  exporting.value = true;
  try {
    await adminApi.exportExamResults(examId.value);
    toast.success('成绩已导出');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="row-between">
      <RouterLink class="btn btn-ghost btn-sm" to="/admin/exams">← 返回考试管理</RouterLink>
      <button class="btn btn-soft" :disabled="exporting || results.length === 0" @click="exportCsv">
        {{ exporting ? '导出中…' : '导出 CSV' }}
      </button>
    </div>

    <LoadingBlock v-if="loading" text="正在加载成绩…" />
    <div v-else-if="error" class="error-box">{{ error }}</div>

    <template v-else>
      <section class="card">
        <h1>{{ exam?.title ?? '考试成绩' }}</h1>
        <p class="muted small" style="margin-top: 6px">
          共 {{ results.length }} 份已交卷成绩 · 平均分 {{ average }} · 最高分 {{ best }}
        </p>
      </section>

      <section class="card">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>排名</th><th>用户</th><th>得分</th><th>正确</th><th>错误</th><th>未答</th><th>用时</th><th>交卷时间</th><th>方式</th></tr></thead>
            <tbody>
              <tr v-for="(item, index) in results" :key="item.attemptId">
                <td>{{ index + 1 }}</td>
                <td><strong>{{ item.username }}</strong></td>
                <td><strong>{{ item.score }}</strong> / {{ item.totalScore }}</td>
                <td>{{ item.correctCount }}</td>
                <td>{{ item.wrongCount }}</td>
                <td>{{ item.unansweredCount }}</td>
                <td>{{ formatDuration(item.durationSeconds) }}</td>
                <td class="small muted">{{ formatDateTime(item.submittedAt) }}</td>
                <td>
                  <span class="badge" :class="item.autoSubmitted ? 'badge-warning' : ''">{{ item.autoSubmitted ? '自动' : '手动' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="results.length === 0" class="empty">
          <div class="empty-icon">📭</div>
          <h3>还没有成绩记录</h3>
          <p class="small">用户完成考试后成绩会显示在这里</p>
        </div>
      </section>
    </template>
  </div>
</template>
