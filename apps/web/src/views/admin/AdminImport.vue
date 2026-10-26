<script setup lang="ts">
import { computed, ref } from 'vue';
import { adminApi } from '../../api';
import type { ImportSummary } from '../../types';
import { useToast } from '../../composables/useToast';
import { ClipboardList, FileText } from '@lucide/vue';

const toast = useToast();

const format = ref<'json' | 'csv'>('json');
const content = ref('');
const fileName = ref('');
const strategy = ref<'skip' | 'update' | 'create'>('skip');
const defaultStatus = ref<'draft' | 'published'>('draft');
const mode = ref<'preview' | 'commit'>('preview');
const busy = ref(false);
const error = ref('');
const result = ref<ImportSummary | null>(null);

const sample = `{
  "version": 1,
  "questions": [
    {
      "type": "single",
      "subject": "计算机基础",
      "category": "计算机网络",
      "knowledge_points": ["IP地址"],
      "difficulty": 2,
      "stem": "IPv4 地址由多少位二进制数组成？",
      "options": [
        { "key": "A", "text": "16 位" },
        { "key": "B", "text": "32 位" },
        { "key": "C", "text": "64 位" },
        { "key": "D", "text": "128 位" }
      ],
      "answer": ["B"],
      "explanation": "IPv4 地址长度为 32 位。",
      "source": "示例题"
    }
  ]
}`;

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast.error('文件不能超过 5 MB');
    return;
  }
  fileName.value = file.name;
  if (file.name.toLowerCase().endsWith('.csv')) format.value = 'csv';
  if (file.name.toLowerCase().endsWith('.json')) format.value = 'json';
  content.value = await file.text();
  result.value = null;
}

async function run(nextMode: 'preview' | 'commit'): Promise<void> {
  error.value = '';
  if (!content.value.trim()) {
    error.value = '请粘贴内容或选择文件';
    return;
  }
  mode.value = nextMode;
  busy.value = true;
  try {
    const response = await adminApi.importQuestions({
      format: format.value,
      content: content.value,
      mode: nextMode,
      duplicateStrategy: strategy.value,
      defaultStatus: defaultStatus.value,
    });
    result.value = response.data;
    if (nextMode === 'preview') {
      toast.info(`预览完成：可导入 ${response.data.valid} 道，问题 ${response.data.invalid} 条`);
    } else {
      toast.success(`导入完成：新增 ${response.data.inserted}，更新 ${response.data.updated}，跳过 ${response.data.skipped}`);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '导入失败';
    const details = (err as { details?: unknown }).details;
    if (Array.isArray(details)) error.value += `：${details.join('；')}`;
  } finally {
    busy.value = false;
  }
}

function reset(): void {
  content.value = '';
  fileName.value = '';
  result.value = null;
  error.value = '';
}

const canCommit = computed(() => result.value && result.value.mode === 'preview' && result.value.valid > 0);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div>
        <h1>批量导入题库</h1>
        <p>支持 JSON 与 CSV；导入前先预览，确认后再写入数据库</p>
      </div>
      <RouterLink class="btn btn-ghost" to="/admin/questions">返回题库</RouterLink>
    </div>

    <div class="grid grid-2">
      <section class="card">
        <div class="card-header"><h2>导入内容</h2><button class="btn btn-sm btn-ghost" @click="reset">清空</button></div>

        <div class="form-grid">
          <div class="field">
            <label for="import-format">格式</label>
            <select id="import-format" v-model="format" class="select">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div class="field">
            <label for="import-strategy">重复处理策略</label>
            <select id="import-strategy" v-model="strategy" class="select">
              <option value="skip">跳过重复题目</option>
              <option value="update">更新匹配题目</option>
              <option value="create">全部作为新题导入</option>
            </select>
          </div>
          <div class="field">
            <label for="import-status">新题默认状态</label>
            <select id="import-status" v-model="defaultStatus" class="select">
              <option value="draft">草稿（推荐）</option>
              <option value="published">直接发布</option>
            </select>
          </div>
        </div>

        <label class="file-drop" style="margin-top: 14px">
          <input type="file" accept=".json,.csv,application/json,text/csv" @change="onFile" />
          <FileText :size="24" :stroke-width="1.7" />
          <span>{{ fileName || '点击选择 JSON / CSV 文件' }}</span>
          <span class="tiny">最大 5 MB · 单次最多 1000 道题</span>
        </label>

        <div class="field" style="margin-top: 14px">
          <label for="import-content">或直接粘贴内容</label>
          <textarea id="import-content" v-model="content" class="textarea" rows="12" :placeholder="format === 'json' ? sample : 'type,subject,category,knowledge_points,difficulty,stem,options,answer,explanation,source'"></textarea>
        </div>

        <div class="row" style="margin-top: 14px; justify-content: flex-end">
          <button class="btn btn-ghost" @click="content = format === 'json' ? sample : content">填入 JSON 示例</button>
          <button class="btn btn-soft" :disabled="busy" @click="run('preview')">
            <span v-if="busy && mode === 'preview'" class="spinner" />
            预览
          </button>
          <button class="btn btn-primary" :disabled="busy || !canCommit" @click="run('commit')">
            <span v-if="busy && mode === 'commit'" class="spinner" />
            确认导入
          </button>
        </div>
        <p class="hint" style="margin-top: 8px">
          导入行为：合法题目写入，非法题目跳过并给出行号；不会清空已有题库。选择「更新匹配题目」时会提升版本号并保存修订快照。
        </p>
        <div v-if="error" class="error-box" style="margin-top: 12px">{{ error }}</div>
      </section>

      <section class="card">
        <div class="card-header"><h2>导入结果</h2></div>
        <div v-if="!result" class="empty">
          <div class="empty-icon"><ClipboardList :size="20" /></div>
          <h3>还没有预览结果</h3>
          <p class="small">点击「预览」查看可导入数量与错误详情</p>
        </div>
        <template v-else>
          <div class="grid grid-3">
            <div class="card stat-card"><div class="stat-label">总计</div><div class="stat-value">{{ result.total }}</div></div>
            <div class="card stat-card success"><div class="stat-label">可导入</div><div class="stat-value">{{ result.valid }}</div></div>
            <div class="card stat-card danger"><div class="stat-label">有问题</div><div class="stat-value">{{ result.invalid }}</div></div>
          </div>
          <div class="row" style="margin-top: 12px; gap: 8px">
            <span class="badge">重复 {{ result.duplicates }}</span>
            <span v-if="result.mode === 'commit'" class="badge badge-success">新增 {{ result.inserted }}</span>
            <span v-if="result.mode === 'commit'" class="badge badge-warning">更新 {{ result.updated }}</span>
            <span class="badge">跳过 {{ result.skipped }}</span>
            <span class="badge">{{ result.mode === 'preview' ? '预览模式（未写入）' : '已写入数据库' }}</span>
          </div>

          <div v-if="result.duplicateDetails.length > 0" style="margin-top: 16px">
            <h3 style="font-size: 0.95rem">重复题目</h3>
            <div class="table-wrap" style="max-height: 220px; overflow: auto">
              <table class="table" style="min-width: 100%">
                <thead><tr><th>行号</th><th>原因</th><th>已存在题目</th></tr></thead>
                <tbody>
                  <tr v-for="item in result.duplicateDetails" :key="`${item.row}-${item.existingId}`">
                    <td>{{ item.row }}</td>
                    <td>{{ item.reason }}（相似度 {{ item.similarity }}）</td>
                    <td class="mono tiny">{{ item.existingId }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="result.errors.length > 0" style="margin-top: 16px">
            <h3 style="font-size: 0.95rem">错误详情（最多 100 条）</h3>
            <div class="preview-box" style="max-height: 240px">
              <div v-for="item in result.errors" :key="`${item.row}-${item.message}`" class="small">
                <strong>第 {{ item.row }} 行：</strong>{{ item.message }}
              </div>
            </div>
          </div>

          <div v-if="result.preview.length > 0" style="margin-top: 16px">
            <h3 style="font-size: 0.95rem">题目预览（前 10 道）</h3>
            <div class="stack" style="gap: 8px">
              <div v-for="(item, index) in result.preview" :key="index" class="preview-item">
                <div class="tiny muted">第 {{ index + 1 }} 题 · {{ item.type }}</div>
                <div class="small" style="margin-top: 4px">{{ item.stem }}</div>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
