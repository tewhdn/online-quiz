<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { examApi } from '../../api';
import { ApiClientError } from '../../api/client';
import type { AttemptResult, ExamPaper } from '../../types';
import { answerText, formatDuration, typeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import QuestionOptions from '../../components/QuestionOptions.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import LoadingBlock from '../../components/LoadingBlock.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const attemptId = computed(() => String(route.params.id ?? ''));
const paper = ref<ExamPaper | null>(null);
const loading = ref(true);
const loadError = ref('');
const current = ref(0);
const answers = ref<Record<string, string[]>>({});
const flags = ref<Record<string, boolean>>({});
const dirty = ref<Set<string>>(new Set());
const saving = ref(false);
const submitting = ref(false);
const finished = ref(false);
const remaining = ref(0);
const sheetOpen = ref(false);
const confirmOpen = ref(false);
const autoFailed = ref(false);
const clockOffset = ref(0);

let tickTimer: number | undefined;
const saveTimers = new Map<string, number>();

const questions = computed(() => paper.value?.questions ?? []);
const question = computed(() => questions.value[current.value] ?? null);
const total = computed(() => questions.value.length);
const answeredCount = computed(() => questions.value.filter((item) => (answers.value[item.id] ?? []).length > 0).length);
const unansweredCount = computed(() => total.value - answeredCount.value);
const flaggedCount = computed(() => Object.values(flags.value).filter(Boolean).length);
const timerDanger = computed(() => remaining.value <= 300);

const selected = computed<string[]>({
  get: () => (question.value ? answers.value[question.value.id] ?? [] : []),
  set: (value) => {
    if (!question.value) return;
    answers.value = { ...answers.value, [question.value.id]: value };
    dirty.value.add(question.value.id);
    scheduleSave(question.value.id);
  },
});

function scheduleSave(questionId: string): void {
  const existing = saveTimers.get(questionId);
  if (existing) window.clearTimeout(existing);
  saveTimers.set(
    questionId,
    window.setTimeout(() => {
      saveTimers.delete(questionId);
      void persist(questionId);
    }, 350),
  );
}

async function persist(questionId: string): Promise<void> {
  if (!paper.value || finished.value) return;
  saving.value = true;
  try {
    const result = await examApi.saveAnswer(attemptId.value, questionId, {
      answer: answers.value[questionId] ?? [],
      flagged: Boolean(flags.value[questionId]),
    });
    dirty.value.delete(questionId);
    remaining.value = Math.max(0, result.data.remainingSeconds);
    if (result.data.autoSubmitted) {
      toast.info('考试时间已到，系统已自动交卷');
      finished.value = true;
      if (result.data.result) {
        await router.replace(`/exam-attempts/${attemptId.value}/result`);
        return;
      }
      await router.replace(`/exam-attempts/${attemptId.value}/result`);
    }
  } catch (error) {
    if (error instanceof ApiClientError && (error.code === 'CONFLICT' || error.status === 409)) {
      toast.info('考试状态已变化，正在跳转成绩页');
      finished.value = true;
      await router.replace(`/exam-attempts/${attemptId.value}/result`);
      return;
    }
    dirty.value.add(questionId);
    toast.error(error instanceof Error ? error.message : '答案保存失败');
  } finally {
    saving.value = false;
  }
}

async function flushSaves(): Promise<void> {
  const ids = Array.from(dirty.value);
  await Promise.all(ids.map((id) => persist(id)));
}

function go(index: number): void {
  if (index < 0 || index >= total.value) return;
  current.value = index;
  sheetOpen.value = false;
}

function toggleFlag(): void {
  if (!question.value) return;
  const next = !flags.value[question.value.id];
  flags.value = { ...flags.value, [question.value.id]: next };
  dirty.value.add(question.value.id);
  void persist(question.value.id);
}

async function submit(auto = false): Promise<void> {
  if (submitting.value || finished.value) return;
  submitting.value = true;
  autoFailed.value = false;
  try {
    await flushSaves();
    const result = await examApi.submit(attemptId.value);
    finished.value = true;
    toast.success(auto ? '已自动交卷' : '交卷成功，正在生成成绩');
    redirectToResult(result.data);
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'CONFLICT') {
      finished.value = true;
      await router.replace(`/exam-attempts/${attemptId.value}/result`);
      return;
    }
    if (auto) autoFailed.value = true;
    toast.error(error instanceof Error ? error.message : '交卷失败，请重试');
  } finally {
    submitting.value = false;
  }
}

async function redirectToResult(_result: AttemptResult): Promise<void> {
  await router.replace(`/exam-attempts/${attemptId.value}/result`);
}

function tick(): void {
  if (!paper.value || finished.value) return;
  const now = Date.now() - clockOffset.value;
  remaining.value = Math.max(0, Math.floor((paper.value.attempt.deadlineAt - now) / 1000));
  if (remaining.value <= 0) {
    toast.info('考试时间到，正在自动交卷');
    void submit(true);
  }
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (finished.value) return;
  event.preventDefault();
  event.returnValue = '';
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await examApi.paper(attemptId.value);
    paper.value = result.data;
    clockOffset.value = Date.now() - result.data.serverTime;
    remaining.value = result.data.remainingSeconds;
    const answerMap: Record<string, string[]> = {};
    const flagMap: Record<string, boolean> = {};
    for (const item of result.data.questions) {
      answerMap[item.id] = item.userAnswer;
      flagMap[item.id] = item.flagged;
    }
    answers.value = answerMap;
    flags.value = flagMap;
    const firstUnanswered = result.data.questions.findIndex((item) => item.userAnswer.length === 0);
    current.value = firstUnanswered === -1 ? 0 : firstUnanswered;
    tickTimer = window.setInterval(tick, 1000);
  } catch (error) {
    if (error instanceof ApiClientError && (error.code === 'CONFLICT' || error.status === 409)) {
      await router.replace(`/exam-attempts/${attemptId.value}/result`);
      return;
    }
    loadError.value = error instanceof Error ? error.message : '考试加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  window.addEventListener('beforeunload', beforeUnload);
});

onBeforeUnmount(() => {
  if (tickTimer) window.clearInterval(tickTimer);
  for (const timer of saveTimers.values()) window.clearTimeout(timer);
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
  <div class="stack">
    <LoadingBlock v-if="loading" text="正在进入考试…" />

    <div v-else-if="loadError" class="card">
      <div class="error-box">{{ loadError }}</div>
      <div class="row" style="margin-top: 14px">
        <button class="btn btn-primary" @click="load">重试</button>
        <RouterLink class="btn btn-ghost" to="/exams">返回考试列表</RouterLink>
      </div>
    </div>

    <template v-else-if="paper">
      <div class="exam-bar">
        <div class="row" style="gap: 10px">
          <strong class="truncate" style="max-width: 260px">{{ paper.exam.title }}</strong>
          <span class="badge">已答 {{ answeredCount }} / {{ total }}</span>
        </div>
        <div class="row" style="gap: 12px">
          <span class="small muted">{{ saving ? '保存中…' : dirty.size > 0 ? '待保存' : '已同步' }}</span>
          <span class="timer" :class="{ danger: timerDanger }">⏱ {{ formatDuration(remaining) }}</span>
          <button class="btn btn-sm btn-ghost" type="button" @click="sheetOpen = true">答题卡</button>
          <button
            class="btn btn-sm btn-primary"
            type="button"
            :disabled="submitting || finished || (!paper.exam.allowEarlySubmit && remaining > 0)"
            :title="!paper.exam.allowEarlySubmit && remaining > 0 ? '本场考试不允许提前交卷' : '交卷'"
            @click="confirmOpen = true"
          >
            交卷
          </button>
        </div>
      </div>

      <div v-if="autoFailed" class="error-box">
        自动交卷失败，请检查网络后手动交卷。
        <button class="btn btn-sm btn-ghost" style="margin-left: 8px" @click="submit(true)">重试交卷</button>
      </div>

      <section v-if="question" class="card">
        <div class="question-meta">
          <span class="badge badge-primary">{{ typeLabel(question.type) }}</span>
          <span class="badge">{{ question.score }} 分</span>
          <span class="badge">第 {{ current + 1 }} / {{ total }} 题</span>
          <span v-if="question.flagged" class="badge badge-warning">已标记</span>
        </div>
        <p class="question-stem">{{ question.stem }}</p>
        <QuestionOptions
          v-model="selected"
          :options="question.options"
          :type="question.type"
          :multiple="question.type === 'multiple'"
        />
        <p v-if="question.knowledgePoints.length > 0" class="tiny muted" style="margin-top: 12px">
          知识点：{{ question.knowledgePoints.join('、') }}
        </p>
      </section>

      <div class="row-between">
        <div class="row" style="gap: 8px">
          <button class="btn btn-ghost" type="button" :disabled="current === 0" @click="go(current - 1)">← 上一题</button>
          <button class="btn btn-ghost" type="button" :disabled="current >= total - 1" @click="go(current + 1)">下一题 →</button>
        </div>
        <div class="row" style="gap: 8px">
          <button class="btn btn-ghost" type="button" @click="toggleFlag">
            {{ question?.flagged ? '🚩 取消标记' : '🚩 标记疑问' }}
          </button>
          <button class="btn btn-soft" type="button" @click="sheetOpen = true">答题卡（{{ answeredCount }}/{{ total }}）</button>
        </div>
      </div>

      <div v-if="sheetOpen" class="modal-backdrop" @click.self="sheetOpen = false">
        <div class="modal">
          <div class="modal-header"><h2>答题卡</h2></div>
          <p class="small muted" style="margin-bottom: 12px">
            已答 {{ answeredCount }} 题 · 未答 {{ unansweredCount }} 题 · 标记 {{ flaggedCount }} 题
          </p>
          <div class="answer-sheet">
            <button
              v-for="(item, index) in questions"
              :key="item.id"
              type="button"
              :class="{
                answered: (answers[item.id] ?? []).length > 0,
                flagged: flags[item.id],
                current: index === current,
              }"
              @click="go(index)"
            >
              {{ index + 1 }}
            </button>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" @click="sheetOpen = false">继续答题</button>
            <button class="btn btn-primary" @click="sheetOpen = false; confirmOpen = true">去交卷</button>
          </div>
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="confirmOpen"
      title="确认交卷？"
      :message="`已答 ${answeredCount} 题，未答 ${unansweredCount} 题${flaggedCount ? `，标记疑问 ${flaggedCount} 题` : ''}。交卷后不能再修改答案。`"
      confirm-text="确认交卷"
      :loading="submitting"
      @cancel="confirmOpen = false"
      @confirm="confirmOpen = false; submit(false)"
    />

    <div v-if="paper" class="tiny muted" style="text-align: center">
      共 {{ total }} 题 · 总分 {{ paper.exam.totalScore }} 分 · 答案由服务端判分
    </div>
  </div>
</template>
