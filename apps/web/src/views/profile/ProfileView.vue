<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { userApi } from '../../api';
import { useAuthStore } from '../../stores/auth';
import type { UserStats } from '../../types';
import { formatDateTime, formatPercent, modeLabel } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import StatCard from '../../components/StatCard.vue';

interface Profile {
  id: string;
  username: string;
  role: 'admin' | 'user';
  displayName: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  mustChangePassword: boolean;
}

interface History {
  practiceSessions: Array<{
    id: string;
    mode: string;
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    status: string;
    startedAt: number;
    finishedAt: number | null;
  }>;
  recentAnswers: Array<{ id: string; stem: string; subject: string; isCorrect: boolean; source: string; createdAt: number }>;
}

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();

const profile = ref<Profile | null>(null);
const stats = ref<UserStats | null>(null);
const history = ref<History | null>(null);
const loading = ref(true);
const error = ref('');
const displayName = ref('');
const savingName = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [profileResult, statsResult, historyResult] = await Promise.all([
      userApi.profile(),
      userApi.stats(),
      userApi.history({ page: 1, pageSize: 8 }),
    ]);
    profile.value = profileResult.data as Profile;
    stats.value = statsResult.data;
    history.value = historyResult.data;
    displayName.value = profileResult.data.displayName ?? '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function saveDisplayName(): Promise<void> {
  savingName.value = true;
  try {
    await userApi.updateProfile({ displayName: displayName.value.trim() });
    await auth.init(true);
    toast.success('昵称已更新');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败');
  } finally {
    savingName.value = false;
  }
}

async function logout(): Promise<void> {
  await auth.logout();
  await router.replace('/auth/login');
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div>
        <h1>个人中心</h1>
        <p>查看学习档案、修改资料与密码</p>
      </div>
      <RouterLink class="btn btn-ghost" to="/">返回首页</RouterLink>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <LoadingBlock v-if="loading" text="正在加载个人资料…" />

    <template v-else>
      <div class="grid grid-2">
        <section class="card">
          <div class="card-header"><h2>账号信息</h2><span class="badge badge-primary">{{ profile?.role === 'admin' ? '管理员' : '普通用户' }}</span></div>
          <div class="stack" style="gap: 10px">
            <div class="row-between"><span class="muted small">用户名</span><strong>{{ profile?.username }}</strong></div>
            <div class="row-between"><span class="muted small">注册时间</span><span class="small">{{ formatDateTime(profile?.createdAt) }}</span></div>
            <div class="row-between"><span class="muted small">最近登录</span><span class="small">{{ formatDateTime(profile?.lastLoginAt) }}</span></div>
          </div>
          <div class="divider" />
          <div class="field">
            <label for="display-name">昵称（仅自己可见的展示名）</label>
            <div class="row" style="gap: 8px">
              <input id="display-name" v-model="displayName" class="input" maxlength="30" placeholder="设置一个昵称" />
              <button class="btn btn-soft" :disabled="savingName" @click="saveDisplayName">
                {{ savingName ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h2>账号安全</h2></div>
          <p class="small muted">建议定期更换密码，修改后其它设备上的登录会全部失效。</p>
          <div class="row" style="margin-top: 14px">
            <RouterLink class="btn btn-primary" to="/change-password">修改密码</RouterLink>
            <button class="btn btn-ghost" @click="logout">退出登录</button>
          </div>
          <div class="divider" />
          <p class="tiny muted">忘记密码无法通过邮件找回，请联系管理员在后台重置初始密码。</p>
        </section>
      </div>

      <div v-if="stats" class="grid grid-5">
        <StatCard label="累计答题" :value="stats.totalAnswered" hint="道题" />
        <StatCard label="累计正确率" :value="formatPercent(stats.totalAccuracy)" tone="success" />
        <StatCard label="待复习错题" :value="stats.wrongCount" tone="danger" />
        <StatCard label="收藏题目" :value="stats.favoriteCount" />
        <StatCard label="参加考试" :value="stats.examCount" hint="次" />
      </div>

      <section class="card">
        <div class="card-header"><h2>最近练习</h2></div>
        <div v-if="!history || history.practiceSessions.length === 0" class="muted small">还没有练习记录</div>
        <div v-for="session in history?.practiceSessions ?? []" :key="session.id" class="list-item">
          <div class="li-main">
            <div class="strong">{{ modeLabel(session.mode) }}</div>
            <div class="tiny muted">{{ formatDateTime(session.startedAt) }} · {{ session.status === 'finished' ? '已完成' : '进行中' }}</div>
          </div>
          <div class="small">
            {{ session.correctCount }} / {{ session.answeredCount }} 题正确
            <span class="muted">（共 {{ session.totalQuestions }} 题）</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>最近答题</h2></div>
        <div v-if="!history || history.recentAnswers.length === 0" class="muted small">还没有答题记录</div>
        <div v-for="record in history?.recentAnswers ?? []" :key="record.id" class="list-item">
          <span class="badge" :class="record.isCorrect ? 'badge-success' : 'badge-danger'">{{ record.isCorrect ? '正确' : '错误' }}</span>
          <div class="li-main">
            <div class="small truncate">{{ record.stem }}</div>
            <div class="tiny muted">{{ record.subject }} · {{ modeLabel(record.source) }} · {{ formatDateTime(record.createdAt) }}</div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
