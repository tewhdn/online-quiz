<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api';
import type { ExamSummary } from '../../types';
import { formatDateTime } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';
import { CalendarDays } from '@lucide/vue';

const toast = useToast();
const exams = ref<ExamSummary[]>([]);
const loading = ref(true);
const error = ref('');

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    exams.value = (await adminApi.exams({ page: 1, pageSize: 100 })).data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function publish(exam: ExamSummary): Promise<void> {
  try {
    await adminApi.publishExam(exam.id);
    toast.success('考试已发布');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '发布失败');
  }
}

async function close(exam: ExamSummary): Promise<void> {
  if (!window.confirm('关闭后用户将无法再进入该考试，已提交的成绩保留。确认关闭？')) return;
  try {
    await adminApi.closeExam(exam.id);
    toast.success('考试已关闭');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '操作失败');
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>考试管理</h1><p>创建模拟考试、配置抽题规则并查看成绩</p></div>
      <RouterLink class="btn btn-primary" to="/admin/exams/new">+ 创建考试</RouterLink>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <LoadingBlock v-if="loading" text="正在加载考试…" />

    <section v-else class="card">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>考试名称</th><th>状态</th><th>题目</th><th>总分</th><th>时长</th><th>开放时间</th><th>参考人次</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="exam in exams" :key="exam.id">
              <td>
                <strong>{{ exam.title }}</strong>
                <div class="tiny muted">{{ exam.subject || '不限科目' }}</div>
              </td>
              <td>
                <span class="badge" :class="exam.status === 'published' ? 'badge-success' : exam.status === 'closed' ? 'badge-danger' : 'badge-warning'">
                  {{ exam.status === 'published' ? '已发布' : exam.status === 'closed' ? '已关闭' : '草稿' }}
                </span>
              </td>
              <td>{{ exam.totalQuestions }}</td>
              <td>{{ exam.totalScore }}</td>
              <td>{{ exam.durationMinutes }} 分钟</td>
              <td class="small muted">
                {{ exam.startAt ? formatDateTime(exam.startAt) : '不限' }} ~<br />
                {{ exam.endAt ? formatDateTime(exam.endAt) : '不限' }}
              </td>
              <td>{{ exam.attemptCount }}</td>
              <td class="actions">
                <RouterLink class="btn btn-sm btn-ghost" :to="`/admin/exams/${exam.id}/edit`">编辑</RouterLink>
                <button v-if="exam.status !== 'published'" class="btn btn-sm btn-success" @click="publish(exam)">发布</button>
                <button v-if="exam.status !== 'closed'" class="btn btn-sm btn-ghost" @click="close(exam)">关闭</button>
                <RouterLink class="btn btn-sm btn-soft" :to="`/admin/exams/${exam.id}/results`">成绩</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="exams.length === 0" class="empty">
        <div class="empty-icon"><CalendarDays :size="20" /></div>
        <h3>还没有考试</h3>
        <RouterLink class="btn btn-primary btn-sm" to="/admin/exams/new">创建第一场考试</RouterLink>
      </div>
    </section>
  </div>
</template>
