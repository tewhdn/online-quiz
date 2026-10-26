<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { examApi } from '../../api';
import type { ExamDetail } from '../../types';
import { formatDateTime, formatDuration, statusLabel } from '../../utils/format';
import LoadingBlock from '../../components/LoadingBlock.vue';
import { useToast } from '../../composables/useToast';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const detail = ref<ExamDetail | null>(null);
const loading = ref(true);
const error = ref('');
const starting = ref(false);

const examId = computed(() => String(route.params.id ?? ''));

const openAttempt = computed(() => detail.value?.attempts.find((item) => item.status === 'in_progress') ?? null);
const finishedAttempts = computed(() => detail.value?.attempts.filter((item) => item.status !== 'in_progress') ?? []);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    detail.value = (await examApi.detail(examId.value)).data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function start(): Promise<void> {
  starting.value = true;
  error.value = '';
  try {
    if (openAttempt.value) {
      await router.push(`/exam-attempts/${openAttempt.value.id}`);
      return;
    }
    const paper = (await examApi.start(examId.value)).data;
    await router.push(`/exam-attempts/${paper.attempt.id}`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '开始考试失败';
    toast.error(error.value);
  } finally {
    starting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack page-narrow">
    <div class="row-between">
      <RouterLink class="btn btn-ghost btn-sm" to="/exams">← 返回考试列表</RouterLink>
      <button class="btn btn-sm btn-ghost" @click="load">刷新</button>
    </div>

    <LoadingBlock v-if="loading" text="正在加载考试信息…" />

    <div v-else-if="error && !detail" class="card">
      <div class="error-box">{{ error }}</div>
      <RouterLink class="btn btn-primary" style="margin-top: 14px" to="/exams">返回考试列表</RouterLink>
    </div>

    <template v-else-if="detail">
      <section class="card">
        <h1>{{ detail.exam.title }}</h1>
        <p class="muted" style="margin-top: 8px; white-space: pre-wrap">{{ detail.exam.description || '暂无考试说明' }}</p>
        <div class="grid grid-4" style="margin-top: 18px">
          <div><div class="tiny muted">题目数量</div><div class="strong">{{ detail.exam.totalQuestions }} 题</div></div>
          <div><div class="tiny muted">总分</div><div class="strong">{{ detail.exam.totalScore }} 分</div></div>
          <div><div class="tiny muted">考试时长</div><div class="strong">{{ detail.exam.durationMinutes }} 分钟</div></div>
          <div><div class="tiny muted">允许重复</div><div class="strong">{{ detail.exam.allowRetake ? '是' : '否' }}</div></div>
        </div>

        <div class="divider" />
        <div class="small" style="line-height: 1.8">
          <div>开放时间：{{ detail.exam.startAt ? formatDateTime(detail.exam.startAt) : '不限' }} ~ {{ detail.exam.endAt ? formatDateTime(detail.exam.endAt) : '不限' }}</div>
          <div>解析查看：{{ detail.exam.allowReview === 'never' ? '交卷后也不展示' : detail.exam.allowReview === 'after_submit' ? '交卷后展示' : '考试结束后展示' }}</div>
          <div>提前交卷：{{ detail.exam.allowEarlySubmit ? '允许' : '不允许，到时自动交卷' }}</div>
          <div v-if="detail.exam.typeCounts" class="row" style="gap: 8px; margin-top: 8px">
            <span class="badge">单选 {{ detail.exam.typeCounts.single }}</span>
            <span class="badge">多选 {{ detail.exam.typeCounts.multiple }}</span>
            <span class="badge">判断 {{ detail.exam.typeCounts.boolean }}</span>
          </div>
        </div>

        <div v-if="detail.blockedReason" class="notice-box" style="margin-top: 16px">{{ detail.blockedReason }}</div>
        <div v-if="error" class="error-box" style="margin-top: 16px">{{ error }}</div>

        <div class="row" style="margin-top: 20px">
          <button v-if="openAttempt" class="btn btn-primary btn-lg" :disabled="starting" @click="start">
            继续未完成的考试（已进行 {{ formatDuration(Math.max(0, Math.floor((detail.serverTime - openAttempt.startedAt) / 1000))) }}）
          </button>
          <button v-else class="btn btn-primary btn-lg" :disabled="starting || !detail.canStart" @click="start">
            <span v-if="starting" class="spinner" />
            {{ starting ? '正在生成试卷…' : '开始考试' }}
          </button>
          <span class="tiny muted">开始后计时立即生效，请确保网络稳定</span>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>我的考试记录</h2></div>
        <div v-if="finishedAttempts.length === 0" class="muted small">还没有完成记录</div>
        <div v-for="attempt in finishedAttempts" :key="attempt.id" class="list-item">
          <div class="li-main">
            <div class="strong">得分 {{ attempt.score ?? 0 }} / {{ attempt.totalScore }}</div>
            <div class="tiny muted">交卷时间：{{ formatDateTime(attempt.submittedAt) }} · 状态：{{ statusLabel(attempt.status) }}</div>
          </div>
          <RouterLink class="btn btn-sm btn-ghost" :to="`/exam-attempts/${attempt.id}/result`">查看分析</RouterLink>
        </div>
      </section>
    </template>
  </div>
</template>
