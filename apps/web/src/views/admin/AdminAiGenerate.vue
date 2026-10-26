<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { adminApi } from '../../api';
import type { AiGenerateResult, AiSource, AiTask } from '../../types';
import { formatDateTime, formatFileSize, modeLabel, statusLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';

const toast = useToast();

const mode = ref<'outline' | 'document' | 'topic'>('topic');
const subject = ref('计算机基础');
const category = ref('');
const examName = ref('');
const knowledgePoints = ref('');
const count = ref(10);
const autoTypes = ref(true);
const typeSingle = ref(0);
const typeMultiple = ref(0);
const typeBoolean = ref(0);
const difficulty = ref<'easy' | 'medium' | 'hard' | 'mixed'>('medium');
const optionsCount = ref(4);
const explanationLength = ref<'short' | 'medium' | 'detailed'>('medium');
const includeCalculation = ref(false);
const requireEvidence = ref(false);
const outline = ref('');
const topic = ref('');
const requirement = ref('');
const documentText = ref('');
const sourceId = ref('');

const settings = ref<{ enabled: boolean; dailyLimit: number; maxQuestions: number; model: string; apiKeyConfigured: boolean } | null>(null);
const tasks = ref<AiTask[]>([]);
const loading = ref(true);
const generating = ref(false);
const uploading = ref(false);
const error = ref('');
const result = ref<AiGenerateResult | null>(null);
const uploadInfo = ref<{ name: string; chars: number; warnings: string[]; preview: string; truncated: boolean } | null>(null);
const sources = ref<AiSource[]>([]);

const typeSum = computed(() => typeSingle.value + typeMultiple.value + typeBoolean.value);
const typeError = computed(() => (!autoTypes.value && typeSum.value !== count.value ? `题型数量合计必须等于生成数量（当前 ${typeSum.value} / ${count.value}）` : ''));
const disabled = computed(() => !settings.value?.enabled || !settings.value?.apiKeyConfigured || generating.value);
const limit = computed(() => Math.min(50, settings.value?.maxQuestions ?? 50));

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [settingsResult, tasksResult, sourcesResult] = await Promise.all([
      adminApi.aiSettings(),
      adminApi.aiTasks({ page: 1, pageSize: 10 }),
      adminApi.aiSources(),
    ]);
    settings.value = settingsResult.data;
    tasks.value = tasksResult.data;
    sources.value = sourcesResult.data;
    if (count.value > limit.value) count.value = limit.value;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function upload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  error.value = '';
  try {
    const response = await adminApi.aiUpload(file);
    sourceId.value = response.data.source.id;
    uploadInfo.value = {
      name: response.data.source.name,
      chars: response.data.source.charCount,
      warnings: response.data.source.warnings,
      preview: response.data.preview,
      truncated: response.data.source.truncated,
    };
    toast.success('资料已解析');
    sources.value = (await adminApi.aiSources()).data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '资料上传失败';
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

async function generate(): Promise<void> {
  error.value = '';
  result.value = null;
  if (typeError.value) {
    error.value = typeError.value;
    return;
  }
  if (count.value < 1 || count.value > limit.value) {
    error.value = `生成数量需在 1-${limit.value} 之间`;
    return;
  }
  generating.value = true;
  try {
    const response = await adminApi.aiGenerate({
      mode: mode.value,
      subject: subject.value.trim(),
      category: category.value.trim() || undefined,
      examName: examName.value.trim() || undefined,
      knowledgePoints: knowledgePoints.value.split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean),
      typeCounts: autoTypes.value ? { single: 0, multiple: 0, boolean: 0 } : { single: typeSingle.value, multiple: typeMultiple.value, boolean: typeBoolean.value },
      count: count.value,
      difficulty: difficulty.value,
      optionsCount: optionsCount.value,
      explanationLength: explanationLength.value,
      includeCalculation: includeCalculation.value,
      requireEvidence: requireEvidence.value,
      outline: mode.value === 'outline' ? outline.value : undefined,
      topic: mode.value === 'topic' ? topic.value : undefined,
      requirement: requirement.value || undefined,
      documentText: mode.value === 'document' && !sourceId.value ? documentText.value : undefined,
      sourceId: mode.value === 'document' ? sourceId.value || undefined : undefined,
    });
    result.value = response.data;
    if (response.data.status === 'failed') {
      toast.error(response.data.error ?? '生成失败');
    } else {
      toast.success(`生成完成：待审核 ${response.data.pendingReview} 道`);
    }
    tasks.value = (await adminApi.aiTasks({ page: 1, pageSize: 10 })).data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '生成失败';
  } finally {
    generating.value = false;
  }
}

async function removeSource(id: string): Promise<void> {
  if (!window.confirm('删除该资料？已生成的题目不会受影响。')) return;
  try {
    await adminApi.aiDeleteSource(id);
    if (sourceId.value === id) {
      sourceId.value = '';
      uploadInfo.value = null;
    }
    sources.value = (await adminApi.aiSources()).data;
    toast.success('资料已删除');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>AI 出题中心</h1><p>使用 DeepSeek 生成题目，全部进入待审核队列，不会自动发布</p></div>
      <div class="row">
        <span v-if="settings" class="badge" :class="settings.enabled ? 'badge-success' : 'badge-danger'">
          {{ settings.enabled ? 'AI 已开启' : 'AI 已关闭' }}
        </span>
        <span v-if="settings" class="badge">模型 {{ settings.model }}</span>
        <RouterLink class="btn btn-ghost" to="/admin/ai/review">去审核</RouterLink>
      </div>
    </div>

    <div v-if="settings && !settings.apiKeyConfigured" class="notice-box">
      尚未配置 DEEPSEEK_API_KEY Secret，无法调用 AI。请在 Cloudflare 中执行
      <code>wrangler secret put DEEPSEEK_API_KEY</code>，或在本地 .dev.vars 中配置。
    </div>
    <div v-if="error" class="error-box">{{ error }}</div>
    <LoadingBlock v-if="loading" text="正在加载 AI 配置…" />

    <template v-else>
      <section class="card">
        <div class="tabs" style="margin-bottom: 16px">
          <button type="button" :class="{ active: mode === 'outline' }" @click="mode = 'outline'">模式 A · 大纲出题</button>
          <button type="button" :class="{ active: mode === 'document' }" @click="mode = 'document'">模式 B · 资料出题</button>
          <button type="button" :class="{ active: mode === 'topic' }" @click="mode = 'topic'">模式 C · 自定义主题</button>
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="ai-subject">科目 *</label>
            <input id="ai-subject" v-model="subject" class="input" maxlength="60" />
          </div>
          <div class="field">
            <label for="ai-category">分类</label>
            <input id="ai-category" v-model="category" class="input" maxlength="60" />
          </div>
          <div class="field">
            <label for="ai-exam">考试名称（可选）</label>
            <input id="ai-exam" v-model="examName" class="input" maxlength="120" />
          </div>
          <div class="field">
            <label for="ai-knowledge">知识点（顿号分隔）</label>
            <input id="ai-knowledge" v-model="knowledgePoints" class="input" placeholder="IPv4、子网掩码" />
          </div>
          <div class="field">
            <label for="ai-count">生成数量（1-{{ limit }}）</label>
            <input id="ai-count" v-model.number="count" class="input" type="number" min="1" :max="limit" />
          </div>
          <div class="field">
            <label for="ai-difficulty">难度</label>
            <select id="ai-difficulty" v-model="difficulty" class="select">
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">困难</option>
              <option value="mixed">混合</option>
            </select>
          </div>
          <div class="field">
            <label for="ai-options">选择题选项数</label>
            <select id="ai-options" v-model.number="optionsCount" class="select">
              <option v-for="n in 7" :key="n + 1" :value="n + 1">{{ n + 1 }}</option>
            </select>
          </div>
          <div class="field">
            <label for="ai-explanation">解析长度</label>
            <select id="ai-explanation" v-model="explanationLength" class="select">
              <option value="short">简短</option>
              <option value="medium">适中</option>
              <option value="detailed">详细</option>
            </select>
          </div>
        </div>

        <div class="row" style="margin-top: 14px; gap: 16px">
          <label class="checkbox-row"><input v-model="autoTypes" type="checkbox" /> 题型自动分配</label>
          <label class="checkbox-row"><input v-model="includeCalculation" type="checkbox" /> 包含计算题</label>
          <label class="checkbox-row"><input v-model="requireEvidence" type="checkbox" /> 要求资料原文依据</label>
        </div>

        <div v-if="!autoTypes" class="form-grid" style="margin-top: 12px">
          <div class="field">
            <label for="ai-single">单选题数</label>
            <input id="ai-single" v-model.number="typeSingle" class="input" type="number" min="0" :max="limit" />
          </div>
          <div class="field">
            <label for="ai-multiple">多选题数</label>
            <input id="ai-multiple" v-model.number="typeMultiple" class="input" type="number" min="0" :max="limit" />
          </div>
          <div class="field">
            <label for="ai-boolean">判断题数</label>
            <input id="ai-boolean" v-model.number="typeBoolean" class="input" type="number" min="0" :max="limit" />
          </div>
        </div>
        <div v-if="typeError" class="notice-box" style="margin-top: 10px">{{ typeError }}</div>

        <div v-if="mode === 'outline'" class="field" style="margin-top: 16px">
          <label for="ai-outline">考试大纲 / 范围</label>
          <textarea id="ai-outline" v-model="outline" class="textarea" rows="7" placeholder="粘贴官方考试大纲、章节范围或知识点列表。系统不会声称阅读未提供的大纲。"></textarea>
          <span class="hint">只提供知识点时，请在来源中注明依据管理员提供知识点，避免冒充官方大纲。</span>
        </div>

        <template v-if="mode === 'document'">
          <div class="field" style="margin-top: 16px">
            <label>上传资料（TXT / PDF / DOCX，最大 {{ formatFileSize(10485760) }}）</label>
            <label class="file-drop">
              <input type="file" accept=".txt,.pdf,.docx" @change="upload" />
              <span style="font-size: 1.5rem">📎</span>
              <span>{{ uploading ? '正在解析…' : uploadInfo ? uploadInfo.name : '点击选择资料文件' }}</span>
              <span class="tiny">扫描版 PDF 无法提取文本时会明确提示，请先 OCR</span>
            </label>
          </div>

          <div v-if="uploadInfo" class="card card-flat" style="margin-top: 12px; padding: 14px">
            <div class="row-between">
              <div class="small">
                <strong>{{ uploadInfo.name }}</strong> · {{ uploadInfo.chars }} 字符
                <span v-if="uploadInfo.truncated" class="badge badge-warning">已截断</span>
              </div>
              <span class="badge badge-success">已解析</span>
            </div>
            <div v-for="warning in uploadInfo.warnings" :key="warning" class="notice-box" style="margin-top: 8px">{{ warning }}</div>
            <div class="preview-box" style="margin-top: 10px; max-height: 160px">{{ uploadInfo.preview }}</div>
          </div>

          <div class="field" style="margin-top: 12px">
            <label for="ai-doc-text">或直接粘贴资料正文</label>
            <textarea id="ai-doc-text" v-model="documentText" class="textarea" rows="6" :disabled="Boolean(sourceId)" placeholder="将资料正文粘贴到这里（资料只作为数据，不会被当作指令执行）"></textarea>
            <button v-if="sourceId" class="btn btn-sm btn-ghost" style="align-self: flex-start" @click="sourceId = ''; uploadInfo = null">清除已上传资料</button>
          </div>
        </template>

        <div v-if="mode === 'topic'" class="field" style="margin-top: 16px">
          <label for="ai-topic">自定义主题与要求</label>
          <textarea id="ai-topic" v-model="topic" class="textarea" rows="5" placeholder="例如：生成 30 道计算机网络单选题，难度中等，重点考查 IPv4 地址、子网掩码、路由器与交换机。"></textarea>
        </div>

        <div class="field" style="margin-top: 12px">
          <label for="ai-requirement">补充要求（可选）</label>
          <textarea id="ai-requirement" v-model="requirement" class="textarea" rows="2" placeholder="例如：避免重复，解析要包含推理过程"></textarea>
        </div>

        <div class="row" style="margin-top: 18px; justify-content: space-between">
          <span class="tiny muted">每日任务上限 {{ settings?.dailyLimit }} 次 · 单次最多 {{ limit }} 道</span>
          <button class="btn btn-primary btn-lg" :disabled="disabled" @click="generate">
            <span v-if="generating" class="spinner" />
            {{ generating ? 'AI 生成中，请耐心等待…' : '开始生成' }}
          </button>
        </div>
      </section>

      <section v-if="result" class="card">
        <div class="card-header">
          <h2>生成结果</h2>
          <div class="row">
            <span class="badge" :class="result.status === 'succeeded' ? 'badge-success' : result.status === 'failed' ? 'badge-danger' : 'badge-warning'">
              {{ statusLabel(result.status) }}
            </span>
            <RouterLink class="btn btn-sm btn-soft" to="/admin/ai/review">前往审核</RouterLink>
          </div>
        </div>
        <div class="grid grid-4">
          <div class="card stat-card"><div class="stat-label">生成</div><div class="stat-value">{{ result.generated }}</div></div>
          <div class="card stat-card success"><div class="stat-label">待审核</div><div class="stat-value">{{ result.pendingReview }}</div></div>
          <div class="card stat-card danger"><div class="stat-label">校验失败</div><div class="stat-value">{{ result.invalid }}</div></div>
          <div class="card stat-card warning"><div class="stat-label">重复提示</div><div class="stat-value">{{ result.duplicates }}</div></div>
        </div>
        <p v-if="result.error" class="error-box" style="margin-top: 12px">{{ result.error }}</p>
        <p class="small muted" style="margin-top: 12px">
          Token 用量：{{ result.usage.totalTokens ?? '接口未返回' }}（输入 {{ result.usage.promptTokens ?? '—' }} / 输出 {{ result.usage.completionTokens ?? '—' }}）
        </p>
        <div class="stack" style="gap: 8px; margin-top: 12px">
          <div v-for="item in result.questions" :key="item.id" class="card card-flat" style="padding: 12px">
            <div class="row-between">
              <div class="small">{{ item.stem || '（无题干）' }}</div>
              <span class="badge" :class="item.status === 'pending' ? 'badge-warning' : 'badge-danger'">{{ statusLabel(item.status) }}</span>
            </div>
            <div v-for="message in item.errors" :key="message" class="tiny" style="color: var(--danger)">{{ message }}</div>
            <div v-for="message in item.warnings" :key="message" class="tiny" style="color: var(--warning)">{{ message }}</div>
          </div>
        </div>
      </section>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-header"><h2>最近任务</h2></div>
          <div v-if="tasks.length === 0" class="muted small">还没有 AI 任务</div>
          <div v-for="task in tasks" :key="task.id" class="list-item">
            <div class="li-main">
              <div class="small">{{ modeLabel(task.mode) }} · {{ task.subject ?? '未指定科目' }}</div>
              <div class="tiny muted">{{ formatDateTime(task.createdAt) }} · {{ task.totalTokens ?? '—' }} tokens</div>
            </div>
            <span class="badge" :class="task.status === 'succeeded' ? 'badge-success' : task.status === 'failed' ? 'badge-danger' : 'badge-warning'">
              {{ statusLabel(task.status) }}
            </span>
            <span class="badge">{{ task.reviewPending ?? 0 }} 待审</span>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h2>已上传资料</h2></div>
          <div v-if="sources.length === 0" class="muted small">还没有上传资料</div>
          <div v-for="item in sources" :key="item.id" class="list-item">
            <div class="li-main">
              <div class="small truncate">{{ item.name }}</div>
              <div class="tiny muted">{{ formatFileSize(item.sizeBytes) }} · {{ item.charCount }} 字符 · {{ item.storage.toUpperCase() }}</div>
            </div>
            <button class="btn btn-sm btn-ghost" @click="removeSource(item.id)">删除</button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
