<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { adminApi } from '../../api';
import type { AdminQuestion, QuestionOption, QuestionStatus, QuestionType } from '../../types';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();

const editingId = computed(() => (route.params.id ? String(route.params.id) : ''));
const isEdit = computed(() => Boolean(editingId.value));
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const errors = ref<string[]>([]);

const form = reactive({
  type: 'single' as QuestionType,
  subject: '',
  category: '',
  knowledge: '',
  difficulty: 2,
  stem: '',
  options: [
    { key: 'A', text: '' },
    { key: 'B', text: '' },
    { key: 'C', text: '' },
    { key: 'D', text: '' },
  ] as QuestionOption[],
  answer: [] as string[],
  explanation: '',
  source: '',
  sourceRef: '',
  tags: '',
  status: 'draft' as QuestionStatus,
});

const isChoice = computed(() => form.type !== 'boolean');

function nextKey(): string {
  const used = new Set(form.options.map((option) => option.key));
  for (const letter of 'ABCDEFGH') {
    if (!used.has(letter)) return letter;
  }
  return 'A';
}

function addOption(): void {
  if (form.options.length >= 8) return;
  form.options.push({ key: nextKey(), text: '' });
}

function removeOption(index: number): void {
  if (form.options.length <= 2) return;
  const removed = form.options[index];
  form.options.splice(index, 1);
  form.answer = form.answer.filter((item) => item !== removed.key);
}

function toggleAnswer(key: string): void {
  if (form.type === 'single') {
    form.answer = [key];
    return;
  }
  form.answer = form.answer.includes(key) ? form.answer.filter((item) => item !== key) : [...form.answer, key].sort();
}

function onTypeChange(): void {
  if (form.type === 'boolean') {
    form.options = [];
    form.answer = ['true'];
  } else {
    if (form.options.length < 2) {
      form.options = [
        { key: 'A', text: '' },
        { key: 'B', text: '' },
        { key: 'C', text: '' },
        { key: 'D', text: '' },
      ];
    }
    form.answer = form.answer.filter((item) => item === 'true' || item === 'false' ? false : true).slice(0, 1);
    if (form.answer.length === 0) form.answer = [];
  }
}

async function load(): Promise<void> {
  if (!isEdit.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const data: AdminQuestion = (await adminApi.question(editingId.value)).data;
    form.type = data.type;
    form.subject = data.subject;
    form.category = data.category;
    form.knowledge = data.knowledgePoints.join('、');
    form.difficulty = data.difficulty;
    form.stem = data.stem;
    form.options = data.options.length > 0 ? data.options.map((option) => ({ ...option })) : [];
    form.answer = data.answer;
    form.explanation = data.explanation;
    form.source = data.source ?? '';
    form.sourceRef = data.sourceRef ?? '';
    form.tags = data.tags.join('、');
    form.status = data.status;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '题目加载失败';
  } finally {
    loading.value = false;
  }
}

async function submit(): Promise<void> {
  errors.value = [];
  error.value = '';
  if (!form.stem.trim()) {
    error.value = '题干不能为空';
    return;
  }
  if (!form.subject.trim()) {
    error.value = '科目不能为空';
    return;
  }
  if (isChoice.value) {
    if (form.options.length < 2) {
      error.value = '至少需要两个选项';
      return;
    }
    if (form.options.some((option) => !option.text.trim())) {
      error.value = '选项内容不能为空';
      return;
    }
    if (form.answer.length === 0) {
      error.value = '请选择正确答案';
      return;
    }
  }
  submitting.value = true;
  try {
    const payload = {
      type: form.type,
      subject: form.subject.trim(),
      category: form.category.trim() || form.subject.trim(),
      knowledge_points: form.knowledge.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean),
      difficulty: form.difficulty,
      stem: form.stem.trim(),
      options: isChoice.value ? form.options.map((option) => ({ key: option.key, text: option.text.trim() })) : [],
      answer: form.answer,
      explanation: form.explanation.trim(),
      source: form.source.trim(),
      source_ref: form.sourceRef.trim(),
      tags: form.tags.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean),
      status: form.status,
    };
    if (isEdit.value) {
      await adminApi.updateQuestion(editingId.value, payload);
      toast.success('题目已更新');
    } else {
      await adminApi.createQuestion(payload);
      toast.success('题目已创建');
    }
    await router.push('/admin/questions');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败';
    const details = (err as { details?: unknown }).details;
    if (Array.isArray(details)) errors.value = details.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="row-between">
      <RouterLink class="btn btn-ghost btn-sm" to="/admin/questions">← 返回题库</RouterLink>
      <span v-if="isEdit" class="badge">编辑模式</span>
      <span v-else class="badge badge-primary">新建题目</span>
    </div>

    <LoadingBlock v-if="loading" text="正在加载题目…" />

    <template v-else>
      <section class="card">
        <div class="card-header"><h2>{{ isEdit ? '编辑题目' : '新建题目' }}</h2></div>

        <div class="form-grid">
          <div class="field">
            <label for="edit-type">题型</label>
            <select id="edit-type" v-model="form.type" class="select" @change="onTypeChange">
              <option value="single">单选题</option>
              <option value="multiple">多选题</option>
              <option value="boolean">判断题</option>
            </select>
          </div>
          <div class="field">
            <label for="edit-subject">科目</label>
            <input id="edit-subject" v-model="form.subject" class="input" placeholder="例如：计算机基础" maxlength="60" />
          </div>
          <div class="field">
            <label for="edit-category">分类</label>
            <input id="edit-category" v-model="form.category" class="input" placeholder="例如：计算机网络" maxlength="60" />
          </div>
          <div class="field">
            <label for="edit-difficulty">难度</label>
            <select id="edit-difficulty" v-model.number="form.difficulty" class="select">
              <option v-for="level in 5" :key="level" :value="level">{{ level }} 级</option>
            </select>
          </div>
          <div class="field">
            <label for="edit-knowledge">知识点（用顿号或逗号分隔）</label>
            <input id="edit-knowledge" v-model="form.knowledge" class="input" placeholder="IP地址、子网掩码" />
          </div>
          <div class="field">
            <label for="edit-status">状态</label>
            <select id="edit-status" v-model="form.status" class="select">
              <option value="draft">草稿</option>
              <option value="pending">待审核</option>
              <option value="published">已发布</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>

        <div class="field" style="margin-top: 16px">
          <label for="edit-stem">题干</label>
          <textarea id="edit-stem" v-model="form.stem" class="textarea" rows="4" placeholder="请输入完整题干，支持换行与代码文本" maxlength="5000" />
        </div>

        <div v-if="isChoice" class="field" style="margin-top: 16px">
          <label>选项与正确答案</label>
          <div class="stack" style="gap: 10px">
            <div v-for="(option, index) in form.options" :key="option.key" class="row" style="gap: 8px; flex-wrap: nowrap">
              <input
                type="checkbox"
                :checked="form.answer.includes(option.key)"
                :title="form.type === 'single' ? '设为唯一正确答案' : '加入正确答案'"
                @change="toggleAnswer(option.key)"
              />
              <span class="badge" style="min-width: 30px; justify-content: center">{{ option.key }}</span>
              <input v-model="option.text" class="input" :placeholder="`选项 ${option.key} 内容`" />
              <button class="btn btn-sm btn-ghost" type="button" :disabled="form.options.length <= 2" @click="removeOption(index)">删除</button>
            </div>
          </div>
          <div class="row" style="margin-top: 10px">
            <button class="btn btn-sm btn-soft" type="button" :disabled="form.options.length >= 8" @click="addOption">+ 添加选项</button>
            <span class="hint">勾选的选项为正确答案；单选题只能选一个，多选题需全部选对才得分。</span>
          </div>
        </div>

        <div v-else class="field" style="margin-top: 16px">
          <label>判断题答案</label>
          <div class="row">
            <label class="checkbox-row"><input v-model="form.answer" type="radio" value="true" /> 正确</label>
            <label class="checkbox-row"><input v-model="form.answer" type="radio" value="false" /> 错误</label>
          </div>
        </div>

        <div class="field" style="margin-top: 16px">
          <label for="edit-explanation">解析</label>
          <textarea id="edit-explanation" v-model="form.explanation" class="textarea" rows="3" placeholder="答题后向用户展示的解析" maxlength="5000" />
        </div>

        <div class="form-grid" style="margin-top: 16px">
          <div class="field">
            <label for="edit-source">来源</label>
            <input id="edit-source" v-model="form.source" class="input" placeholder="例如：2027 年考试大纲" maxlength="200" />
          </div>
          <div class="field">
            <label for="edit-source-ref">来源章节 / 大纲条目</label>
            <input id="edit-source-ref" v-model="form.sourceRef" class="input" maxlength="200" />
          </div>
          <div class="field">
            <label for="edit-tags">标签</label>
            <input id="edit-tags" v-model="form.tags" class="input" placeholder="易错、重点" />
          </div>
        </div>

        <div v-if="error" class="error-box" style="margin-top: 16px">{{ error }}</div>
        <ul v-if="errors.length > 0" class="error-box" style="margin-top: 10px">
          <li v-for="(item, index) in errors" :key="index">{{ item }}</li>
        </ul>

        <div class="row" style="margin-top: 20px; justify-content: flex-end">
          <RouterLink class="btn btn-ghost" to="/admin/questions">取消</RouterLink>
          <button class="btn btn-primary" :disabled="submitting" @click="submit">
            <span v-if="submitting" class="spinner" />
            {{ submitting ? '保存中…' : '保存题目' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
