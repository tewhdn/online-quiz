<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api';
import type { AdminStats } from '../../types';
import { formatDateTime, formatNumber } from '../../utils/format';
import LoadingBlock from '../../components/LoadingBlock.vue';
import StatCard from '../../components/StatCard.vue';
import { CalendarDays, Plus, Sparkles, Ticket, Upload } from '@lucide/vue';

const stats = ref<AdminStats | null>(null);
const loading = ref(true);
const error = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    stats.value = (await adminApi.dashboard()).data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div>
        <h1>仪表盘</h1>
        <p>所有数据均来自真实数据库统计</p>
      </div>
      <button class="btn btn-ghost" @click="load">刷新</button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <LoadingBlock v-if="loading" text="正在统计…" />

    <template v-else-if="stats">
      <div class="grid grid-4">
        <StatCard label="注册用户" :value="formatNumber(stats.users.total)" :hint="`本周新增 ${stats.users.newThisWeek}`" />
        <StatCard label="活跃用户" :value="formatNumber(stats.users.active)" tone="success" :hint="`近 7 天答题 ${stats.users.activeThisWeek} 人`" />
        <StatCard label="题库总量" :value="formatNumber(stats.questions.total)" :hint="`已发布 ${stats.questions.published} 道`" />
        <StatCard label="待审核 AI 题目" :value="formatNumber(stats.ai.pendingReview)" tone="warning" hint="需人工审核后发布" />
      </div>

      <div class="grid grid-4">
        <StatCard label="模拟考试" :value="formatNumber(stats.exams.examCount)" :hint="`累计 ${stats.exams.attemptCount} 人次`" />
        <StatCard label="今日答题" :value="formatNumber(stats.answers.today)" hint="道" />
        <StatCard label="AI 任务（30 天）" :value="formatNumber(stats.ai.taskCount)" :hint="`今日 ${stats.ai.todayTasks} 次`" />
        <StatCard
          label="AI Token（30 天）"
          :value="formatNumber(stats.ai.totalTokens)"
          :hint="stats.ai.totalTokens ? '按接口返回用量统计' : '接口未返回用量'"
        />
      </div>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-header"><h2>题库状态</h2><RouterLink class="small" to="/admin/questions">管理题库</RouterLink></div>
          <div class="stack" style="gap: 8px">
            <div class="row-between"><span class="muted small">已发布</span><strong>{{ stats.questions.published }}</strong></div>
            <div class="row-between"><span class="muted small">草稿</span><strong>{{ stats.questions.draft }}</strong></div>
            <div class="row-between"><span class="muted small">待审核</span><strong>{{ stats.questions.pending }}</strong></div>
            <div class="row-between"><span class="muted small">已归档</span><strong>{{ stats.questions.archived }}</strong></div>
            <div class="row-between"><span class="muted small">科目数</span><strong>{{ stats.questions.subjects }}</strong></div>
          </div>
          <div class="divider" />
          <div class="row" style="gap: 8px">
            <span class="badge">单选 {{ stats.questions.byType.single ?? 0 }}</span>
            <span class="badge">多选 {{ stats.questions.byType.multiple ?? 0 }}</span>
            <span class="badge">判断 {{ stats.questions.byType.boolean ?? 0 }}</span>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h2>快捷操作</h2></div>
          <div class="quick-grid">
            <RouterLink class="quick-action" to="/admin/questions/new"><span class="qa-icon"><Plus :size="18" :stroke-width="1.8" /></span><span class="qa-label">新建题目</span></RouterLink>
            <RouterLink class="quick-action" to="/admin/import"><span class="qa-icon"><Upload :size="18" :stroke-width="1.8" /></span><span class="qa-label">批量导入</span></RouterLink>
            <RouterLink class="quick-action" to="/admin/ai"><span class="qa-icon"><Sparkles :size="18" :stroke-width="1.8" /></span><span class="qa-label">AI 出题</span></RouterLink>
            <RouterLink class="quick-action" to="/admin/exams/new"><span class="qa-icon"><CalendarDays :size="18" :stroke-width="1.8" /></span><span class="qa-label">创建考试</span></RouterLink>
            <RouterLink class="quick-action" to="/admin/invites"><span class="qa-icon"><Ticket :size="18" :stroke-width="1.8" /></span><span class="qa-label">生成邀请码</span></RouterLink>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-header"><h2>最近管理员操作</h2><RouterLink class="small" to="/admin/logs">全部日志</RouterLink></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th></tr></thead>
            <tbody>
              <tr v-for="log in stats.recentLogs" :key="log.id">
                <td class="small muted nowrap">{{ formatDateTime(log.createdAt) }}</td>
                <td>{{ log.adminName ?? '—' }}</td>
                <td><span class="mono small">{{ log.action }}</span></td>
                <td class="small muted">{{ log.targetType ?? '—' }} {{ log.targetId ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
