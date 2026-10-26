<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { adminApi, questionApi } from '../../api';
import type { Category } from '../../types';
import { fromDateTimeLocal, toDateTimeLocal } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const examId = computed(() => (route.params.id ? String(route.params.id) : ''));
const isEdit = computed(() => Boolean(examId.value));
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const shortages = ref<string[]>([]);
const categories = ref<Category[]>([]);

const form = reactive({
  title: '',
  description: '',
  subject: '',
  categoryIds: [] as string[],
  knowledgePoints: '',
  single: 0,
  multiple: 0,
  boolean: 0,
  scoreSingle: 2,
  scoreMultiple: 3,
  scoreBoolean: 2,
  durationMinutes: 60,
  allowEarlySubmit: true,
  allowReview: 'after_submit' as 'never' | 'after_submit' | 'after_end',
  startAt: '',
  endAt: '',
  allowRetake: false,
  status: 'draft' as 'draft' | 'published',
  difficulty1: 0,
  difficulty2: 0,
  difficulty3: 0,
  difficulty4: 0,
  difficulty5: 0,
});

const totalQuestions = computed(() => Number(form.single) + Number(form.multiple) + Number(form.boolean));
const totalScore = computed(
  () => Number(form.single) * Number(form.scoreSingle) + Number(form.multiple) * Number(form.scoreMultiple) + Number(form.boolean) * Number(form.scoreBoolean),
);
const difficultyTotal = computed(
  () => Number(form.difficulty1) + Number(form.difficulty2) + Number(form.difficulty3) + Number(form.difficulty4) + Number(form.difficulty5),
);

function toggleCategory(id: string): void {
  form.categoryIds = form.categoryIds.includes(id) ? form.categoryIds.filter((item) => item !== id) : [...form.categoryIds, id];
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    categories.value = (await questionApi.filters()).data.categories;
    if (isEdit.value) {
      const data = (await adminApi.exam(examId.value)).data;
      const exam = data.exam as unknown as Record<string, unknown>;
      form.title = String(exam.title ?? '');
      form.description = String(exam.description ?? '');
      form.subject = String(exam.subject ?? '');
      form.categoryIds = Array.isArray(exam.categoryIds) ? (exam.categoryIds as string[]) : [];
      form.knowledgePoints = Array.isArray(exam.knowledgePoints) ? (exam.knowledgePoints as string[]).join('、') : '';
      const counts = exam.typeCounts as { single: number; multiple: number; boolean: number };
      form.single = counts.single;
      form.multiple = counts.multiple;
      form.boolean = counts.boolean;
      form.scoreSingle = Number(exam.scoreSingle ?? 2);
      form.scoreMultiple = Number(exam.scoreMultiple ?? 3);
      form.scoreBoolean = Number(exam.scoreBoolean ?? 2);
      form.durationMinutes = Number(exam.durationMinutes ?? 60);
      form.allowEarlySubmit = Boolean(exam.allowEarlySubmit);
      form.allowReview = String(exam.allowReview ?? 'after_submit') as typeof form.allowReview;
      form.startAt = toDateTimeLocal(exam.startAt as number | null);
      form.endAt = toDateTimeLocal(exam.endAt as number | null);
      form.allowRetake = Boolean(exam.allowRetake);
      form.status = String(exam.status ?? 'draft') as typeof form.status;
      const difficulty = (exam.difficultyCounts ?? {}) as Record<string, number>;
      form.difficulty1 = Number(difficulty['1'] ?? 0);
      form.difficulty2 = Number(difficulty['2'] ?? 0);
      form.difficulty3 = Number(difficulty['3'] ?? 0);
      form.difficulty4 = Number(difficulty['4'] ?? 0);
      form.difficulty5 = Number(difficulty['5'] ?? 0);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function submit(): Promise<void> {
  error.value = '';
  shortages.value = [];
  if (!form.title.trim()) {
    error.value = '考试名称不能为空';
    return;
  }
  if (totalQuestions.value <= 0) {
    error.value = '题目总数必须大于 0';
    return;
  }
  if (difficultyTotal.value > 0 && difficultyTotal.value !== totalQuestions.value) {
    error.value = `难度分布合计（${difficultyTotal.value}）必须等于题目总数（${totalQuestions.value}），或全部填 0`;
    return;
  }
  submitting.value = true;
  try {
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      subject: form.subject.trim(),
      categoryIds: form.categoryIds,
      knowledgePoints: form.knowledgePoints.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean),
      typeCounts: { single: Number(form.single), multiple: Number(form.multiple), boolean: Number(form.boolean) },
      difficultyCounts:
        difficultyTotal.value > 0
          ? {
              '1': Number(form.difficulty1),
              '2': Number(form.difficulty2),
              '3': Number(form.difficulty3),
              '4': Number(form.difficulty4),
              '5': Number(form.difficulty5),
            }
          : {},
      scoreSingle: Number(form.scoreSingle),
      scoreMultiple: Number(form.scoreMultiple),
      scoreBoolean: Number(form.scoreBoolean),
      durationMinutes: Number(form.durationMinutes),
      allowEarlySubmit: form.allowEarlySubmit,
      allowReview: form.allowReview,
      startAt: fromDateTimeLocal(form.startAt),
      endAt: fromDateTimeLocal(form.endAt),
      allowRetake: form.allowRetake,
      status: form.status,
    };
    if (isEdit.value) {
      await adminApi.updateExam(examId.value, payload);
      toast.success('考试已更新');
    } else {
      await adminApi.createExam(payload);
      toast.success('考试已创建');
    }
    await router.push('/admin/exams');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败';
    const details = (err as { details?: { shortages?: string[] } }).details;
    if (details?.shortages) shortages.value = details.shortages;
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="row-between">
      <RouterLink class="btn btn-ghost btn-sm" to="/admin/exams">← 返回考试管理</RouterLink>
      <span class="badge">{{ isEdit ? '编辑考试' : '创建考试' }}</span>
    </div>

    <LoadingBlock v-if="loading" text="正在加载…" />

    <template v-else>
      <section class="card">
        <div class="card-header"><h2>基本信息</h2></div>
        <div class="field">
          <label for="exam-title">考试名称</label>
          <input id="exam-title" v-model="form.title" class="input" maxlength="80" placeholder="例如：2027 年计算机基础模拟考试（一）" />
        </div>
        <div class="field" style="margin-top: 12px">
          <label for="exam-description">考试说明</label>
          <textarea id="exam-description" v-model="form.description" class="textarea" rows="3" maxlength="2000" />
        </div>
        <div class="form-grid" style="margin-top: 12px">
          <div class="field">
            <label for="exam-subject">科目（留空表示不限）</label>
            <input id="exam-subject" v-model="form.subject" class="input" maxlength="60" />
          </div>
          <div class="field">
            <label for="exam-knowledge">知识点筛选（顿号分隔，可选）</label>
            <input id="exam-knowledge" v-model="form.knowledgePoints" class="input" />
          </div>
          <div class="field">
            <label for="exam-status">状态</label>
            <select id="exam-status" v-model="form.status" class="select">
              <option value="draft">草稿</option>
              <option value="published">发布</option>
            </select>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>抽题规则</h2><span class="tiny muted">题目将从已发布题库中随机抽取</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="exam-single">单选题数量</label>
            <input id="exam-single" v-model.number="form.single" class="input" type="number" min="0" max="200" />
          </div>
          <div class="field">
            <label for="exam-multiple">多选题数量</label>
            <input id="exam-multiple" v-model.number="form.multiple" class="input" type="number" min="0" max="200" />
          </div>
          <div class="field">
            <label for="exam-boolean">判断题数量</label>
            <input id="exam-boolean" v-model.number="form.boolean" class="input" type="number" min="0" max="200" />
          </div>
          <div class="field">
            <label>题目总数 / 总分</label>
            <div class="input" style="display: flex; align-items: center; background: var(--surface-2)">
              {{ totalQuestions }} 题 · {{ totalScore }} 分
            </div>
          </div>
        </div>

        <div class="form-grid" style="margin-top: 12px">
          <div class="field">
            <label for="score-single">单选分值</label>
            <input id="score-single" v-model.number="form.scoreSingle" class="input" type="number" min="1" max="100" />
          </div>
          <div class="field">
            <label for="score-multiple">多选分值</label>
            <input id="score-multiple" v-model.number="form.scoreMultiple" class="input" type="number" min="1" max="100" />
          </div>
          <div class="field">
            <label for="score-boolean">判断分值</label>
            <input id="score-boolean" v-model.number="form.scoreBoolean" class="input" type="number" min="1" max="100" />
          </div>
          <div class="field">
            <label for="exam-duration">考试时长（分钟）</label>
            <input id="exam-duration" v-model.number="form.durationMinutes" class="input" type="number" min="1" max="300" />
          </div>
        </div>

        <div class="field" style="margin-top: 14px">
          <label>难度分布（可选，合计需等于题目总数；全部为 0 表示不限难度）</label>
          <div class="form-grid">
            <div v-for="level in 5" :key="level" class="field">
              <label :for="`difficulty-${level}`">难度 {{ level }}</label>
              <input
                :id="`difficulty-${level}`"
                v-model.number="form[`difficulty${level}` as 'difficulty1']"
                class="input"
                type="number"
                min="0"
                max="200"
              />
            </div>
          </div>
          <span class="hint">当前合计 {{ difficultyTotal }} / {{ totalQuestions }}</span>
        </div>

        <div class="field" style="margin-top: 14px">
          <label>分类范围（可选，不选表示全部）</label>
          <div class="row" style="gap: 8px; max-height: 150px; overflow: auto">
            <label v-for="item in categories" :key="item.id" class="checkbox-row" style="font-size: 0.84rem">
              <input type="checkbox" :checked="form.categoryIds.includes(item.id)" @change="toggleCategory(item.id)" />
              {{ item.subject }} / {{ item.name }}
            </label>
            <span v-if="categories.length === 0" class="muted small">暂无分类</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>考试设置</h2></div>
        <div class="form-grid">
          <div class="field">
            <label for="exam-start">开放时间（可选）</label>
            <input id="exam-start" v-model="form.startAt" class="input" type="datetime-local" />
          </div>
          <div class="field">
            <label for="exam-end">结束时间（可选）</label>
            <input id="exam-end" v-model="form.endAt" class="input" type="datetime-local" />
          </div>
          <div class="field">
            <label for="exam-review">解析可见性</label>
            <select id="exam-review" v-model="form.allowReview" class="select">
              <option value="after_submit">交卷后可见</option>
              <option value="after_end">考试结束后可见</option>
              <option value="never">始终不可见</option>
            </select>
          </div>
        </div>
        <div class="row" style="margin-top: 14px; gap: 18px">
          <label class="checkbox-row"><input v-model="form.allowEarlySubmit" type="checkbox" /> 允许提前交卷</label>
          <label class="checkbox-row"><input v-model="form.allowRetake" type="checkbox" /> 允许重复参加</label>
        </div>
      </section>

      <div v-if="error" class="error-box">{{ error }}</div>
      <div v-if="shortages.length > 0" class="error-box">
        <strong>可用题目不足，考试未保存：</strong>
        <ul>
          <li v-for="item in shortages" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="row" style="justify-content: flex-end">
        <RouterLink class="btn btn-ghost" to="/admin/exams">取消</RouterLink>
        <button class="btn btn-primary" :disabled="submitting" @click="submit">
          <span v-if="submitting" class="spinner" />
          {{ submitting ? '保存中…' : isEdit ? '保存修改' : '创建考试' }}
        </button>
      </div>
    </template>
  </div>
</template>
