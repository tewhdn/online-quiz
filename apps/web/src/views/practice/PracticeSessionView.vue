<script setup lang="ts">
import { CircleHelp } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { practiceApi, questionApi } from '../../api';
import { ApiClientError } from '../../api/client';
import type { PracticeSessionView } from '../../types';
import { answerText, difficultyLabel, modeLabel, typeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import { useAiPetStore } from '../../stores/aiPet';
import QuestionOptions from '../../components/QuestionOptions.vue';
import ProgressBar from '../../components/ProgressBar.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import LoadingBlock from '../../components/LoadingBlock.vue';
import EmptyState from '../../components/EmptyState.vue';
import { CircleCheck, CircleX, Star } from '@lucide/vue';

interface AnswerInfo {
  questionId: string;
  isCorrect: boolean;
  userAnswer: string[];
  correctAnswer: string[];
  explanation: string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();
const aiPet = useAiPetStore();

const view = ref<PracticeSessionView | null>(null);
const loading = ref(true);
const error = ref('');
const index = ref(0);
const selected = ref<string[]>([]);
const submitting = ref(false);
const answers = ref<Record<string, AnswerInfo>>({});
const favorites = ref<Record<string, boolean>>({});
const questionStartedAt = ref(Date.now());
const finishOpen = ref(false);
const finishing = ref(false);
const summary = ref<{ answeredCount: number; correctCount: number; totalQuestions: number; accuracy: number } | null>(null);

const sessionId = computed(() => String(route.params.id ?? ''));
const questions = computed(() => view.value?.questions ?? []);
const current = computed(() => questions.value[index.value] ?? null);
const currentAnswer = computed(() => (current.value ? answers.value[current.value.id] : undefined));
const answeredCount = computed(() => Object.keys(answers.value).length);
const totalCount = computed(() => questions.value.length || view.value?.session.totalQuestions || 0);
const isMultiple = computed(() => current.value?.type === 'multiple');
const isFavorite = computed(() => (current.value ? favorites.value[current.value.id] ?? current.value.isFavorite ?? false : false));
const canSubmit = computed(() => Boolean(current.value) && !currentAnswer.value && selected.value.length > 0 && !submitting.value);

function applyAnswers(list: AnswerInfo[]): void {
  const map: Record<string, AnswerInfo> = {};
  for (const item of list) map[item.questionId] = item;
  answers.value = map;
}

// 当前题切换时同步给 AI 桌宠；退出页面清空
watch(
  () => sessionId.value,
  () => {
    aiPet.setScene(sessionId.value ? { kind: 'practice', sessionId: sessionId.value } : null);
  },
  { immediate: true },
);

watch(
  () => current.value?.id,
  () => {
    const question = current.value;
    aiPet.setQuestion(question ? { id: question.id, stem: question.stem ?? '' } : null);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  aiPet.resetQuestion();
});

function syncSelected(): void {
  const question = current.value;
  selected.value = question ? answers.value[question.id]?.userAnswer ?? [] : [];
  questionStartedAt.value = Date.now();
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await practiceApi.get(sessionId.value);
    view.value = result.data;
    applyAnswers(result.data.answers);
    favorites.value = Object.fromEntries(result.data.questions.map((item) => [item.id, item.isFavorite ?? false]));
    const firstUnanswered = result.data.questions.findIndex((item) => !answers.value[item.id]);
    index.value = firstUnanswered === -1 ? Math.max(0, result.data.questions.length - 1) : firstUnanswered;
    if (result.data.session.status === 'finished' && !summary.value) {
      summary.value = {
        answeredCount: result.data.session.answeredCount,
        correctCount: result.data.session.correctCount,
        totalQuestions: result.data.session.totalQuestions,
        accuracy:
          result.data.session.answeredCount > 0
            ? Math.round((result.data.session.correctCount / result.data.session.answeredCount) * 10000) / 100
            : 0,
      };
    }
    syncSelected();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '练习加载失败';
  } finally {
    loading.value = false;
  }
}

async function submit(): Promise<void> {
  if (!current.value || submitting.value) return;
  if (currentAnswer.value) {
    next();
    return;
  }
  if (selected.value.length === 0) {
    error.value = '请先选择答案';
    return;
  }
  error.value = '';
  submitting.value = true;
  try {
    const result = await questionApi.answer(current.value.id, {
      answer: selected.value,
      sessionId: sessionId.value,
      timeSpentMs: Date.now() - questionStartedAt.value,
    });
    const info: AnswerInfo = {
      questionId: current.value.id,
      isCorrect: result.data.isCorrect,
      userAnswer: selected.value,
      correctAnswer: result.data.correctAnswer,
      explanation: result.data.explanation,
    };
    answers.value = { ...answers.value, [current.value.id]: info };
    if (view.value) {
      view.value.session.answeredCount += 1;
      if (result.data.isCorrect) view.value.session.correctCount += 1;
    }
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'CONFLICT') {
      toast.info('该题已提交，正在同步最新状态');
      await load();
    } else {
      error.value = err instanceof Error ? err.message : '提交失败，请重试';
    }
  } finally {
    submitting.value = false;
  }
}

function next(): void {
  if (index.value < questions.value.length - 1) {
    index.value += 1;
    syncSelected();
  }
}

function prev(): void {
  if (index.value > 0) {
    index.value -= 1;
    syncSelected();
  }
}

async function toggleFavorite(): Promise<void> {
  if (!current.value) return;
  const nextValue = !isFavorite.value;
  try {
    await questionApi.toggleFavorite(current.value.id, nextValue);
    favorites.value = { ...favorites.value, [current.value.id]: nextValue };
    toast.success(nextValue ? '已加入收藏' : '已取消收藏');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '收藏操作失败');
  }
}

async function finish(): Promise<void> {
  finishing.value = true;
  try {
    const result = await practiceApi.finish(sessionId.value);
    summary.value = result.data;
    finishOpen.value = false;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '结束练习失败');
  } finally {
    finishing.value = false;
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (summary.value || finishOpen.value) return;
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  const key = event.key.toUpperCase();
  const options = current.value?.type === 'boolean' ? [{ key: 'true' }, { key: 'false' }] : current.value?.options ?? [];
  const indexByKey = options.findIndex((option) => option.key.toUpperCase() === key);
  const indexByNumber = Number(event.key) - 1;
  const targetIndex = indexByKey >= 0 ? indexByKey : indexByNumber;
  if (targetIndex >= 0 && targetIndex < options.length && !currentAnswer.value) {
    const optionKey = options[targetIndex].key;
    if (isMultiple.value) {
      selected.value = selected.value.includes(optionKey)
        ? selected.value.filter((item) => item !== optionKey)
        : [...selected.value, optionKey];
    } else {
      selected.value = [optionKey];
    }
    event.preventDefault();
    return;
  }
  if (event.key === 'Enter') {
    submit();
  } else if (event.key === 'ArrowRight') {
    next();
  } else if (event.key === 'ArrowLeft') {
    prev();
  }
}

watch(index, syncSelected);

onMounted(() => {
  load();
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="stack">
    <div class="row-between">
      <RouterLink class="btn btn-ghost btn-sm" to="/practice">← 退出练习</RouterLink>
      <div class="row" style="gap: 8px">
        <span class="badge">{{ modeLabel(view?.session.mode ?? '') }}</span>
        <span class="badge badge-primary">已答 {{ answeredCount }} / {{ totalCount }}</span>
      </div>
    </div>

    <LoadingBlock v-if="loading" text="正在加载练习…" />

    <div v-else-if="error && !view" class="card">
      <div class="error-box">{{ error }}</div>
      <div class="row" style="margin-top: 14px">
        <button class="btn btn-primary" @click="load">重试</button>
        <RouterLink class="btn btn-ghost" to="/practice">返回刷题</RouterLink>
      </div>
    </div>

    <EmptyState v-else-if="!current" title="练习中没有题目" description="该练习可能已结束或题目已下架" :icon="CircleHelp">
      <RouterLink class="btn btn-primary btn-sm" to="/practice">重新选择</RouterLink>
    </EmptyState>

    <template v-else>
      <section class="card">
        <ProgressBar :value="answeredCount" :max="totalCount" :label="`进度 ${answeredCount} / ${totalCount}`" />
        <div class="divider" />
        <div class="question-meta">
          <span class="badge badge-primary">{{ typeLabel(current.type) }}</span>
          <span class="badge">难度 {{ current.difficulty }} · {{ difficultyLabel(current.difficulty) }}</span>
          <span class="badge">{{ current.subject }}</span>
          <span v-if="current.category" class="badge">{{ current.category }}</span>
          <span class="spacer" style="flex: 1" />
          <button class="btn btn-sm btn-ghost" type="button" @click="toggleFavorite">
            <Star :size="15" :fill="isFavorite ? 'currentColor' : 'none'" /> {{ isFavorite ? '已收藏' : '收藏' }}
          </button>
        </div>

        <div class="row-between" style="margin-bottom: 8px">
          <span class="small muted">第 {{ index + 1 }} 题 / 共 {{ totalCount }} 题</span>
          <span v-if="isMultiple" class="badge badge-warning">多选题：需全部选对才得分</span>
        </div>

        <p class="question-stem">{{ current.stem }}</p>

        <QuestionOptions
          v-model="selected"
          :options="current.options"
          :type="current.type"
          :multiple="isMultiple"
          :disabled="Boolean(currentAnswer) || submitting"
          :result="currentAnswer ? { correctAnswer: currentAnswer.correctAnswer, userAnswer: currentAnswer.userAnswer, isCorrect: currentAnswer.isCorrect } : null"
        />

        <div v-if="current.knowledgePoints.length > 0" class="row" style="margin-top: 14px; gap: 6px">
          <span class="tiny muted">知识点：</span>
          <span v-for="point in current.knowledgePoints" :key="point" class="badge">{{ point }}</span>
        </div>

        <div v-if="currentAnswer" class="answer-feedback" :class="currentAnswer.isCorrect ? 'correct' : 'wrong'">
          <div class="feedback-title" :class="currentAnswer.isCorrect ? 'correct' : 'wrong'">
            <CircleCheck v-if="currentAnswer.isCorrect" :size="16" /> <CircleX v-else :size="16" /> {{ currentAnswer.isCorrect ? '回答正确' : '回答错误' }}
          </div>
          <div class="small">
            你的答案：<strong>{{ answerText(currentAnswer.userAnswer, current.type) }}</strong> ·
            正确答案：<strong>{{ answerText(currentAnswer.correctAnswer, current.type) }}</strong>
          </div>
          <p v-if="currentAnswer.explanation" class="small" style="margin-top: 8px; white-space: pre-wrap">
            {{ currentAnswer.explanation }}
          </p>
        </div>

        <div v-if="error" class="error-box" style="margin-top: 14px">{{ error }}</div>
      </section>

      <div class="row-between">
        <button class="btn btn-ghost" type="button" :disabled="index === 0" @click="prev">← 上一题</button>
        <div class="row" style="gap: 8px">
          <button class="btn btn-ghost" type="button" @click="finishOpen = true">结束练习</button>
          <button
            v-if="!currentAnswer"
            class="btn btn-primary"
            type="button"
            :disabled="!canSubmit"
            @click="submit"
          >
            <span v-if="submitting" class="spinner" />
            {{ submitting ? '判分中…' : '提交答案' }}
          </button>
          <button v-else class="btn btn-primary" type="button" :disabled="index >= totalCount - 1" @click="next">
            下一题 →
          </button>
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="finishOpen"
      title="结束本次练习？"
      :message="`已完成 ${answeredCount} / ${totalCount} 题，未作答的题目不会计入正确率。`"
      confirm-text="结束练习"
      :loading="finishing"
      @cancel="finishOpen = false"
      @confirm="finish"
    />

    <Teleport to="body">
      <div v-if="summary" class="modal-backdrop" @click.self="summary = null">
        <div class="modal">
          <div class="modal-header"><h2>练习完成</h2></div>
          <div class="stat-strip summary-stats" style="margin-bottom: 16px">
            <div class="stat-card">
              <div class="stat-label">已作答</div>
              <div class="stat-value">{{ summary.answeredCount }}</div>
            </div>
            <div class="stat-card success">
              <div class="stat-label">答对</div>
              <div class="stat-value">{{ summary.correctCount }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">正确率</div>
              <div class="stat-value">{{ summary.accuracy }}%</div>
            </div>
          </div>
          <p class="muted small">本次共 {{ summary.totalQuestions }} 道题，答错的题目已自动加入错题本。</p>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="summary = null">留在本页</button>
            <button class="btn btn-ghost" @click="router.push('/practice')">再练一组</button>
            <button class="btn btn-primary" @click="router.push('/')">返回首页</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
