<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { examApi } from '../../api';
import type { AttemptSummary, ExamSummary } from '../../types';
import { formatDateTime } from '../../utils/format';
import LoadingBlock from '../../components/LoadingBlock.vue';
import EmptyState from '../../components/EmptyState.vue';

const exams = ref<ExamSummary[]>([]);
const attempts = ref<AttemptSummary[]>([]);
const loading = ref(true);
const error = ref('');

function examState(exam: ExamSummary): { label: string; class: string; open: boolean } {
  const now = Date.now();
  if (exam.startAt && now < exam.startAt) return { label: '未开放', class: 'badge-warning', open: false };
  if (exam.endAt && now > exam.endAt) return { label: '已结束', class: 'badge-danger', open: false };
  return { label: '进行中', class: 'badge-success', open: true };
}

const bestOf = computed(() => {
  const map: Record<string, number> = {};
  for (const attempt of attempts.value) {
    if (attempt.status === 'submitted' && attempt.score !== null) {
      map[attempt.examId] = Math.max(map[attempt.examId] ?? 0, attempt.score);
    }
  }
  return map;
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [examResult, attemptResult] = await Promise.all([examApi.list({ pageSize: 50 }), examApi.attempts()]);
    exams.value = examResult.data;
    attempts.value = attemptResult.data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div>
        <h1>模拟考试</h1>
        <p>在限定时间内完成试卷，成绩与解析由后端判分</p>
      </div>
      <RouterLink class="btn btn-ghost" to="/">返回首页</RouterLink>
    </div>

    <div v-if="error" class="error-box">
      {{ error }} <button class="btn btn-sm btn-ghost" style="margin-left: 8px" @click="load">重试</button>
    </div>
    <LoadingBlock v-if="loading" text="正在加载考试列表…" />

    <template v-else>
      <EmptyState v-if="exams.length === 0" title="暂无已发布的模拟考试" description="请联系管理员创建考试" icon="🗓️" />
      <div v-else class="grid grid-2">
        <RouterLink v-for="exam in exams" :key="exam.id" :to="`/exams/${exam.id}`" class="card card-hover exam-card">
          <div class="row-between">
            <h2 class="truncate">{{ exam.title }}</h2>
            <span class="badge" :class="examState(exam).class">{{ examState(exam).label }}</span>
          </div>
          <p class="small muted" style="margin-top: 6px; min-height: 42px">{{ exam.description || '暂无考试说明' }}</p>
          <div class="row small muted" style="gap: 14px; margin-top: 10px">
            <span>📝 {{ exam.totalQuestions }} 题</span>
            <span>⏱️ {{ exam.durationMinutes }} 分钟</span>
            <span>💯 {{ exam.totalScore }} 分</span>
            <span>👥 {{ exam.attemptCount }} 人次</span>
          </div>
          <div class="row-between" style="margin-top: 14px">
            <span class="tiny muted">
              <template v-if="exam.startAt || exam.endAt">
                {{ exam.startAt ? formatDateTime(exam.startAt) : '不限' }} ~ {{ exam.endAt ? formatDateTime(exam.endAt) : '不限' }}
              </template>
              <template v-else>长期开放</template>
            </span>
            <span v-if="bestOf[exam.id] !== undefined" class="badge badge-primary">最高 {{ bestOf[exam.id] }} 分</span>
          </div>
        </RouterLink>
      </div>

      <section v-if="attempts.length > 0" class="card">
        <div class="card-header"><h2>我的考试记录</h2></div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>考试</th><th>状态</th><th>得分</th><th>用时</th><th>交卷时间</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="attempt in attempts" :key="attempt.id">
                <td>{{ attempt.examTitle ?? attempt.examId }}</td>
                <td>
                  <span class="badge" :class="attempt.status === 'in_progress' ? 'badge-warning' : 'badge-success'">
                    {{ attempt.status === 'in_progress' ? '进行中' : '已交卷' }}
                  </span>
                </td>
                <td>{{ attempt.score ?? '—' }} / {{ attempt.totalScore }}</td>
                <td>{{ attempt.durationSeconds ? `${Math.round(attempt.durationSeconds / 60)} 分钟` : '—' }}</td>
                <td class="small muted">{{ formatDateTime(attempt.submittedAt) }}</td>
                <td class="actions">
                  <RouterLink
                    v-if="attempt.status === 'in_progress'"
                    class="btn btn-sm btn-soft"
                    :to="`/exam-attempts/${attempt.id}`"
                  >
                    继续考试
                  </RouterLink>
                  <RouterLink v-else class="btn btn-sm btn-ghost" :to="`/exam-attempts/${attempt.id}/result`">成绩分析</RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p v-if="attempts.length > 0" class="tiny muted">共 {{ attempts.length }} 次考试记录，已完成 {{ attempts.filter((item) => item.status === 'submitted').length }} 次。</p>
    </template>
  </div>
</template>

<style scoped>
.exam-card {
  display: flex;
  flex-direction: column;
  color: var(--text);
  text-decoration: none;
}
.exam-card:hover {
  text-decoration: none;
}
</style>
