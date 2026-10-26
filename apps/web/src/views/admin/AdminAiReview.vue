<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api';
import type { AiReviewQuestion, QuestionOption, QuestionType } from '../../types';
import { difficultyLabel, formatDateTime, statusLabel, typeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import PaginationBar from '../../components/PaginationBar.vue';

interface EditablePayload {
  type: QuestionType;
  subject: string;
  category: string;
  knowledge: string;
  difficulty: number;
  stem: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string;
}

const toast = useToast();
const status = ref<'pending' | 'invalid' | 'approved' | 'rejected' | 'all'>('pending');
const items = ref<AiReviewQuestion[]>([]);
const loading = ref(true);
const error = ref('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 10;
const selected = ref<string[]>([]);
const acting = ref<string | null>(null);
const editing = ref<AiReviewQuestion | null>(null);
const editingPayload = ref<EditablePayload | null>(null);
const saving = ref(false);
const rejecting = ref<AiReviewQuestion | null>(null);
const rejectReason = ref('');
const batchBusy = ref(false);

function payloadOf(item: AiReviewQuestion) {
  const raw = item.payload as Record<string, unknown>;
  const points = raw.knowledgePoints ?? raw.knowledge_points;
  return {
    type: String(raw.type ?? 'single') as QuestionType,
    subject: String(raw.subject ?? ''),
    category: String(raw.category ?? ''),
    knowledge: Array.isArray(points) ? points.join('、') : String(points ?? ''),
    difficulty: Number(raw.difficulty ?? 2),
    stem: String(raw.stem ?? ''),
    options: Array.isArray(raw.options)
      ? (raw.options as Array<{ key?: string; text?: string }>).map((option, index) => ({
          key: String(option.key ?? String.fromCharCode(65 + index)),
          text: String(option.text ?? ''),
        }))
      : [],
    answer: Array.isArray(raw.answer) ? raw.answer.map(String) : [],
    explanation: String(raw.explanation ?? ''),
  };
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  selected.value = [];
  try {
    const result = await adminApi.aiReviewList({
      status: status.value === 'all' ? undefined : status.value,
      page: page.value,
      pageSize,
    });
    items.value = result.data;
    total.value = result.pagination?.total ?? result.data.length;
    totalPages.value = result.pagination?.totalPages ?? 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function changeTab(next: typeof status.value): void {
  status.value = next;
  page.value = 1;
  void load();
}

function toggleOne(id: string): void {
  selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id];
}

function openEdit(item: AiReviewQuestion): void {
  editing.value = item;
  editingPayload.value = payloadOf(item);
}

function addOption(): void {
  if (!editingPayload.value || editingPayload.value.options.length >= 8) return;
  const used = new Set(editingPayload.value.options.map((option) => option.key));
  let key = 'A';
  for (const letter of 'ABCDEFGH') {
    if (!used.has(letter)) {
      key = letter;
      break;
    }
  }
  editingPayload.value.options.push({ key, text: '' });
}

function removeOption(index: number): void {
  if (!editingPayload.value || editingPayload.value.options.length <= 2) return;
  const removed = editingPayload.value.options[index];
  editingPayload.value.options.splice(index, 1);
  editingPayload.value.answer = editingPayload.value.answer.filter((item) => item !== removed.key);
}

function toggleAnswer(key: string): void {
  if (!editingPayload.value) return;
  if (editingPayload.value.type === 'single') {
    editingPayload.value.answer = [key];
  } else {
    editingPayload.value.answer = editingPayload.value.answer.includes(key)
      ? editingPayload.value.answer.filter((item) => item !== key)
      : [...editingPayload.value.answer, key].sort();
  }
}

function toApiPayload(): Record<string, unknown> {
  const payload = editingPayload.value!;
  return {
    type: payload.type,
    subject: payload.subject,
    category: payload.category,
    knowledge_points: payload.knowledge.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean),
    difficulty: payload.difficulty,
    stem: payload.stem,
    options: payload.type === 'boolean' ? [] : payload.options,
    answer: payload.answer,
    explanation: payload.explanation,
  };
}

async function saveEdit(alsoApprove = false): Promise<void> {
  if (!editing.value || !editingPayload.value) return;
  saving.value = true;
  try {
    const payload = toApiPayload();
    await adminApi.aiReviewUpdate(editing.value.id, payload);
    if (alsoApprove) {
      await adminApi.aiApprove(editing.value.id, payload);
      toast.success('已保存并发布到题库');
    } else {
      toast.success('修改已保存，仍需审核通过后才会发布');
    }
    editing.value = null;
    editingPayload.value = null;
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function approve(item: AiReviewQuestion): Promise<void> {
  acting.value = item.id;
  try {
    await adminApi.aiApprove(item.id);
    toast.success('已通过审核并发布到题库');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '审核失败');
  } finally {
    acting.value = null;
  }
}

async function reject(): Promise<void> {
  if (!rejecting.value) return;
  acting.value = rejecting.value.id;
  try {
    await adminApi.aiReject(rejecting.value.id, rejectReason.value);
    toast.success('已拒绝');
    rejecting.value = null;
    rejectReason.value = '';
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败');
  } finally {
    acting.value = null;
  }
}

async function regenerate(item: AiReviewQuestion): Promise<void> {
  acting.value = item.id;
  try {
    const result = await adminApi.aiRegenerate(item.id);
    toast.success(result.data.status === 'pending' ? '已重新生成，请检查后审核' : `重新生成完成，但仍有问题：${result.data.errors.join('；')}`);
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '重新生成失败');
  } finally {
    acting.value = null;
  }
}

async function batch(action: 'approve' | 'reject'): Promise<void> {
  if (selected.value.length === 0) {
    toast.error('请先选择题目');
    return;
  }
  batchBusy.value = true;
  try {
    const result = await adminApi.aiBatch({ ids: selected.value, action, reason: '批量审核' });
    toast.success(`批量处理完成：通过 ${result.data.approved}，拒绝 ${result.data.rejected}，失败 ${result.data.failed.length}`);
    if (result.data.failed.length > 0) {
      const message = result.data.failed.map((item) => item.message).join('；');
      toast.info(`部分失败：${message.slice(0, 120)}`);
    }
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '批量处理失败');
  } finally {
    batchBusy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>AI 题目审核</h1><p>AI 生成的题目默认待审核，通过后才会进入正式题库</p></div>
      <RouterLink class="btn btn-ghost" to="/admin/ai">返回出题中心</RouterLink>
    </div>

    <div class="row-between">
      <div class="tabs">
        <button type="button" :class="{ active: status === 'pending' }" @click="changeTab('pending')">待审核</button>
        <button type="button" :class="{ active: status === 'invalid' }" @click="changeTab('invalid')">校验失败</button>
        <button type="button" :class="{ active: status === 'approved' }" @click="changeTab('approved')">已通过</button>
        <button type="button" :class="{ active: status === 'rejected' }" @click="changeTab('rejected')">已拒绝</button>
        <button type="button" :class="{ active: status === 'all' }" @click="changeTab('all')">全部</button>
      </div>
      <div class="row">
        <span class="tiny muted">共 {{ total }} 条</span>
        <button class="btn btn-sm btn-success" :disabled="batchBusy || selected.length === 0" @click="batch('approve')">
          批量通过（{{ selected.length }}）
        </button>
        <button class="btn btn-sm btn-danger" :disabled="batchBusy || selected.length === 0" @click="batch('reject')">批量拒绝</button>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <LoadingBlock v-if="loading" text="正在加载待审核题目…" />

    <template v-else>
      <div v-if="items.length === 0" class="empty">
        <div class="empty-icon">🎉</div>
        <h3>没有需要处理的题目</h3>
        <p class="small">AI 出题后，生成的题目会出现在这里</p>
      </div>

      <div class="stack" style="gap: 14px">
        <article v-for="item in items" :key="item.id" class="card">
          <div class="question-meta">
            <input type="checkbox" :checked="selected.includes(item.id)" @change="toggleOne(item.id)" />
            <span class="badge badge-primary">{{ typeLabel(String(payloadOf(item).type)) }}</span>
            <span class="badge">{{ payloadOf(item).subject }}</span>
            <span class="badge">难度 {{ payloadOf(item).difficulty }} · {{ difficultyLabel(payloadOf(item).difficulty) }}</span>
            <span class="badge" :class="item.status === 'pending' ? 'badge-warning' : item.status === 'approved' ? 'badge-success' : 'badge-danger'">
              {{ statusLabel(item.status) }}
            </span>
            <span v-if="item.duplicateOf" class="badge badge-warning">疑似重复</span>
            <span class="spacer" style="flex: 1" />
            <span class="tiny muted">{{ formatDateTime(item.createdAt) }}</span>
          </div>

          <p class="question-stem" style="font-size: 1rem">{{ payloadOf(item).stem }}</p>

          <div class="row" style="gap: 8px; margin-top: 10px; flex-wrap: wrap">
            <span v-for="option in payloadOf(item).options" :key="option.key" class="badge">
              {{ option.key }}. {{ option.text }}
            </span>
            <span v-if="payloadOf(item).type === 'boolean'" class="badge">
              答案：{{ payloadOf(item).answer[0] === 'true' ? '正确' : '错误' }}
            </span>
            <span v-else class="answer-key">
              <span v-for="key in payloadOf(item).answer" :key="key">{{ key }}</span>
            </span>
          </div>

          <p v-if="payloadOf(item).explanation" class="small muted" style="margin-top: 10px; white-space: pre-wrap">
            解析：{{ payloadOf(item).explanation }}
          </p>

          <div v-for="message in item.validation.errors ?? []" :key="message" class="error-box" style="margin-top: 8px">
            {{ message }}
          </div>
          <div v-for="message in item.validation.warnings ?? []" :key="message" class="notice-box" style="margin-top: 8px">
            {{ message }}
          </div>

          <div class="row" style="margin-top: 14px; justify-content: flex-end">
            <button class="btn btn-sm btn-ghost" :disabled="acting === item.id" @click="openEdit(item)">编辑</button>
            <button class="btn btn-sm btn-ghost" :disabled="acting === item.id" @click="regenerate(item)">
              {{ acting === item.id ? '处理中…' : '重新生成' }}
            </button>
            <button
              v-if="item.status === 'pending' || item.status === 'invalid'"
              class="btn btn-sm btn-danger"
              :disabled="acting === item.id"
              @click="rejecting = item; rejectReason = ''"
            >
              拒绝
            </button>
            <button
              v-if="item.status === 'pending' || item.status === 'invalid'"
              class="btn btn-sm btn-primary"
              :disabled="acting === item.id"
              @click="approve(item)"
            >
              通过并发布
            </button>
          </div>
        </article>
      </div>

      <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
    </template>

    <div v-if="editing && editingPayload" class="modal-backdrop" @click.self="editing = null">
      <div class="modal wide">
        <div class="modal-header"><h2>编辑 AI 题目</h2><button class="btn btn-sm btn-ghost" @click="editing = null">关闭</button></div>
        <div class="form-grid">
          <div class="field">
            <label for="review-type">题型</label>
            <select id="review-type" v-model="editingPayload.type" class="select">
              <option value="single">单选题</option>
              <option value="multiple">多选题</option>
              <option value="boolean">判断题</option>
            </select>
          </div>
          <div class="field">
            <label for="review-subject">科目</label>
            <input id="review-subject" v-model="editingPayload.subject" class="input" />
          </div>
          <div class="field">
            <label for="review-category">分类</label>
            <input id="review-category" v-model="editingPayload.category" class="input" />
          </div>
          <div class="field">
            <label for="review-difficulty">难度</label>
            <select id="review-difficulty" v-model.number="editingPayload.difficulty" class="select">
              <option v-for="level in 5" :key="level" :value="level">{{ level }} 级</option>
            </select>
          </div>
        </div>
        <div class="field" style="margin-top: 12px">
          <label for="review-stem">题干</label>
          <textarea id="review-stem" v-model="editingPayload.stem" class="textarea" rows="3" />
        </div>
        <div class="field" style="margin-top: 12px">
          <label>选项与答案</label>
          <div v-for="(option, index) in editingPayload.options" :key="option.key" class="row" style="gap: 8px; margin-top: 6px; flex-wrap: nowrap">
            <input type="checkbox" :checked="editingPayload.answer.includes(option.key)" @change="toggleAnswer(option.key)" />
            <span class="badge" style="min-width: 28px; justify-content: center">{{ option.key }}</span>
            <input v-model="option.text" class="input" />
            <button class="btn btn-sm btn-ghost" :disabled="editingPayload.options.length <= 2" @click="removeOption(index)">删除</button>
          </div>
          <button class="btn btn-sm btn-soft" style="align-self: flex-start; margin-top: 8px" :disabled="editingPayload.options.length >= 8" @click="addOption">
            + 添加选项
          </button>
        </div>
        <div v-if="editingPayload.type === 'boolean'" class="field" style="margin-top: 12px">
          <label>判断题答案</label>
          <div class="row">
            <label class="checkbox-row"><input v-model="editingPayload.answer" type="radio" value="true" /> 正确</label>
            <label class="checkbox-row"><input v-model="editingPayload.answer" type="radio" value="false" /> 错误</label>
          </div>
        </div>
        <div class="field" style="margin-top: 12px">
          <label for="review-explanation">解析</label>
          <textarea id="review-explanation" v-model="editingPayload.explanation" class="textarea" rows="3" />
        </div>
        <div class="field" style="margin-top: 12px">
          <label for="review-knowledge">知识点</label>
          <input id="review-knowledge" v-model="editingPayload.knowledge" class="input" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="editing = null">取消</button>
          <button class="btn btn-soft" :disabled="saving" @click="saveEdit(false)">{{ saving ? '保存中…' : '仅保存修改' }}</button>
          <button class="btn btn-primary" :disabled="saving" @click="saveEdit(true)">{{ saving ? '处理中…' : '保存并发布' }}</button>
        </div>
      </div>
    </div>

    <div v-if="rejecting" class="modal-backdrop" @click.self="rejecting = null">
      <div class="modal">
        <div class="modal-header"><h2>拒绝该题目</h2></div>
        <div class="field">
          <label for="reject-reason">拒绝原因</label>
          <textarea id="reject-reason" v-model="rejectReason" class="textarea" rows="3" placeholder="例如：答案错误、超出知识点范围" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="rejecting = null">取消</button>
          <button class="btn btn-danger" :disabled="acting === rejecting.id" @click="reject">确认拒绝</button>
        </div>
      </div>
    </div>
  </div>
</template>
