<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api';
import type { AuditLog } from '../../types';
import { formatDateTime } from '../../utils/format';
import LoadingBlock from '../../components/LoadingBlock.vue';
import PaginationBar from '../../components/PaginationBar.vue';

const logs = ref<AuditLog[]>([]);
const loading = ref(true);
const error = ref('');
const action = ref('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 30;

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const result = await adminApi.logs({ action: action.value.trim() || undefined, page: page.value, pageSize });
    logs.value = result.data;
    total.value = result.pagination?.total ?? result.data.length;
    totalPages.value = result.pagination?.totalPages ?? 1;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>操作日志</h1><p>记录关键管理员操作，不包含密码、会话令牌或 API Key</p></div>
      <span class="badge">共 {{ total }} 条</span>
    </div>

    <section class="card">
      <div class="filter-bar">
        <div class="field">
          <label for="log-action">操作类型</label>
          <input id="log-action" v-model="action" class="input" placeholder="例如 question.create" @keyup.enter="search" />
        </div>
        <button class="btn btn-primary" @click="search">筛选</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>
      <LoadingBlock v-if="loading" text="正在加载日志…" />

      <template v-else>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象类型</th><th>对象 ID</th><th>详情</th></tr></thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td class="small muted nowrap">{{ formatDateTime(log.createdAt) }}</td>
                <td>{{ log.adminName ?? '—' }}</td>
                <td><span class="mono small">{{ log.action }}</span></td>
                <td class="small">{{ log.targetType ?? '—' }}</td>
                <td class="mono tiny muted">{{ log.targetId ?? '—' }}</td>
                <td class="tiny muted" style="max-width: 320px; overflow: hidden; text-overflow: ellipsis">{{ log.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="logs.length === 0" class="empty">暂无日志</div>
        <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
      </template>
    </section>
  </div>
</template>
