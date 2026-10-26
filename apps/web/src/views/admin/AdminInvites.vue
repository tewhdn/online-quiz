<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api';
import type { Invite, InviteUsage } from '../../types';
import { formatDateTime, formatRelative } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import PaginationBar from '../../components/PaginationBar.vue';

const toast = useToast();
const invites = ref<Invite[]>([]);
const loading = ref(true);
const error = ref('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 20;

const maxUses = ref(1);
const count = ref(1);
const expiresAt = ref('');
const note = ref('');
const creating = ref(false);
const generated = ref<string[]>([]);
const usages = ref<InviteUsage[] | null>(null);
const usagesTitle = ref('');
const statusFilter = ref('all');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminApi.invites({
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      page: page.value,
      pageSize,
    });
    invites.value = result.data;
    total.value = result.pagination?.total ?? result.data.length;
    totalPages.value = result.pagination?.totalPages ?? 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function create(): Promise<void> {
  if (maxUses.value < 1) {
    toast.error('可注册次数至少为 1');
    return;
  }
  creating.value = true;
  try {
    const expires = expiresAt.value ? new Date(expiresAt.value).toISOString() : null;
    if (count.value > 1) {
      const result = await adminApi.batchInvites({ count: count.value, maxUses: maxUses.value, expiresAt: expires, note: note.value });
      generated.value = result.data.codes;
    } else {
      const result = await adminApi.createInvite({ maxUses: maxUses.value, expiresAt: expires, note: note.value });
      generated.value = [result.data.code];
    }
    toast.success('邀请码已生成');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '生成失败');
  } finally {
    creating.value = false;
  }
}

async function disable(invite: Invite): Promise<void> {
  if (!window.confirm(`确认禁用邀请码 ${invite.codeMask}？`)) return;
  try {
    await adminApi.disableInvite(invite.id);
    toast.success('已禁用');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败');
  }
}

async function showUsages(invite: Invite): Promise<void> {
  usagesTitle.value = invite.codeMask;
  try {
    usages.value = (await adminApi.inviteUsages(invite.id)).data;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '使用记录加载失败');
  }
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
      <div><h1>邀请码管理</h1><p>系统只保存邀请码哈希，明文仅在生成时显示一次</p></div>
      <span class="badge">共 {{ total }} 个邀请码</span>
    </div>

    <div class="grid grid-2">
      <section class="card">
        <div class="card-header"><h2>生成邀请码</h2></div>
        <div class="form-grid">
          <div class="field">
            <label for="invite-count">生成数量（1-50）</label>
            <input id="invite-count" v-model.number="count" class="input" type="number" min="1" max="50" />
          </div>
          <div class="field">
            <label for="invite-uses">每个可用次数</label>
            <input id="invite-uses" v-model.number="maxUses" class="input" type="number" min="1" max="100" />
          </div>
          <div class="field">
            <label for="invite-expires">过期时间（可选）</label>
            <input id="invite-expires" v-model="expiresAt" class="input" type="datetime-local" />
          </div>
          <div class="field">
            <label for="invite-note">备注（可选）</label>
            <input id="invite-note" v-model="note" class="input" maxlength="100" placeholder="例如：2027 届第一批" />
          </div>
        </div>
        <div class="row" style="margin-top: 14px; justify-content: flex-end">
          <button class="btn btn-primary" :disabled="creating" @click="create">
            <span v-if="creating" class="spinner" />
            {{ creating ? '生成中…' : '生成邀请码' }}
          </button>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2>筛选</h2></div>
        <div class="field">
          <label for="invite-status">状态</label>
          <select id="invite-status" v-model="statusFilter" class="select" @change="page = 1; load()">
            <option value="all">全部</option>
            <option value="active">可用</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
        <p class="hint" style="margin-top: 12px">
          邀请码使用密码学安全随机数生成，共 60 bit 熵，格式为 QZ-XXXX-XXXX-XXXX。数据库泄露不会直接暴露可用邀请码。
        </p>
      </section>
    </div>

    <section class="card">
      <div class="card-header"><h2>邀请码列表</h2></div>
      <div v-if="error" class="error-box">{{ error }}</div>
      <LoadingBlock v-if="loading" text="正在加载…" />
      <template v-else>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>掩码</th><th>备注</th><th>使用情况</th><th>过期时间</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="invite in invites" :key="invite.id">
                <td class="mono">{{ invite.codeMask }}</td>
                <td class="small">{{ invite.note || '—' }}</td>
                <td>{{ invite.usedCount }} / {{ invite.maxUses }}</td>
                <td class="small muted">{{ invite.expiresAt ? formatDateTime(invite.expiresAt) : '不过期' }}</td>
                <td>
                  <span
                    class="badge"
                    :class="invite.status === 'active' && invite.usedCount < invite.maxUses ? 'badge-success' : 'badge-danger'"
                  >
                    {{ invite.status === 'disabled' ? '已禁用' : invite.usedCount >= invite.maxUses ? '已用尽' : '可用' }}
                  </span>
                </td>
                <td class="small muted">{{ formatRelative(invite.createdAt) }}</td>
                <td class="actions">
                  <button class="btn btn-sm btn-ghost" @click="showUsages(invite)">使用记录</button>
                  <button v-if="invite.status === 'active'" class="btn btn-sm btn-danger" @click="disable(invite)">禁用</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="invites.length === 0" class="empty">还没有邀请码</div>
        <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
      </template>
    </section>

    <div v-if="generated.length > 0" class="modal-backdrop" @click.self="generated = []">
      <div class="modal">
        <div class="modal-header"><h2>邀请码（仅显示一次）</h2></div>
        <div class="notice-box">请立即复制保存，关闭后无法再次查看明文。</div>
        <div class="preview-box mono" style="margin-top: 12px">{{ generated.join('\n') }}</div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="generated = []">关闭</button>
          <button class="btn btn-primary" @click="copy(generated.join('\n'))">复制全部</button>
        </div>
      </div>
    </div>

    <div v-if="usages" class="modal-backdrop" @click.self="usages = null">
      <div class="modal">
        <div class="modal-header"><h2>使用记录 · {{ usagesTitle }}</h2></div>
        <div v-if="usages.length === 0" class="muted small">暂无使用记录</div>
        <div v-for="usage in usages" :key="usage.id" class="list-item">
          <div class="li-main"><strong>{{ usage.username }}</strong></div>
          <span class="tiny muted">{{ formatDateTime(usage.usedAt) }}</span>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" @click="usages = null">关闭</button></div>
      </div>
    </div>
  </div>
</template>
