<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { announcementApi, examApi, userApi } from '../../api';
import { useAuthStore } from '../../stores/auth';
import type { Announcement, ExamSummary, UserStats } from '../../types';
import { formatDateTime, formatPercent, formatRelative, modeLabel } from '../../utils/format';
import StatCard from '../../components/StatCard.vue';
import EmptyState from '../../components/EmptyState.vue';
import LoadingBlock from '../../components/LoadingBlock.vue';

const auth = useAuthStore();
const stats = ref<UserStats | null>(null);
const announcements = ref<Announcement[]>([]);
const exams = ref<ExamSummary[]>([]);
const loading = ref(true);
const error = ref('');

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

const maxActivity = computed(() => Math.max(1, ...(stats.value?.dailyActivity ?? []).map((item) => item.answered)));

const quickActions = [
  { to: '/practice', icon: '✏️', label: '开始刷题', sub: '按科目或随机练习' },
  { to: '/exams', icon: '📝', label: '模拟考试', sub: '全真计时模拟' },
  { to: '/mistakes', icon: '📕', label: '错题重练', sub: `待复习 ${stats.value?.wrongCount ?? 0} 道` },
  { to: '/favorites', icon: '⭐', label: '收藏题目', sub: `${stats.value?.favoriteCount ?? 0} 道收藏` },
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [statsResult, announcementResult, examResult] = await Promise.all([
      userApi.stats(),
      announcementApi.list(),
      examApi.list({ pageSize: 3 }),
    ]);
    stats.value = statsResult.data;
    announcements.value = announcementResult.data;
    exams.value = examResult.data;
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
    <section class="card" style="display: flex; flex-wrap: wrap; gap: 18px; align-items: center; justify-content: space-between">
      <div>
        <p class="small muted">{{ today }}</p>
        <h1 style="margin-top: 6px">{{ greeting }}，{{ auth.displayName }}</h1>
        <p class="muted" style="margin-top: 6px">
          今日已答 <strong>{{ stats?.todayAnswered ?? 0 }}</strong> 题，正确率
          <strong>{{ formatPercent(stats?.todayAccuracy ?? 0) }}</strong>
        </p>
      </div>
      <div class="row">
        <RouterLink class="btn btn-primary btn-lg" to="/practice">继续刷题</RouterLink>
        <RouterLink class="btn btn-ghost btn-lg" to="/exams">模拟考试</RouterLink>
      </div>
    </section>

    <div v-if="error" class="error-box">
      {{ error }}
      <button class="btn btn-sm btn-ghost" style="margin-left: 10px" @click="load">重试</button>
    </div>

    <LoadingBlock v-if="loading" text="正在加载学习数据…" />

    <template v-else-if="stats">
      <div class="grid grid-5">
        <StatCard label="今日刷题" :value="stats.todayAnswered" hint="道题" />
        <StatCard label="今日正确率" :value="formatPercent(stats.todayAccuracy)" tone="success" hint="按今日作答计算" />
        <StatCard label="累计答题" :value="stats.totalAnswered" hint="道题" />
        <StatCard label="待复习错题" :value="stats.wrongCount" tone="danger" hint="未标记掌握" />
        <StatCard label="收藏题目" :value="stats.favoriteCount" hint="道题" />
      </div>

      <div class="quick-grid">
        <RouterLink v-for="action in quickActions" :key="action.to" :to="action.to" class="quick-action">
          <span class="qa-icon">{{ action.icon }}</span>
          <span class="qa-label">{{ action.label }}</span>
          <span class="qa-sub">{{ action.sub }}</span>
        </RouterLink>
      </div>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-header">
            <h2>最近 7 天学习</h2>
            <span class="muted small">累计 {{ stats.totalAnswered }} 题</span>
          </div>
          <div v-if="stats.dailyActivity.length === 0" class="muted small">最近 7 天还没有答题记录，从今天开始吧。</div>
          <div v-else class="activity-bars">
            <div v-for="day in stats.dailyActivity" :key="day.date" class="activity-bar">
              <div class="activity-track">
                <div
                  class="activity-fill"
                  :style="{ height: `${Math.max(6, (day.answered / maxActivity) * 100)}%` }"
                  :title="`${day.date}：${day.answered} 题，正确 ${day.correct} 题`"
                />
              </div>
              <span class="tiny muted">{{ day.date.slice(5) }}</span>
              <span class="tiny strong">{{ day.answered }}</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2>最近考试</h2>
            <RouterLink class="small" to="/exams">全部考试</RouterLink>
          </div>
          <div v-if="stats.lastExam" class="stack" style="gap: 10px">
            <div class="row-between">
              <div>
                <div class="strong">{{ stats.lastExam.title }}</div>
                <div class="tiny muted">{{ formatDateTime(stats.lastExam.submittedAt) }}</div>
              </div>
              <div class="strong" style="font-size: 1.2rem">
                {{ stats.lastExam.score }}<span class="muted small"> / {{ stats.lastExam.totalScore }}</span>
              </div>
            </div>
            <RouterLink class="btn btn-soft btn-sm" :to="`/exam-attempts/${stats.lastExam.id}/result`">查看成绩分析</RouterLink>
          </div>
          <EmptyState v-else title="还没有考试记录" description="选择一场模拟考试检验学习效果" icon="📝">
            <RouterLink class="btn btn-soft btn-sm" to="/exams">去看看</RouterLink>
          </EmptyState>

          <div v-if="exams.length > 0" class="divider" />
          <div v-for="exam in exams" :key="exam.id" class="list-item">
            <div class="li-main">
              <RouterLink :to="`/exams/${exam.id}`" class="strong">{{ exam.title }}</RouterLink>
              <div class="tiny muted">
                {{ exam.totalQuestions }} 题 · {{ exam.durationMinutes }} 分钟 · 满分 {{ exam.totalScore }}
              </div>
            </div>
            <span class="badge">{{ exam.attemptCount }} 人已考</span>
          </div>
        </section>
      </div>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-header">
            <h2>系统公告</h2>
            <RouterLink v-if="auth.isAdmin" class="small" to="/admin/announcements">管理</RouterLink>
          </div>
          <div v-if="announcements.length === 0" class="muted small">暂无公告</div>
          <div v-for="item in announcements" :key="item.id" class="announcement">
            <div class="row" style="gap: 8px; align-items: flex-start">
              <span v-if="item.pinned" class="badge badge-warning">置顶</span>
              <div>
                <div class="strong">{{ item.title }}</div>
                <p class="small" style="white-space: pre-wrap; margin-top: 4px">{{ item.content }}</p>
                <div class="tiny muted" style="margin-top: 6px">{{ formatRelative(item.publishedAt) }}</div>
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2>最近学习记录</h2>
            <RouterLink class="small" to="/profile">学习档案</RouterLink>
          </div>
          <div v-if="stats.recentRecords.length === 0" class="muted small">还没有答题记录</div>
          <div v-for="record in stats.recentRecords" :key="record.id" class="list-item">
            <span class="badge" :class="record.isCorrect ? 'badge-success' : 'badge-danger'">{{ record.isCorrect ? '正确' : '错误' }}</span>
            <div class="li-main">
              <div class="small truncate">{{ record.stem }}</div>
              <div class="tiny muted">{{ record.subject }} · {{ modeLabel(record.source) }} · {{ formatRelative(record.createdAt) }}</div>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.activity-bars {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  height: 150px;
  padding-top: 8px;
}
.activity-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
}
.activity-track {
  flex: 1;
  width: 100%;
  max-width: 46px;
  border-radius: 8px;
  background: var(--surface-3);
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.activity-fill {
  width: 100%;
  border-radius: 8px;
  background: linear-gradient(180deg, var(--primary), var(--accent));
  transition: height 0.4s ease;
}
.announcement + .announcement {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
</style>
