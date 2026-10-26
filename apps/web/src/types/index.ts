export type Role = 'admin' | 'user';
export type QuestionType = 'single' | 'multiple' | 'boolean';
export type QuestionStatus = 'draft' | 'pending' | 'published' | 'archived';
export type ExamStatus = 'draft' | 'published' | 'closed';

export interface User {
  id: string;
  username: string;
  role: Role;
  status: 'active' | 'disabled' | 'deleted';
  mustChangePassword: boolean;
  displayName: string | null;
  createdAt?: number;
  lastLoginAt?: number | null;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface QuestionOption {
  key: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  subject: string;
  categoryId: string | null;
  category: string;
  knowledgePoints: string[];
  difficulty: number;
  stem: string;
  options: QuestionOption[];
  source: string | null;
  sourceRef: string | null;
  tags: string[];
  status: QuestionStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
  isFavorite?: boolean;
}

export interface AdminQuestion extends Question {
  answer: string[];
  explanation: string;
}

export interface QuestionPayload {
  type: QuestionType;
  subject: string;
  category: string;
  knowledge_points: string[];
  difficulty: number;
  stem: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string;
  source: string;
  source_ref: string;
  tags: string[];
  status?: QuestionStatus;
}

export interface AnswerResult {
  questionId: string;
  isCorrect: boolean;
  correctAnswer: string[];
  explanation: string;
  duplicate: boolean;
  answeredAt: number;
  questionType: QuestionType;
}

export interface PracticeSessionInfo {
  id: string;
  mode: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  status: 'active' | 'finished';
  startedAt: number;
  finishedAt: number | null;
}

export interface PracticeSessionView {
  session: PracticeSessionInfo;
  questions: Question[];
  answers: Array<{ questionId: string; isCorrect: boolean; userAnswer: string[]; correctAnswer: string[]; explanation: string }>;
}

export interface PracticeStartResult {
  sessionId: string;
  questions: Question[];
  total: number;
  requested: number;
}

export interface MistakeItem {
  id: string;
  question: Question;
  wrongCount: number;
  attemptCount: number;
  lastResult: boolean;
  lastWrongAt: number | null;
  mastered: boolean;
  updatedAt: number;
}

export interface FavoriteItem {
  id: string;
  question: Question;
  createdAt: number;
}

export interface UserStats {
  todayAnswered: number;
  todayCorrect: number;
  todayAccuracy: number;
  totalAnswered: number;
  totalCorrect: number;
  totalAccuracy: number;
  wrongCount: number;
  wrongTotal: number;
  favoriteCount: number;
  examCount: number;
  practiceCount: number;
  lastExam: {
    id: string;
    examId: string;
    title: string;
    score: number;
    totalScore: number;
    submittedAt: number | null;
  } | null;
  recentRecords: Array<{
    id: string;
    questionId: string;
    source: string;
    isCorrect: boolean;
    createdAt: number;
    stem: string;
    subject: string;
  }>;
  dailyActivity: Array<{ date: string; answered: number; correct: number }>;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  publishedAt: number;
  status?: 'draft' | 'published';
  createdAt?: number;
  updatedAt?: number;
}

export interface Category {
  id: string;
  name: string;
  subject: string;
  description: string | null;
  sortOrder: number;
  questionCount?: number;
}

export interface FilterOptions {
  subjects: Array<{ subject: string; count: number }>;
  categories: Category[];
  types: Array<{ value: QuestionType; label: string }>;
  difficulties: number[];
}

export interface ExamSummary {
  id: string;
  title: string;
  description: string;
  subject: string | null;
  totalQuestions: number;
  totalScore: number;
  durationMinutes: number;
  startAt: number | null;
  endAt: number | null;
  allowRetake: boolean;
  allowReview: string;
  attemptCount: number;
  status?: ExamStatus;
  scoreSingle?: number;
  scoreMultiple?: number;
  scoreBoolean?: number;
  allowEarlySubmit?: boolean;
  typeCounts?: { single: number; multiple: number; boolean: number };
}

export interface AttemptSummary {
  id: string;
  examId: string;
  examTitle?: string;
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: number;
  submittedAt: number | null;
  score: number | null;
  totalScore: number;
  autoSubmitted: boolean;
  correctCount?: number;
  wrongCount?: number;
  unansweredCount?: number;
  durationSeconds?: number | null;
}

export interface ExamDetail {
  exam: ExamSummary;
  attempts: AttemptSummary[];
  openAttemptId: string | null;
  canStart: boolean;
  blockedReason: string | null;
  serverTime: number;
}

export interface PaperQuestion {
  id: string;
  questionId: string;
  position: number;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  score: number;
  knowledgePoints: string[];
  userAnswer: string[];
  flagged: boolean;
  answered: boolean;
}

export interface ExamPaper {
  attempt: {
    id: string;
    examId: string;
    status: string;
    startedAt: number;
    deadlineAt: number;
    submittedAt: number | null;
    autoSubmitted: boolean;
    score: number | null;
    totalScore: number;
  };
  exam: {
    id: string;
    title: string;
    description: string;
    durationMinutes: number;
    allowEarlySubmit: boolean;
    allowReview: string;
    totalScore: number;
    startAt: number | null;
    endAt: number | null;
    allowRetake: boolean;
  };
  questions: PaperQuestion[];
  serverTime: number;
  remainingSeconds: number;
}

export interface AttemptResult {
  attempt: {
    id: string;
    examId: string;
    examTitle: string;
    status: string;
    startedAt: number;
    submittedAt: number | null;
    autoSubmitted: boolean;
    score: number;
    totalScore: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    durationSeconds: number;
  };
  reviewAllowed: boolean;
  summary: {
    byType: Record<string, { total: number; correct: number; score: number; maxScore: number }>;
    knowledge: Array<{ point: string; total: number; correct: number; accuracy: number }>;
  };
  questions: Array<{
    examQuestionId: string;
    questionId: string;
    position: number;
    type: QuestionType;
    stem: string;
    options: QuestionOption[];
    userAnswer: string[];
    isCorrect: boolean;
    answered: boolean;
    score: number;
    maxScore: number;
    flagged: boolean;
    correctAnswer: string[] | null;
    explanation: string | null;
  }>;
}

export interface AdminUser {
  id: string;
  username: string;
  role: Role;
  status: string;
  mustChangePassword: boolean;
  displayName: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  answerCount: number;
  correctCount: number;
  examCount: number;
}

export interface Invite {
  id: string;
  codeMask: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  status: 'active' | 'disabled';
  createdAt: number;
}

export interface InviteUsage {
  id: string;
  userId: string;
  username: string;
  usedAt: number;
}

export interface AdminStats {
  siteName: string;
  aiEnabled: boolean;
  users: { total: number; active: number; disabled: number; newThisWeek: number; activeThisWeek: number };
  questions: {
    total: number;
    published: number;
    draft: number;
    pending: number;
    archived: number;
    subjects: number;
    byType: Record<string, number>;
  };
  exams: { examCount: number; attemptCount: number; todayAttempts: number };
  ai: {
    taskCount: number;
    succeeded: number;
    failed: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    pendingReview: number;
    todayTasks: number;
    running: number;
  };
  answers: { today: number };
  recentLogs: AuditLog[];
}

export interface AuditLog {
  id: string;
  adminId: string | null;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string;
  createdAt: number;
}

export interface AiTask {
  id: string;
  adminId: string;
  mode: 'outline' | 'document' | 'topic';
  subject: string | null;
  params: Record<string, unknown>;
  status: 'pending' | 'running' | 'succeeded' | 'partial' | 'failed';
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  requestCount: number;
  attempts: number;
  sourceId: string | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  reviewTotal?: number;
  reviewPending?: number;
}

export interface AiReviewQuestion {
  id: string;
  taskId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'invalid';
  validation: { errors?: string[]; warnings?: string[]; duplicateOf?: string | null };
  duplicateOf: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  rejectReason: string | null;
  createdQuestionId: string | null;
  createdAt: number;
}

export interface AiSource {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  charCount: number;
  storage: 'd1' | 'r2';
  r2Key: string | null;
  uploadedBy: string | null;
  createdAt: number;
  textContent?: string;
  previewOnly?: boolean;
}

export interface AiGenerateResult {
  taskId: string;
  status: 'succeeded' | 'partial' | 'failed';
  requested: number;
  generated: number;
  pendingReview: number;
  invalid: number;
  duplicates: number;
  model: string;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
  error: string | null;
  questions: Array<{ id: string; status: string; errors: string[]; warnings: string[]; duplicateOf: string | null; stem: string }>;
}

export interface ExamResultRow {
  attemptId: string;
  userId: string;
  username: string;
  score: number;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  durationSeconds: number | null;
  submittedAt: number | null;
  autoSubmitted: boolean;
}

export interface ImportSummary {
  mode: 'preview' | 'commit';
  format: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  duplicateDetails: Array<{ row: number; existingId: string; similarity: number; reason: string }>;
  preview: Array<Record<string, unknown>>;
}
