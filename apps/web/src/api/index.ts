import { request, download, saveBlob, getCsrfToken, ApiClientError } from './client';
import type {
  AdminQuestion,
  AdminStats,
  AdminUser,
  AiGenerateResult,
  AiReviewQuestion,
  AiSource,
  AiTask,
  Announcement,
  AnswerResult,
  AttemptResult,
  AttemptSummary,
  AuditLog,
  Category,
  ExamDetail,
  ExamPaper,
  ExamResultRow,
  ExamSummary,
  FavoriteItem,
  FilterOptions,
  ImportSummary,
  Invite,
  InviteUsage,
  MistakeItem,
  PracticeSessionView,
  PracticeStartResult,
  Question,
  QuestionPayload,
  User,
  UserStats,
} from '../types';

type Query = Record<string, string | number | boolean | null | undefined>;

export const authApi = {
  meta: () => request<{ siteName: string; aiEnabled: boolean; version: string }>('/meta'),
  login: (body: { username: string; password: string }) =>
    request<{ user: User; csrfToken: string; expiresAt: number }>('/auth/login', { method: 'POST', body }),
  register: (body: { username: string; password: string; confirmPassword: string; inviteCode: string }) =>
    request<{ user: User; csrfToken: string; expiresAt: number }>('/auth/register', { method: 'POST', body }),
  logout: () => request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User; csrfToken: string; siteName: string }>('/auth/me'),
  changePassword: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    request<{ user: User; csrfToken: string; expiresAt: number }>('/auth/change-password', { method: 'POST', body }),
};

export const userApi = {
  profile: () =>
    request<{
      id: string;
      username: string;
      role: 'admin' | 'user';
      displayName: string | null;
      createdAt: number;
      lastLoginAt: number | null;
      mustChangePassword: boolean;
    }>('/users/me'),
  updateProfile: (body: { displayName: string }) => request<{ displayName: string | null }>('/users/me', { method: 'PATCH', body }),
  stats: () => request<UserStats>('/users/me/stats'),
  history: (query?: Query) =>
    request<{
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
      recentAnswers: Array<{ id: string; questionId: string; stem: string; subject: string; isCorrect: boolean; source: string; createdAt: number }>;
    }>('/users/me/history', { query }),
};

export const questionApi = {
  list: (query?: Query) => request<Question[]>('/questions', { query }),
  filters: () => request<FilterOptions>('/questions/filters'),
  categories: (subject?: string) => request<Category[]>('/categories', { query: { subject } }),
  detail: (id: string) => request<Question>(`/questions/${id}`),
  answer: (id: string, body: { answer: string[]; sessionId?: string; timeSpentMs?: number }) =>
    request<AnswerResult>(`/questions/${id}/answer`, { method: 'POST', body }),
  toggleFavorite: (questionId: string, favorite: boolean) =>
    favorite
      ? request<{ favorited: boolean }>(`/favorites/${questionId}`, { method: 'POST' })
      : request<{ favorited: boolean }>(`/favorites/${questionId}`, { method: 'DELETE' }),
};

export const practiceApi = {
  start: (body: {
    mode: string;
    count: number;
    subject?: string;
    categoryId?: string;
    type?: string;
    difficulty?: number;
    knowledgePoint?: string;
  }) => request<PracticeStartResult>('/practice/sessions', { method: 'POST', body }),
  get: (id: string) => request<PracticeSessionView>(`/practice/sessions/${id}`),
  finish: (id: string) =>
    request<{ id: string; answeredCount: number; correctCount: number; totalQuestions: number; accuracy: number }>(
      `/practice/sessions/${id}/submit`,
      { method: 'POST', body: {} },
    ),
  history: (query?: Query) => request<Array<Record<string, unknown>>>('/practice/history', { query }),
};

export const mistakeApi = {
  list: (query?: Query) => request<MistakeItem[]>('/mistakes', { query }),
  mastered: (id: string, mastered: boolean) =>
    request<{ id: string; mastered: boolean }>(`/mistakes/${id}/mastered`, { method: 'POST', body: { mastered } }),
};

export const favoriteApi = {
  list: (query?: Query) => request<FavoriteItem[]>('/favorites', { query }),
};

export const examApi = {
  list: (query?: Query) => request<ExamSummary[]>('/exams', { query }),
  detail: (id: string) => request<ExamDetail>(`/exams/${id}`),
  start: (id: string) => request<ExamPaper>(`/exams/${id}/start`, { method: 'POST', body: {} }),
  paper: (attemptId: string) => request<ExamPaper>(`/exam-attempts/${attemptId}`),
  saveAnswer: (attemptId: string, questionId: string, body: { answer: string[]; flagged?: boolean }) =>
    request<{ saved: boolean; autoSubmitted: boolean; remainingSeconds: number; result?: AttemptResult }>(
      `/exam-attempts/${attemptId}/answers/${questionId}`,
      { method: 'PUT', body },
    ),
  submit: (attemptId: string) => request<AttemptResult>(`/exam-attempts/${attemptId}/submit`, { method: 'POST', body: {} }),
  result: (attemptId: string) => request<AttemptResult>(`/exam-attempts/${attemptId}/result`),
  attempts: (examId?: string) => request<AttemptSummary[]>('/exam-attempts', { query: { examId } }),
};

export const announcementApi = {
  list: () => request<Announcement[]>('/announcements'),
};

export const adminApi = {
  dashboard: () => request<AdminStats>('/admin/dashboard'),
  logs: (query?: Query) => request<AuditLog[]>('/admin/logs', { query }),

  users: (query?: Query) => request<AdminUser[]>('/admin/users', { query }),
  user: (id: string) =>
    request<{ user: AdminUser; stats: UserStats }>(`/admin/users/${id}`),
  resetPassword: (id: string) =>
    request<{ userId: string; initialPassword: string; notice: string }>(`/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: {},
    }),
  disableUser: (id: string) => request<{ status: string }>(`/admin/users/${id}/disable`, { method: 'POST', body: {} }),
  enableUser: (id: string) => request<{ status: string }>(`/admin/users/${id}/enable`, { method: 'POST', body: {} }),
  deleteUser: (id: string) => request<{ status: string }>(`/admin/users/${id}/delete`, { method: 'POST', body: {} }),

  invites: (query?: Query) => request<Invite[]>('/admin/invites', { query }),
  createInvite: (body: { maxUses: number; expiresAt: string | null; note: string }) =>
    request<{ id: string; code: string; notice: string }>('/admin/invites', { method: 'POST', body }),
  batchInvites: (body: { count: number; maxUses: number; expiresAt: string | null; note: string }) =>
    request<{ count: number; codes: string[]; notice: string }>('/admin/invites/batch', { method: 'POST', body }),
  disableInvite: (id: string) => request<{ status: string }>(`/admin/invites/${id}/disable`, { method: 'POST', body: {} }),
  inviteUsages: (id: string) => request<InviteUsage[]>(`/admin/invites/${id}/usages`),

  questions: (query?: Query) => request<AdminQuestion[]>('/admin/questions', { query }),
  question: (id: string) => request<AdminQuestion>(`/admin/questions/${id}`),
  questionStats: () =>
    request<{ total: number; published: number; draft: number; pending: number; archived: number; byType: Record<string, number> }>(
      '/admin/questions/stats',
    ),
  createQuestion: (body: QuestionPayload) => request<AdminQuestion>('/admin/questions', { method: 'POST', body }),
  updateQuestion: (id: string, body: QuestionPayload) => request<AdminQuestion>(`/admin/questions/${id}`, { method: 'PUT', body }),
  deleteQuestion: (id: string) => request<{ deleted: boolean }>(`/admin/questions/${id}`, { method: 'DELETE' }),
  publishQuestion: (id: string) => request<{ status: string }>(`/admin/questions/${id}/publish`, { method: 'POST', body: {} }),
  archiveQuestion: (id: string) => request<{ status: string }>(`/admin/questions/${id}/archive`, { method: 'POST', body: {} }),
  bulkCategory: (body: { ids: string[]; subject: string; category: string }) =>
    request<{ updated: number }>('/admin/questions/bulk-category', { method: 'POST', body }),
  importQuestions: (body: {
    format: 'json' | 'csv';
    content: string;
    mode: 'preview' | 'commit';
    duplicateStrategy: 'skip' | 'update' | 'create';
    defaultStatus: 'draft' | 'published';
  }) => request<ImportSummary>('/admin/questions/import', { method: 'POST', body }),
  exportQuestions: async (format: 'json' | 'csv', query?: Query) => {
    const blob = await download('/admin/questions/export', { ...query, format });
    saveBlob(blob, `questions-${new Date().toISOString().slice(0, 10)}.${format}`);
  },
  createCategory: (body: { name: string; subject: string; description?: string; sortOrder?: number }) =>
    request<{ created: boolean }>('/admin/categories', { method: 'POST', body }),
  deleteCategory: (id: string) => request<{ deleted: boolean }>(`/admin/categories/${id}`, { method: 'DELETE' }),

  aiTasks: (query?: Query) => request<AiTask[]>('/admin/ai/tasks', { query }),
  aiTask: (id: string) => request<{ task: AiTask; reviewQuestions: AiReviewQuestion[] }>(`/admin/ai/tasks/${id}`),
  aiGenerate: (body: Record<string, unknown>) => request<AiGenerateResult>('/admin/ai/generate', { method: 'POST', body }),
  aiReviewList: (query?: Query) => request<AiReviewQuestion[]>('/admin/ai/review-questions', { query }),
  aiReviewUpdate: (id: string, body: Record<string, unknown>) =>
    request<{ errors: string[]; warnings: string[] }>(`/admin/ai/review-questions/${id}`, { method: 'PUT', body }),
  aiApprove: (id: string, overrides?: Record<string, unknown>) =>
    request<{ questionId: string }>(`/admin/ai/review-questions/${id}/approve`, { method: 'POST', body: overrides ?? {} }),
  aiReject: (id: string, reason: string) =>
    request<{ status: string }>(`/admin/ai/review-questions/${id}/reject`, { method: 'POST', body: { reason } }),
  aiRegenerate: (id: string) =>
    request<{ status: string; errors: string[]; warnings: string[] }>(`/admin/ai/review-questions/${id}/regenerate`, {
      method: 'POST',
      body: {},
    }),
  aiBatch: (body: { ids: string[]; action: 'approve' | 'reject'; reason?: string }) =>
    request<{ approved: number; rejected: number; failed: Array<{ id: string; message: string }> }>(
      '/admin/ai/review-questions/batch',
      { method: 'POST', body },
    ),
  aiUpload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ source: AiSource & { truncated: boolean; warnings: string[]; pages?: number }; preview: string }>(
      '/admin/ai/sources',
      { method: 'POST', formData: form },
    );
  },
  aiSources: () => request<AiSource[]>('/admin/ai/sources'),
  aiSource: (id: string) => request<AiSource>(`/admin/ai/sources/${id}`),
  aiDeleteSource: (id: string) => request<{ deleted: boolean }>(`/admin/ai/sources/${id}`, { method: 'DELETE' }),
  aiUsage: () =>
    request<{
      enabled: boolean;
      dailyLimit: number;
      maxQuestions: number;
      todayTasks: number;
      last30Days: {
        taskCount: number;
        succeeded: number;
        failed: number;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        pendingReview: number;
      };
      pendingReview: number;
    }>('/admin/ai/usage'),
  aiSettings: () =>
    request<{ enabled: boolean; dailyLimit: number; maxQuestions: number; model: string; apiKeyConfigured: boolean }>(
      '/admin/ai/settings',
    ),
  aiUpdateSettings: (body: { enabled?: boolean; dailyLimit?: number; maxQuestions?: number }) =>
    request<{ enabled: boolean; dailyLimit: number; maxQuestions: number }>('/admin/ai/settings', { method: 'PUT', body }),

  exams: (query?: Query) => request<ExamSummary[]>('/admin/exams', { query }),
  exam: (id: string) =>
    request<{
      exam: ExamSummary & {
        categoryIds: string[];
        knowledgePoints: string[];
        typeCounts: { single: number; multiple: number; boolean: number };
        difficultyCounts: Record<string, number>;
        allowEarlySubmit: boolean;
      };
      questions: Array<{ examQuestionId: string; position: number; type: string; score: number; stem: string; options: Array<{ key: string; text: string }> }>;
    }>(`/admin/exams/${id}`),
  createExam: (body: Record<string, unknown>) => request<Record<string, unknown>>('/admin/exams', { method: 'POST', body }),
  updateExam: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/admin/exams/${id}`, { method: 'PUT', body }),
  publishExam: (id: string) => request<{ status: string }>(`/admin/exams/${id}/publish`, { method: 'POST', body: {} }),
  closeExam: (id: string) => request<{ status: string }>(`/admin/exams/${id}/close`, { method: 'POST', body: {} }),
  examResults: (id: string) => request<{ exam: ExamSummary; results: ExamResultRow[] }>(`/admin/exams/${id}/results`),
  exportExamResults: async (id: string) => {
    const blob = await download(`/admin/exams/${id}/results/export`);
    saveBlob(blob, `exam-results-${id}.csv`);
  },

  announcements: () => request<Announcement[]>('/admin/announcements'),
  createAnnouncement: (body: { title: string; content: string; status: 'draft' | 'published'; pinned: boolean }) =>
    request<Announcement>('/admin/announcements', { method: 'POST', body }),
  updateAnnouncement: (id: string, body: { title: string; content: string; status: 'draft' | 'published'; pinned: boolean }) =>
    request<{ updated: boolean }>(`/admin/announcements/${id}`, { method: 'PUT', body }),
  deleteAnnouncement: (id: string) => request<{ deleted: boolean }>(`/admin/announcements/${id}`, { method: 'DELETE' }),

  settings: () =>
    request<{
      siteName: string;
      aiEnabled: boolean;
      aiDailyTaskLimit: number;
      aiMaxQuestions: number;
      model: string;
      environment: string;
      deepseekConfigured: boolean;
      r2Enabled: boolean;
    }>('/admin/settings'),
  updateSettings: (body: { siteName?: string; aiEnabled?: boolean; aiDailyTaskLimit?: number; aiMaxQuestions?: number }) =>
    request<{ updated: boolean }>('/admin/settings', { method: 'PUT', body }),
};

export { ApiClientError } from './client';
export { saveBlob } from './client';

export interface AiExplainInput {
  questionId?: string;
  questionText?: string;
  userAnswer?: string[];
  mode?: 'explain' | 'simpler' | 'example';
  followUp?: string;
  /** 使用场景：练习 / 考试；考试场景需要 attemptId */
  context?: 'practice' | 'exam';
  attemptId?: string;
  sessionId?: string;
}

/** 学生端 AI 解答：SSE 流式返回，逐段回调 onDelta */
export const aiPetApi = {
  async explainStream(
    body: AiExplainInput,
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<{ demo: boolean; assist: 'wrongbook' | 'exam_void' | 'none' }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;

    const response = await fetch('/api/v1/ai/explain', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });

    if (!response.ok || !response.body) {
      let message = 'AI 服务暂时不可用，请稍后再试';
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload?.error?.message) message = payload.error.message;
      } catch {
        // keep default message
      }
      throw new ApiClientError(message, 'AI_EXPLAIN_FAILED', response.status);
    }

    const demo = response.headers.get('X-AI-Mode') === 'demo';
    const assistHeader = response.headers.get('X-AI-Assist');
    const assist = assistHeader === 'exam_void' ? 'exam_void' : assistHeader === 'wrongbook' ? 'wrongbook' : 'none';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let event: { type?: string; text?: string; message?: string } | null = null;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (!event) continue;
        if (event.type === 'delta' && typeof event.text === 'string') onDelta(event.text);
        else if (event.type === 'error') throw new ApiClientError(event.message ?? 'AI 输出中断', 'AI_STREAM_ERROR', 0);
      }
    }
    return { demo, assist };
  },
};
