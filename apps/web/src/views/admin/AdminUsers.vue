<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api';
import type { AdminUser, UserStats } from '../../types';
import { formatDateTime, formatPercent } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import PaginationBar from '../../components/PaginationBar.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';

const toast = useToast();
const users = ref<AdminUser[]>([]);
const loading = ref(true);
const error = ref('');
const q = ref('');
const status = ref('all');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 20;

const detail = ref<{ user: AdminUser; stats: UserStats } | null>(null);
const detailLoading = ref(false);
const resetResult = ref<{ username: string; password: string } | null>(null);
const actionUser = ref<AdminUser | null>(null);
const actionType = ref<'disable' | 'enable' | 'delete' | null>(null);
const acting = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminApi.users({
      q: q.value.trim() || undefined,
      status: status.value === 'all' ? undefined : status.value,
      page: page.value,
      pageSize,
    });
    users.value = result.data;
    total.value = result.pagination?.total ?? result.data.length;
    totalPages.value = result.pagination?.totalPages ?? 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function openDetail(user: AdminUser): Promise<void> {
  detailLoading.value = true;
  detail.value = { user, stats: {} as UserStats };
  try {
    detail.value = (await adminApi.user(user.id)).data;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '用户详情加载失败');
    detail.value = null;
  } finally {
    detailLoading.value = false;
  }
}

async function resetPassword(user: AdminUser): Promise<void> {
  if (!window.confirm(`确认重置用户「${user.username}」的密码？其所有登录状态会立即失效。`)) return;
  try {
    const result = await adminApi.resetPassword(user.id);
    resetResult.value = { username: user.username, password: result.data.initialPassword };
    toast.success('初始密码已生成');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '重置失败');
  }
}

function askAction(user: AdminUser, type: 'disable' | 'enable' | 'delete'): void {
  actionUser.value = user;
  actionType.value = type;
}

async function runAction(): Promise<void> {
  if (!actionUser.value || !actionType.value) return;
  acting.value = true;
  try {
    if (actionType.value === 'disable') await adminApi.disableUser(actionUser.value.id);
    if (actionType.value === 'enable') await adminApi.enableUser(actionUser.value.id);
    if (actionType.value === 'delete') await adminApi.deleteUser(actionUser.value.id);
    toast.success('操作成功');
    actionType.value = null;
    actionUser.value = null;
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败');
  } finally {
    acting.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('已复制');
  } catch {
    toast.info('复制失败，请手动选择文本');
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>用户管理</h1><p>查看用户、禁用账号、重置密码</p></div>
      <span class="badge">共 {{ total }} 名用户</span>
    </div>

    <section class="card">
      <div class="filter-bar">
        <div class="field">
          <label for="user-q">搜索用户名</label>
          <input id="user-q" v-model="q" class="input" placeholder="输入用户名关键字" @keyup.enter="search" />
        </div>
        <div class="field">
          <label for="user-status">状态</label>
          <select id="user-status" v-model="status" class="select" @change="search">
            <option value="all">全部</option>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
        <button class="btn btn-primary" @click="search">搜索</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>
      <LoadingBlock v-if="loading" text="正在加载用户…" />

      <template v-else>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>用户名</th><th>角色</th><th>状态</th><th>注册时间</th><th>最近登录</th><th>答题</th><th>正确率</th><th>操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>
                  <button class="link-btn" type="button" @click="openDetail(user)">{{ user.username }}</button>
                  <div v-if="user.mustChangePassword" class="tiny muted">待修改初始密码</div>
                </td>
                <td><span class="badge" :class="user.role === 'admin' ? 'badge-primary' : ''">{{ user.role === 'admin' ? '管理员' : '用户' }}</span></td>
                <td>
                  <span class="badge" :class="user.status === 'active' ? 'badge-success' : 'badge-danger'">
                    {{ user.status === 'active' ? '正常' : '已禁用' }}
                  </span>
                </td>
                <td class="small muted">{{ formatDateTime(user.createdAt) }}</td>
                <td class="small muted">{{ user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '从未登录' }}</td>
                <td>{{ user.answerCount }}</td>
                <td>{{ user.answerCount > 0 ? formatPercent((user.correctCount / user.answerCount) * 100, 0) : '—' }}</td>
                <td class="actions">
                  <button class="btn btn-sm btn-ghost" @click="resetPassword(user)">重置密码</button>
                  <button v-if="user.status === 'active'" class="btn btn-sm btn-danger" @click="askAction(user, 'disable')">禁用</button>
                  <button v-else class="btn btn-sm btn-success" @click="askAction(user, 'enable')">恢复</button>
                  <button class="btn btn-sm btn-ghost" @click="askAction(user, 'delete')">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
      </template>
    </section>

    <div v-if="detail" class="modal-backdrop" @click.self="detail = null">
      <div class="modal wide">
        <div class="modal-header">
          <h2>用户详情 · {{ detail.user.username }}</h2>
          <button class="btn btn-sm btn-ghost" @click="detail = null">关闭</button>
        </div>
        <LoadingBlock v-if="detailLoading" text="加载中…" />
        <template v-else>
          <div class="grid grid-4">
            <div class="card stat-card"><div class="stat-label">累计答题</div><div class="stat-value">{{ detail.stats.totalAnswered ?? 0 }}</div></div>
            <div class="card stat-card success"><div class="stat-label">正确率</div><div class="stat-value">{{ formatPercent(detail.stats.totalAccuracy ?? 0) }}</div></div>
            <div class="card stat-card danger"><div class="stat-label">待复习错题</div><div class="stat-value">{{ detail.stats.wrongCount ?? 0 }}</div></div>
            <div class="card stat-card"><div class="stat-label">参加考试</div><div class="stat-value">{{ detail.stats.examCount ?? 0 }}</div></div>
          </div>
          <p class="small muted" style="margin-top: 12px">
            注册：{{ formatDateTime(detail.user.createdAt) }} · 最近登录：{{ detail.user.lastLoginAt ? formatDateTime(detail.user.lastLoginAt) : '从未' }}
          </p>
        </template>
      </div>
    </div>

    <div v-if="resetResult" class="modal-backdrop" @click.self="resetResult = null">
      <div class="modal">
        <div class="modal-header"><h2>初始密码（仅显示一次）</h2></div>
        <div class="notice-box">请立即复制并通过安全渠道交给用户「{{ resetResult.username }}」，用户首次登录后必须修改密码。</div>
        <div class="card mono" style="margin-top: 14px; font-size: 1.15rem; letter-spacing: 0.04em; text-align: center">
          {{ resetResult.password }}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="resetResult = null">关闭</button>
          <button class="btn btn-primary" @click="copy(resetResult.password)">复制密码</button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="actionType !== null"
      :title="actionType === 'delete' ? '删除用户？' : actionType === 'disable' ? '禁用账号？' : '恢复账号？'"
      :message="
        actionType === 'delete'
          ? `将软删除用户「${actionUser?.username}」，其答题记录与考试成绩会保留。`
          : actionType === 'disable'
            ? `禁用后「${actionUser?.username}」的所有会话会立即失效。`
            : `恢复后「${actionUser?.username}」可以重新登录。`
      "
      :danger="actionType !== 'enable'"
      :loading="acting"
      @cancel="actionType = null"
      @confirm="runAction"
    />
  </div>
</template>

