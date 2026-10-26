<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { NDataTable, type DataTableColumns } from 'naive-ui';
import { adminApi } from '../../api';
import type { AuditLog } from '../../types';
import { formatDateTime } from '../../utils/format';
import PaginationBar from '../../components/PaginationBar.vue';

const logs = ref<AuditLog[]>([]);
const loading = ref(true);
const error = ref('');
const action = ref('');
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const pageSize = 30;

const columns = computed<DataTableColumns<AuditLog>>(() => [
  {
    title: '时间',
    key: 'createdAt',
    width: 168,
    render: (row) => h('span', { class: 'small muted nowrap' }, formatDateTime(row.createdAt)),
  },
  { title: '管理员', key: 'adminName', width: 120, render: (row) => row.adminName ?? '—' },
  { title: '操作', key: 'action', width: 180, render: (row) => h('span', { class: 'mono small' }, row.action) },
  { title: '对象类型', key: 'targetType', width: 100, render: (row) => row.targetType ?? '—' },
  { title: '对象 ID', key: 'targetId', width: 170, render: (row) => h('span', { class: 'mono tiny muted' }, row.targetId ?? '—') },
  { title: '详情', key: 'detail', ellipsis: { tooltip: true }, render: (row) => h('span', { class: 'tiny muted' }, row.detail ?? '—') },
]);

const rowKey = (row: AuditLog): string => row.id;

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
      <NDataTable
        :columns="columns"
        :data="logs"
        :loading="loading"
        :row-key="rowKey"
        :pagination="false"
        :bordered="false"
        :single-line="false"
        :scroll-x="920"
        size="small"
      />
      <PaginationBar :page="page" :total-pages="totalPages" :total="total" :page-size="pageSize" @change="page = $event; load()" />
    </section>
  </div>
</template>
