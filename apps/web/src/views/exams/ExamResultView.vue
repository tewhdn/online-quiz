<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { examApi } from '../../api';
import type { AttemptResult } from '../../types';
import { answerText, formatDateTime, formatDuration, formatPercent, typeLabel } from '../../utils/format';
import LoadingBlock from '../../components/LoadingBlock.vue';
import QuestionOptions from '../../components/QuestionOptions.vue';

const route = useRoute();
const result = ref<AttemptResult | null>(null);
const loading = ref(true);
const error = ref('');
const showAll = ref(false);

const attemptId = computed(() => String(route.params.id ?? ''));
const scoreRate = computed(() => {
  if (!result.value) return 0;
  const { score, totalScore } = result.value.attempt;
  return totalScore > 0 ? Math.round((score / totalScore) * 10000) / 100 : 0;
});
const visibleQuestions = computed(() => {
  if (!result.value) return [];
  if (showAll.value) return result.value.questions;
  return result.value.questions.filter((item) => !item.isCorrect);
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    result.value = (await examApi.result(attemptId.value)).data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '成绩加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="row-between">
      <RouterLink class="btn btn-ghost btn-sm" to="/exams">← 返回考试列表</RouterLink>
      <button class="btn btn-sm btn-ghost" @click="load">刷新</button>
    </div>

    <LoadingBlock v-if="loading" text="正在计算成绩…" />
    <div v-else-if="error && !result" class="card">
      <div class="error-box">{{ error }}</div>
      <RouterLink class="btn btn-primary" style="margin-top: 14px" to="/exams">返回考试列表</RouterLink>
    </div>

    <template v-else-if="result">
      <section class="card score-hero">
        <div>
          <p class="tiny muted">{{ result.attempt.examTitle }}</p>
          <h1 style="margin-top: 6px">
            {{ result.attempt.score }} <span class="muted" style="font-size: 1rem">/ {{ result.attempt.totalScore }} 分</span>
          </h1>
          <p class="muted small" style="margin-top: 4px">
            得分率 {{ formatPercent(scoreRate) }} · 用时 {{ formatDuration(result.attempt.durationSeconds) }} ·
            {{ result.attempt.autoSubmitted ? '到时自动交卷' : '手动交卷' }}
          </p>
          <p class="tiny muted" style="margin-top: 4px">交卷时间：{{ formatDateTime(result.attempt.submittedAt) }}</p>
        </div>
        <div class="grid grid-3" style="flex: 1; min-width: 260px">
          <div class="mini-stat success"><span class="tiny muted">答对</span><strong>{{ result.attempt.correctCount }}</strong></div>
          <div class="mini-stat danger"><span class="tiny muted">答错</span><strong>{{ result.attempt.wrongCount }}</strong></div>
          <div class="mini-stat"><span class="tiny muted">未答</span><strong>{{ result.attempt.unansweredCount }}</strong></div>
        </div>
      </section>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-header"><h2>各题型得分</h2></div>
          <div v-for="(stat, type) in result.summary.byType" :key="type" class="list-item">
            <div class="li-main">
              <div class="strong">{{ typeLabel(String(type)) }}</div>
              <div class="tiny muted">答对 {{ stat.correct }} / {{ stat.total }} 题</div>
            </div>
            <div class="strong">{{ stat.score }} / {{ stat.maxScore }} 分</div>
          </div>
          <p v-if="Object.keys(result.summary.byType).length === 0" class="muted small">暂无题型数据</p>
        </section>

        <section class="card">
          <div class="card-header"><h2>知识点表现</h2></div>
          <div v-if="result.summary.knowledge.length === 0" class="muted small">题目未标注知识点</div>
          <div class="table-wrap" v-else>
            <table class="table" style="min-width: 100%">
              <thead><tr><th>知识点</th><th>正确 / 总数</th><th>正确率</th></tr></thead>
              <tbody>
                <tr v-for="item in result.summary.knowledge" :key="item.point">
                  <td>{{ item.point }}</td>
                  <td>{{ item.correct }} / {{ item.total }}</td>
                  <td>
                    <span class="badge" :class="item.accuracy >= 80 ? 'badge-success' : item.accuracy >= 60 ? 'badge-warning' : 'badge-danger'">
                      {{ formatPercent(item.accuracy, 0) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-header">
          <h2>题目回顾</h2>
          <span v-if="result.reviewAllowed" class="badge badge-success">可查看答案与解析</span>
          <span v-else class="badge badge-warning">本场考试不展示答案解析</span>
        </div>

        <p v-if="!result.reviewAllowed" class="muted small">根据考试设置，交卷后暂不展示正确答案与解析。</p>

        <div v-else class="stack" style="gap: 14px">
          <div class="row" style="gap: 8px">
            <div class="tabs">
              <button type="button" :class="{ active: !showAll }" @click="showAll = false">只看错题（{{ result.attempt.wrongCount }}）</button>
              <button type="button" :class="{ active: showAll }" @click="showAll = true">全部题目（{{ result.questions.length }}）</button>
            </div>
          </div>

          <div v-for="item in visibleQuestions" :key="item.examQuestionId" class="question-review">
            <div class="question-meta">
              <span class="badge badge-primary">{{ typeLabel(item.type) }}</span>
              <span class="badge">{{ item.score }} / {{ item.maxScore }} 分</span>
              <span class="badge" :class="item.isCorrect ? 'badge-success' : item.answered ? 'badge-danger' : 'badge-warning'">
                {{ item.isCorrect ? '正确' : item.answered ? '错误' : '未作答' }}
              </span>
              <span class="tiny muted">第 {{ item.position }} 题</span>
            </div>
            <p class="question-stem" style="font-size: 1rem">{{ item.stem }}</p>
            <QuestionOptions
              :options="item.options"
              :type="item.type"
              :model-value="item.userAnswer"
              disabled
              :result="item.correctAnswer ? { correctAnswer: item.correctAnswer, userAnswer: item.userAnswer, isCorrect: item.isCorrect } : null"
            />
            <div class="small" style="margin-top: 12px">
              <div>你的答案：<strong>{{ answerText(item.userAnswer, item.type) }}</strong></div>
              <div v-if="item.correctAnswer">正确答案：<strong>{{ answerText(item.correctAnswer, item.type) }}</strong></div>
              <p v-if="item.explanation" class="muted" style="margin-top: 8px; white-space: pre-wrap">{{ item.explanation }}</p>
            </div>
          </div>
          <p v-if="visibleQuestions.length === 0" class="muted small">太棒了，本次考试没有错题！</p>
        </div>
      </section>

      <div class="row" style="justify-content: center">
        <RouterLink class="btn btn-ghost" to="/exams">返回考试列表</RouterLink>
        <RouterLink class="btn btn-primary" to="/">回到首页</RouterLink>
      </div>
    </template>
  </div>
</template>

