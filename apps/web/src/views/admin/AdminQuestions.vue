<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi, questionApi } from '../../api';
import type { AdminQuestion, FilterOptions } from '../../types';
import { difficultyLabel, formatDateTime, statusLabel, typeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import PaginationBar from '../../components/PaginationBar.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';

const toast = useToast();
const questions = ref<AdminQuestion[]>([]);
const filters = ref<FilterOptions | null>(null);
const loading = ref(true);
const error = ref('');
const q = ref('');
const subject = ref('');
const type = ref('');
const status = ref('');
const difficulty = ref<number | ''>('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 20;
const selected = ref<string[]>([]);
const deleting = ref<AdminQuestion | null>(null);
const deletingBusy = ref(false);
const bulkOpen = ref(false);
const bulkSubject = ref('');
const bulkCategory = ref('');
const bulkBusy = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminApi.questions({
      q: q.value.trim() || undefined,
      subject: subject.value || undefined,
      type: type.value || undefined,
      status: status.value || undefined,
      difficulty: difficulty.value || undefined,
      page: page.value,
      pageSize,
    });
    questions.value = result.data;
    total.value = result.pagination?.total ?? result.data.length;
    totalPages.value = result.pagination?.totalPages ?? 1;
    selected.value = [];
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadFilters(): Promise<void> {
  try {
    filters.value = (await questionApi.filters()).data;
  } catch {
    // 筛选项加载失败不影响列表
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function toggleAll(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  selected.value = checked ? questions.value.map((item) => item.id) : [];
}

function toggleOne(id: string): void {
  selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id];
}

async function publish(question: AdminQuestion): Promise<void> {
  try {
    await adminApi.publishQuestion(question.id);
    toast.success('题目已发布');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '发布失败');
  }
}

async function archive(question: AdminQuestion): Promise<void> {
  if (!window.confirm('归档后普通用户将无法再看到该题，历史成绩不受影响。确认归档？')) return;
  try {
    await adminApi.archiveQuestion(question.id);
    toast.success('题目已归档');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '归档失败');
  }
}

async function remove(): Promise<void> {
  if (!deleting.value) return;
  deletingBusy.value = true;
  try {
    await adminApi.deleteQuestion(deleting.value.id);
    toast.success('题目已删除（软删除）');
    deleting.value = null;
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败');
  } finally {
    deletingBusy.value = false;
  }
}

async function bulkUpdate(): Promise<void> {
  if (!bulkSubject.value.trim() || !bulkCategory.value.trim()) {
    toast.error('请填写科目与分类');
    return;
  }
  bulkBusy.value = true;
  try {
    const result = await adminApi.bulkCategory({ ids: selected.value, subject: bulkSubject.value.trim(), category: bulkCategory.value.trim() });
    toast.success(`已更新 ${result.data.updated} 道题`);
    bulkOpen.value = false;
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '批量修改失败');
  } finally {
    bulkBusy.value = false;
  }
}

async function exportAs(format: 'json' | 'csv'): Promise<void> {
  try {
    await adminApi.exportQuestions(format, {
      subject: subject.value || undefined,
      type: type.value || undefined,
      status: status.value || undefined,
      difficulty: difficulty.value || undefined,
    });
    toast.success('导出已开始下载');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '导出失败');
  }
}

onMounted(() => {
  void loadFilters();
  void load();
});
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>题库管理</h1><p>新增、编辑、发布、归档与批量导入导出</p></div>
      <div class="row">
        <RouterLink class="btn btn-ghost" to="/admin/import">批量导入</RouterLink>
        <button class="btn btn-ghost" @click="exportAs('csv')">导出 CSV</button>
        <button class="btn btn-ghost" @click="exportAs('json')">导出 JSON</button>
        <RouterLink class="btn btn-primary" to="/admin/questions/new">+ 新建题目</RouterLink>
      </div>
    </div>

    <section class="card">
      <div class="filter-bar">
        <div class="field">
          <label for="q-q">搜索题干</label>
          <input id="q-q" v-model="q" class="input" placeholder="关键词" @keyup.enter="search" />
        </div>
        <div class="field">
          <label for="q-subject">科目</label>
          <select id="q-subject" v-model="subject" class="select" @change="search">
            <option value="">全部</option>
            <option v-for="item in filters?.subjects ?? []" :key="item.subject" :value="item.subject">{{ item.subject }}</option>
          </select>
        </div>
        <div class="field">
          <label for="q-type">题型</label>
          <select id="q-type" v-model="type" class="select" @change="search">
            <option value="">全部</option>
            <option value="single">单选题</option>
            <option value="multiple">多选题</option>
            <option value="boolean">判断题</option>
          </select>
        </div>
        <div class="field">
          <label for="q-status">状态</label>
          <select id="q-status" v-model="status" class="select" @change="search">
            <option value="">全部</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="pending">待审核</option>
            <option value="archived">已归档</option>
          </select>
        </div>
        <div class="field">
          <label for="q-difficulty">难度</label>
          <select id="q-difficulty" v-model="difficulty" class="select" @change="search">
            <option value="">全部</option>
            <option v-for="level in 5" :key="level" :value="level">{{ level }} · {{ difficultyLabel(level) }}</option>
          </select>
        </div>
        <button class="btn btn-primary" @click="search">搜索</button>
      </div>

      <div v-if="selected.length > 0" class="row" style="margin-bottom: 12px">
        <span class="badge badge-primary">已选 {{ selected.length }} 道</span>
        <button class="btn btn-sm btn-soft" @click="bulkOpen = true">批量修改分类</button>
        <button class="btn btn-sm btn-ghost" @click="selected = []">取消选择</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>
      <LoadingBlock v-if="loading" text="正在加载题目…" />

      <template v-else>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 36px"><input type="checkbox" :checked="selected.length === questions.length && questions.length > 0" @change="toggleAll" /></th>
                <th>题干</th>
                <th>题型</th>
                <th>科目 / 分类</th>
                <th>难度</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="question in questions" :key="question.id">
                <td><input type="checkbox" :checked="selected.includes(question.id)" @change="toggleOne(question.id)" /></td>
                <td style="max-width: 360px">
                  <div class="small" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">
                    {{ question.stem }}
                  </div>
                  <div class="tiny muted">v{{ question.version }} · {{ question.id }}</div>
                </td>
                <td><span class="badge">{{ typeLabel(question.type) }}</span></td>
                <td class="small">{{ question.subject }}<br /><span class="muted tiny">{{ question.category }}</span></td>
                <td>{{ question.difficulty }}</td>
                <td>
                  <span v-if="question.status === 'published'" class="badge badge-success">已发布</span>
                  <span v-else-if="question.status === 'archived'" class="badge badge-danger">已归档</span>
                  <span v-else class="badge badge-warning">{{ statusLabel(question.status) }}</span>
                </td>
                <td class="small muted">{{ formatDateTime(question.updatedAt) }}</td>
                <td class="actions">
                  <RouterLink class="btn btn-sm btn-ghost" :to="`/admin/questions/${question.id}/edit`">编辑</RouterLink>
                  <button v-if="question.status !== 'published'" class="btn btn-sm btn-success" @click="publish(question)">发布</button>
                  <button v-if="question.status !== 'archived'" class="btn btn-sm btn-ghost" @click="archive(question)">归档</button>
                  <button class="btn btn-sm btn-danger" @click="deleting = question">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="questions.length === 0" class="empty">没有符合条件的题目</div>
        <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
      </template>
    </section>

    <ConfirmDialog
      :open="deleting !== null"
      title="删除题目？"
      message="删除为软删除，历史答题与考试成绩会保留，但普通用户将无法再看到该题。"
      confirm-text="删除"
      danger
      :loading="deletingBusy"
      @cancel="deleting = null"
      @confirm="remove"
    />

    <div v-if="bulkOpen" class="modal-backdrop" @click.self="bulkOpen = false">
      <div class="modal">
        <div class="modal-header"><h2>批量修改分类</h2></div>
        <p class="small muted">将选中的 {{ selected.length }} 道题统一改为以下科目与分类。</p>
        <div class="form-grid" style="margin-top: 12px">
          <div class="field">
            <label for="bulk-subject">科目</label>
            <input id="bulk-subject" v-model="bulkSubject" class="input" placeholder="例如：计算机基础" />
          </div>
          <div class="field">
            <label for="bulk-category">分类</label>
            <input id="bulk-category" v-model="bulkCategory" class="input" placeholder="例如：计算机网络" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="bulkOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="bulkBusy" @click="bulkUpdate">{{ bulkBusy ? '保存中…' : '确认修改' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
