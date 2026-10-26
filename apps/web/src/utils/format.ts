export const TYPE_LABELS: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '非常简单',
  2: '简单',
  3: '中等',
  4: '较难',
  5: '困难',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  published: '已发布',
  archived: '已归档',
  active: '正常',
  disabled: '已禁用',
  deleted: '已删除',
  in_progress: '进行中',
  submitted: '已交卷',
  expired: '已过期',
  closed: '已关闭',
  approved: '已通过',
  rejected: '已拒绝',
  invalid: '校验失败',
  succeeded: '成功',
  partial: '部分成功',
  failed: '失败',
  running: '执行中',
  enabled: '已开启',
};

export const MODE_LABELS: Record<string, string> = {
  random: '随机刷题',
  sequence: '顺序刷题',
  subject: '按科目',
  category: '按分类',
  knowledge: '按知识点',
  type: '按题型',
  difficulty: '按难度',
  mistake: '错题重练',
  favorite: '收藏练习',
  outline: '大纲出题',
  document: '资料出题',
  topic: '自定义主题',
  practice: '日常刷题',
  exam: '模拟考试',
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function difficultyLabel(difficulty: number): string {
  return DIFFICULTY_LABELS[difficulty] ?? `${difficulty} 级`;
}

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function formatRelative(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatDate(timestamp);
}

export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatSecondsText(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} 分钟` : `${minutes} 分 ${rest} 秒`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

export function formatFileSize(bytes: number | null | undefined): string {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function answerText(answer: string[] | null | undefined, type?: string): string {
  if (!answer || answer.length === 0) return '未作答';
  if (type === 'boolean') return answer[0] === 'true' ? '正确' : '错误';
  return answer.join('、');
}

export function toDateTimeLocal(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function truncateText(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
