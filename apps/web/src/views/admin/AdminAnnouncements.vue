<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { adminApi } from '../../api';
import type { Announcement } from '../../types';
import { formatDateTime } from '../../utils/format';
import { useToast } from '../../composables/useToast';
import LoadingBlock from '../../components/LoadingBlock.vue';

const toast = useToast();
const items = ref<Announcement[]>([]);
const loading = ref(true);
const error = ref('');
const editing = ref<Announcement | null>(null);
const open = ref(false);
const saving = ref(false);
const form = reactive({ title: '', content: '', status: 'draft' as 'draft' | 'published', pinned: false });

async function load(): Promise<void> {
  loading.value = true;
  try {
    items.value = (await adminApi.announcements()).data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function startCreate(): void {
  editing.value = null;
  form.title = '';
  form.content = '';
  form.status = 'draft';
  form.pinned = false;
  open.value = true;
}

function startEdit(item: Announcement): void {
  editing.value = item;
  form.title = item.title;
  form.content = item.content;
  form.status = item.status ?? 'published';
  form.pinned = item.pinned;
  open.value = true;
}

async function save(): Promise<void> {
  if (!form.title.trim() || !form.content.trim()) {
    toast.error('标题和内容不能为空');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await adminApi.updateAnnouncement(editing.value.id, { ...form });
      toast.success('公告已更新');
    } else {
      await adminApi.createAnnouncement({ ...form });
      toast.success('公告已创建');
    }
    open.value = false;
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(item: Announcement): Promise<void> {
  if (!window.confirm(`确认删除公告「${item.title}」？`)) return;
  try {
    await adminApi.deleteAnnouncement(item.id);
    toast.success('公告已删除');
    await load();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '删除失败');
  }
}

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="page-header">
      <div><h1>公告管理</h1><p>发布后普通用户可在首页看到公告</p></div>
      <button class="btn btn-primary" @click="startCreate">+ 新建公告</button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <LoadingBlock v-if="loading" text="正在加载公告…" />

    <section v-else class="card">
      <div v-if="items.length === 0" class="empty">
        <div class="empty-icon">📢</div>
        <h3>还没有公告</h3>
        <button class="btn btn-primary btn-sm" @click="startCreate">发布第一条公告</button>
      </div>
      <div v-for="item in items" :key="item.id" class="list-item">
        <div class="li-main">
          <div class="row" style="gap: 8px">
            <span v-if="item.pinned" class="badge badge-warning">置顶</span>
            <span class="badge" :class="item.status === 'published' ? 'badge-success' : ''">
              {{ item.status === 'published' ? '已发布' : '草稿' }}
            </span>
            <strong>{{ item.title }}</strong>
          </div>
          <p class="small muted" style="margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">
            {{ item.content }}
          </p>
          <div class="tiny muted">{{ formatDateTime(item.publishedAt ?? item.createdAt) }}</div>
        </div>
        <div class="row" style="gap: 6px">
          <button class="btn btn-sm btn-ghost" @click="startEdit(item)">编辑</button>
          <button class="btn btn-sm btn-danger" @click="remove(item)">删除</button>
        </div>
      </div>
    </section>

    <div v-if="open" class="modal-backdrop" @click.self="open = false">
      <div class="modal">
        <div class="modal-header"><h2>{{ editing ? '编辑公告' : '新建公告' }}</h2></div>
        <div class="field">
          <label for="ann-title">标题</label>
          <input id="ann-title" v-model="form.title" class="input" maxlength="100" />
        </div>
        <div class="field" style="margin-top: 12px">
          <label for="ann-content">内容</label>
          <textarea id="ann-content" v-model="form.content" class="textarea" rows="6" maxlength="10000" />
        </div>
        <div class="form-grid" style="margin-top: 12px">
          <div class="field">
            <label for="ann-status">状态</label>
            <select id="ann-status" v-model="form.status" class="select">
              <option value="draft">草稿</option>
              <option value="published">发布</option>
            </select>
          </div>
          <label class="checkbox-row" style="align-self: end; padding-bottom: 10px">
            <input v-model="form.pinned" type="checkbox" /> 置顶
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="open = false">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
