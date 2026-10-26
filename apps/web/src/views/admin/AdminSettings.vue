<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { adminApi } from '../../api';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';

const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const info = ref<{
  model: string;
  environment: string;
  deepseekConfigured: boolean;
  r2Enabled: boolean;
} | null>(null);

const form = reactive({
  siteName: '',
  aiEnabled: true,
  aiDailyTaskLimit: 20,
  aiMaxQuestions: 50,
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = (await adminApi.settings()).data;
    form.siteName = data.siteName;
    form.aiEnabled = data.aiEnabled;
    form.aiDailyTaskLimit = data.aiDailyTaskLimit;
    form.aiMaxQuestions = data.aiMaxQuestions;
    info.value = {
      model: data.model,
      environment: data.environment,
      deepseekConfigured: data.deepseekConfigured,
      r2Enabled: data.r2Enabled,
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await adminApi.updateSettings({
      siteName: form.siteName.trim(),
      aiEnabled: form.aiEnabled,
      aiDailyTaskLimit: Number(form.aiDailyTaskLimit),
      aiMaxQuestions: Number(form.aiMaxQuestions),
    });
    toast.success('设置已保存');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>系统设置</h1><p>站点信息与 AI 出题安全限制</p></div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <LoadingBlock v-if="loading" text="正在加载设置…" />

    <template v-else>
      <section class="card">
        <div class="card-header"><h2>站点信息</h2></div>
        <div class="field">
          <label for="settings-site">站点名称</label>
          <input id="settings-site" v-model="form.siteName" class="input" maxlength="40" />
        </div>
        <div class="grid grid-3" style="margin-top: 14px">
          <div class="card card-flat" style="padding: 12px"><div class="tiny muted">环境</div><strong>{{ info?.environment }}</strong></div>
          <div class="card card-flat" style="padding: 12px"><div class="tiny muted">DeepSeek 模型</div><strong>{{ info?.model }}</strong></div>
          <div class="card card-flat" style="padding: 12px">
            <div class="tiny muted">API Key</div>
            <strong :style="{ color: info?.deepseekConfigured ? 'var(--success)' : 'var(--danger)' }">
              {{ info?.deepseekConfigured ? '已配置' : '未配置' }}
            </strong>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>AI 出题</h2></div>
        <label class="checkbox-row">
          <input v-model="form.aiEnabled" type="checkbox" />
          启用 AI 出题（关闭后管理员也无法调用）
        </label>
        <div class="form-grid" style="margin-top: 14px">
          <div class="field">
            <label for="settings-daily">每日任务上限（1-500）</label>
            <input id="settings-daily" v-model.number="form.aiDailyTaskLimit" class="input" type="number" min="1" max="500" />
          </div>
          <div class="field">
            <label for="settings-max">单次生成上限（1-50）</label>
            <input id="settings-max" v-model.number="form.aiMaxQuestions" class="input" type="number" min="1" max="50" />
          </div>
        </div>
        <p class="hint" style="margin-top: 12px">
          AI 调用费用由 DeepSeek 账户承担，与 Cloudflare 免费额度无关。系统会记录每次调用的模型、Token 用量与任务状态。
        </p>
      </section>

      <section class="card">
        <div class="card-header"><h2>文件存储</h2></div>
        <p class="small">
          当前状态：<span class="badge" :class="info?.r2Enabled ? 'badge-success' : ''">{{ info?.r2Enabled ? '已绑定 R2' : '未绑定 R2（资料文本存入 D1）' }}</span>
        </p>
        <p class="hint" style="margin-top: 8px">
          R2 为可选服务。未绑定时，上传资料的提取文本会保存在 D1，基础答题与 AI 出题功能不受影响。
        </p>
      </section>

      <div class="row" style="justify-content: flex-end">
        <button class="btn btn-primary" :disabled="saving" @click="save">
          <span v-if="saving" class="spinner" />
          {{ saving ? '保存中…' : '保存设置' }}
        </button>
      </div>
    </template>
  </div>
</template>
