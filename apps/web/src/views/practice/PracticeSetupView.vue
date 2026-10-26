<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { practiceApi, questionApi } from '../../api';
import type { FilterOptions } from '../../types';
import { difficultyLabel, modeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import { BookOpen, BookX, FolderTree, KeyRound, Library, Shuffle, Shapes, Star, TrendingUp } from '@lucide/vue';

const router = useRouter();
const toast = useToast();

const filters = ref<FilterOptions | null>(null);
const loading = ref(true);
const starting = ref(false);
const error = ref('');

const mode = ref('random');
const count = ref(10);
const subject = ref('');
const categoryId = ref('');
const knowledgePoint = ref('');
const type = ref('');
const difficulty = ref<number | ''>('');

const modes = [
  { value: 'random', icon: Shuffle, desc: '从题库随机抽题' },
  { value: 'sequence', icon: BookOpen, desc: '按录入顺序练习' },
  { value: 'subject', icon: Library, desc: '按科目集中练习' },
  { value: 'category', icon: FolderTree, desc: '按分类专项突破' },
  { value: 'knowledge', icon: KeyRound, desc: '按知识点精准练习' },
  { value: 'type', icon: Shapes, desc: '只练单选 / 多选 / 判断' },
  { value: 'difficulty', icon: TrendingUp, desc: '按难度梯度练习' },
  { value: 'mistake', icon: BookX, desc: '重做尚未掌握的错题' },
  { value: 'favorite', icon: Star, desc: '练习收藏的题目' },
];

const counts = [5, 10, 20, 30, 50];

const subjects = computed(() => filters.value?.subjects ?? []);
const categories = computed(() => {
  const list = filters.value?.categories ?? [];
  return subject.value ? list.filter((item) => item.subject === subject.value) : list;
});

const needsSubject = computed(() => ['subject', 'category'].includes(mode.value));
const showFilters = computed(() => !['mistake', 'favorite'].includes(mode.value));

function onModeChange(): void {
  if (!needsSubject.value) {
    if (mode.value !== 'category') categoryId.value = '';
  }
  if (mode.value === 'category' && !subject.value && subjects.value.length > 0) {
    subject.value = subjects.value[0].subject;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    filters.value = (await questionApi.filters()).data;
    if (subjects.value.length > 0 && !subject.value) subject.value = subjects.value[0].subject;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '筛选项加载失败';
  } finally {
    loading.value = false;
  }
}

async function start(): Promise<void> {
  error.value = '';
  if (mode.value === 'subject' && !subject.value) {
    error.value = '请选择科目';
    return;
  }
  if (mode.value === 'category' && !categoryId.value) {
    error.value = '请选择分类';
    return;
  }
  if (mode.value === 'knowledge' && !knowledgePoint.value.trim()) {
    error.value = '请填写知识点';
    return;
  }
  if (mode.value === 'type' && !type.value) {
    error.value = '请选择题型';
    return;
  }
  if (mode.value === 'difficulty' && !difficulty.value) {
    error.value = '请选择难度';
    return;
  }
  starting.value = true;
  try {
    const result = await practiceApi.start({
      mode: mode.value,
      count: count.value,
      subject: showFilters.value && subject.value ? subject.value : undefined,
      categoryId: showFilters.value && categoryId.value ? categoryId.value : undefined,
      knowledgePoint: mode.value === 'knowledge' ? knowledgePoint.value.trim() : undefined,
      type: showFilters.value && type.value ? type.value : undefined,
      difficulty: showFilters.value && difficulty.value ? Number(difficulty.value) : undefined,
    });
    if (result.data.total < count.value) {
      toast.info(`题库中符合条件的题目只有 ${result.data.total} 道，已全部加入练习`);
    }
    await router.push({ name: 'practice-session', params: { id: result.data.sessionId } });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '开始练习失败';
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
        <h1>开始刷题</h1>
        <p>选择练习方式与范围，系统会从已发布题库中抽题</p>
      </div>
      <RouterLink class="btn btn-ghost" to="/mistakes">查看错题本</RouterLink>
    </div>

    <div v-if="error" class="error-box" role="alert">{{ error }}</div>

    <section class="card">
      <div class="section-title"><h2>练习方式</h2></div>
      <div class="mode-grid">
        <button
          v-for="item in modes"
          :key="item.value"
          type="button"
          class="mode-card"
          :class="{ active: mode === item.value }"
          @click="mode = item.value; onModeChange()"
        >
          <span class="mode-icon"><component :is="item.icon" :size="18" :stroke-width="1.8" /></span>
          <span class="mode-name">{{ modeLabel(item.value) }}</span>
          <span class="mode-desc">{{ item.desc }}</span>
        </button>
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>练习设置</h2>
        <span class="spacer" />
        <span class="badge">{{ count }} 道题</span>
      </div>

      <div class="form-grid">
        <div class="field">
          <label>题目数量</label>
          <div class="row" style="gap: 8px">
            <button
              v-for="item in counts"
              :key="item"
              type="button"
              class="btn btn-sm"
              :class="count === item ? 'btn-primary' : 'btn-ghost'"
              @click="count = item"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <div v-if="showFilters" class="field">
          <label for="practice-subject">科目</label>
          <select id="practice-subject" v-model="subject" class="select" :disabled="loading">
            <option value="">全部科目</option>
            <option v-for="item in subjects" :key="item.subject" :value="item.subject">
              {{ item.subject }}（{{ item.count }} 题）
            </option>
          </select>
        </div>

        <div v-if="showFilters && (mode === 'category' || categories.length > 0)" class="field">
          <label for="practice-category">分类</label>
          <select id="practice-category" v-model="categoryId" class="select" :disabled="loading">
            <option value="">全部分类</option>
            <option v-for="item in categories" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </div>

        <div v-if="showFilters" class="field">
          <label for="practice-type">题型</label>
          <select id="practice-type" v-model="type" class="select">
            <option value="">全部题型</option>
            <option value="single">单选题</option>
            <option value="multiple">多选题</option>
            <option value="boolean">判断题</option>
          </select>
        </div>

        <div v-if="showFilters" class="field">
          <label for="practice-difficulty">难度</label>
          <select id="practice-difficulty" v-model="difficulty" class="select">
            <option value="">全部难度</option>
            <option v-for="level in 5" :key="level" :value="level">{{ level }} · {{ difficultyLabel(level) }}</option>
          </select>
        </div>

        <div v-if="mode === 'knowledge'" class="field">
          <label for="practice-knowledge">知识点</label>
          <input id="practice-knowledge" v-model="knowledgePoint" class="input" placeholder="例如：子网掩码" maxlength="40" />
        </div>
      </div>

      <div v-if="mode === 'mistake'" class="info-box" style="margin-top: 14px">
        只抽取你尚未标记掌握的错题；答错的题目会自动回到待复习状态。
      </div>
      <div v-if="mode === 'favorite'" class="info-box" style="margin-top: 14px">
        从你收藏的题目中抽题练习，收藏可在答题页面随时添加。
      </div>

      <div class="row" style="margin-top: 20px; justify-content: flex-end">
        <RouterLink class="btn btn-ghost" to="/">返回首页</RouterLink>
        <button class="btn btn-primary btn-lg" type="button" :disabled="starting || loading" @click="start">
          <span v-if="starting" class="spinner" />
          {{ starting ? '正在准备题目…' : '开始练习' }}
        </button>
      </div>
    </section>
  </div>
</template>

