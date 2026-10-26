import { parseJson, parseStringArray, toJson } from '../utils/json.ts';
import type { QuestionRecord } from '../types/models.ts';

export interface ExamRecord {
  id: string;
  title: string;
  description: string;
  subject: string | null;
  categoryIds: string[];
  knowledgePoints: string[];
  typeCounts: { single: number; multiple: number; boolean: number };
  difficultyCounts: Record<string, number>;
  totalQuestions: number;
  totalScore: number;
  scoreSingle: number;
  scoreMultiple: number;
  scoreBoolean: number;
  durationMinutes: number;
  allowEarlySubmit: boolean;
  allowReview: 'never' | 'after_submit' | 'after_end';
  startAt: number | null;
  endAt: number | null;
  allowRetake: boolean;
  status: 'draft' | 'published' | 'closed';
  activeSetId: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

interface ExamRow {
  id: string;
  title: string;
  description: string;
  subject: string | null;
  category_ids: string;
  knowledge_points: string;
  type_counts: string;
  difficulty_counts: string;
  total_questions: number;
  total_score: number;
  score_single: number;
  score_multiple: number;
  score_boolean: number;
  duration_minutes: number;
  allow_early_submit: number;
  allow_review: 'never' | 'after_submit' | 'after_end';
  start_at: number | null;
  end_at: number | null;
  allow_retake: number;
  status: 'draft' | 'published' | 'closed';
  active_set_id: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export function mapExam(row: ExamRow): ExamRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    categoryIds: parseStringArray(row.category_ids),
    knowledgePoints: parseStringArray(row.knowledge_points),
    typeCounts: parseJson(row.type_counts, { single: 0, multiple: 0, boolean: 0 }),
    difficultyCounts: parseJson(row.difficulty_counts, {}),
    totalQuestions: row.total_questions,
    totalScore: row.total_score,
    scoreSingle: row.score_single,
    scoreMultiple: row.score_multiple,
    scoreBoolean: row.score_boolean,
    durationMinutes: row.duration_minutes,
    allowEarlySubmit: row.allow_early_submit === 1,
    allowReview: row.allow_review,
    startAt: row.start_at,
    endAt: row.end_at,
    allowRetake: row.allow_retake === 1,
    status: row.status,
    activeSetId: row.active_set_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ExamInsertInput {
  id: string;
  title: string;
  description: string;
  subject: string | null;
  categoryIds: string[];
  knowledgePoints: string[];
  typeCounts: { single: number; multiple: number; boolean: number };
  difficultyCounts: Record<string, number>;
  totalQuestions: number;
  totalScore: number;
  scoreSingle: number;
  scoreMultiple: number;
  scoreBoolean: number;
  durationMinutes: number;
  allowEarlySubmit: boolean;
  allowReview: 'never' | 'after_submit' | 'after_end';
  startAt: number | null;
  endAt: number | null;
  allowRetake: boolean;
  status: 'draft' | 'published';
  createdBy: string;
  now: number;
}

export async function insertExam(db: D1Database, input: ExamInsertInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO exams
        (id, title, description, subject, category_ids, knowledge_points, type_counts, difficulty_counts,
         total_questions, total_score, score_single, score_multiple, score_boolean, duration_minutes,
         allow_early_submit, allow_review, start_at, end_at, allow_retake, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.title,
      input.description,
      input.subject,
      toJson(input.categoryIds),
      toJson(input.knowledgePoints),
      toJson(input.typeCounts),
      toJson(input.difficultyCounts),
      input.totalQuestions,
      input.totalScore,
      input.scoreSingle,
      input.scoreMultiple,
      input.scoreBoolean,
      input.durationMinutes,
      input.allowEarlySubmit ? 1 : 0,
      input.allowReview,
      input.startAt,
      input.endAt,
      input.allowRetake ? 1 : 0,
      input.status,
      input.createdBy,
      input.now,
      input.now,
    )
    .run();
}

export async function updateExamRecord(db: D1Database, id: string, input: Omit<ExamInsertInput, 'id' | 'createdBy' | 'now'>, now: number): Promise<void> {
  await db
    .prepare(
      `UPDATE exams SET
        title = ?, description = ?, subject = ?, category_ids = ?, knowledge_points = ?, type_counts = ?,
        difficulty_counts = ?, total_questions = ?, total_score = ?, score_single = ?, score_multiple = ?,
        score_boolean = ?, duration_minutes = ?, allow_early_submit = ?, allow_review = ?, start_at = ?, end_at = ?,
        allow_retake = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      input.title,
      input.description,
      input.subject,
      toJson(input.categoryIds),
      toJson(input.knowledgePoints),
      toJson(input.typeCounts),
      toJson(input.difficultyCounts),
      input.totalQuestions,
      input.totalScore,
      input.scoreSingle,
      input.scoreMultiple,
      input.scoreBoolean,
      input.durationMinutes,
      input.allowEarlySubmit ? 1 : 0,
      input.allowReview,
      input.startAt,
      input.endAt,
      input.allowRetake ? 1 : 0,
      input.status,
      now,
      id,
    )
    .run();
}

export async function findExamById(db: D1Database, id: string): Promise<ExamRecord | null> {
  const row = await db.prepare('SELECT * FROM exams WHERE id = ?').bind(id).first<ExamRow>();
  return row ? mapExam(row) : null;
}

export async function listExams(
  db: D1Database,
  filters: { includeDrafts: boolean; subject?: string; offset: number; pageSize: number; now: number },
): Promise<{ items: Array<ExamRecord & { attemptCount: number; userSubmittedCount?: number }>; total: number }> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!filters.includeDrafts) {
    clauses.push("e.status = 'published'");
  }
  if (filters.subject) {
    clauses.push('e.subject = ?');
    params.push(filters.subject);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM exams e ${where}`)
    .bind(...params)
    .first<{ c: number }>();
  const rows = await db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id = e.id AND a.status = 'submitted') AS attempt_count
       FROM exams e ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, filters.pageSize, filters.offset)
    .all<ExamRow & { attempt_count: number }>();
  return {
    total: total?.c ?? 0,
    items: (rows.results ?? []).map((row) => ({
      ...mapExam(row),
      attemptCount: row.attempt_count ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// 试卷快照
// ---------------------------------------------------------------------------

export interface ExamSetQuestion {
  id: string;
  questionId: string;
  position: number;
  type: string;
  score: number;
  snapshot: QuestionRecord;
}

export async function createExamSet(
  db: D1Database,
  input: {
    id: string;
    examId: string;
    version: number;
    questions: Array<{ id: string; questionId: string; position: number; type: string; score: number; snapshot: QuestionRecord }>;
    totalScore: number;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO exam_question_sets (id, exam_id, version, question_count, total_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.examId, input.version, input.questions.length, input.totalScore, input.now)
    .run();

  const statements = input.questions.map((item) =>
    db
      .prepare(
        `INSERT INTO exam_questions (id, set_id, question_id, position, type, score, snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(item.id, input.id, item.questionId, item.position, item.type, item.score, JSON.stringify(item.snapshot)),
  );
  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
  await db.prepare('UPDATE exams SET active_set_id = ?, total_score = ? WHERE id = ?').bind(input.id, input.totalScore, input.examId).run();
}

export async function listExamSetQuestions(db: D1Database, setId: string): Promise<ExamSetQuestion[]> {
  const rows = await db
    .prepare('SELECT * FROM exam_questions WHERE set_id = ? ORDER BY position ASC')
    .bind(setId)
    .all<{ id: string; question_id: string; position: number; type: string; score: number; snapshot: string }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    questionId: row.question_id,
    position: row.position,
    type: row.type,
    score: row.score,
    snapshot: JSON.parse(row.snapshot) as QuestionRecord,
  }));
}

export async function maxSetVersion(db: D1Database, examId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM exam_question_sets WHERE exam_id = ?')
    .bind(examId)
    .first<{ v: number }>();
  return row?.v ?? 0;
}

// ---------------------------------------------------------------------------
// 考试作答
// ---------------------------------------------------------------------------

export interface AttemptRecord {
  id: string;
  examId: string;
  setId: string;
  userId: string;
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: number;
  deadlineAt: number;
  submittedAt: number | null;
  autoSubmitted: boolean;
  score: number | null;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  durationSeconds: number | null;
  resultDetail: string | null;
}

interface AttemptRow {
  id: string;
  exam_id: string;
  set_id: string;
  user_id: string;
  status: 'in_progress' | 'submitted' | 'expired';
  started_at: number;
  deadline_at: number;
  submitted_at: number | null;
  auto_submitted: number;
  score: number | null;
  total_score: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  duration_seconds: number | null;
  result_detail: string | null;
}

function mapAttempt(row: AttemptRow): AttemptRecord {
  return {
    id: row.id,
    examId: row.exam_id,
    setId: row.set_id,
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    submittedAt: row.submitted_at,
    autoSubmitted: row.auto_submitted === 1,
    score: row.score,
    totalScore: row.total_score,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    unansweredCount: row.unanswered_count,
    durationSeconds: row.duration_seconds,
    resultDetail: row.result_detail,
  };
}

export async function insertAttempt(
  db: D1Database,
  input: { id: string; examId: string; setId: string; userId: string; startedAt: number; deadlineAt: number; totalScore: number; now: number },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO exam_attempts
        (id, exam_id, set_id, user_id, status, started_at, deadline_at, total_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.examId, input.setId, input.userId, input.startedAt, input.deadlineAt, input.totalScore, input.now, input.now)
    .run();
}

export async function findAttempt(db: D1Database, id: string): Promise<AttemptRecord | null> {
  const row = await db.prepare('SELECT * FROM exam_attempts WHERE id = ?').bind(id).first<AttemptRow>();
  return row ? mapAttempt(row) : null;
}

export async function findOpenAttempt(db: D1Database, userId: string, examId: string): Promise<AttemptRecord | null> {
  const row = await db
    .prepare(
      `SELECT * FROM exam_attempts WHERE user_id = ? AND exam_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(userId, examId)
    .first<AttemptRow>();
  return row ? mapAttempt(row) : null;
}

export async function countSubmittedAttempts(db: D1Database, userId: string, examId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM exam_attempts WHERE user_id = ? AND exam_id = ? AND status != 'in_progress'")
    .bind(userId, examId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export interface ExamAnswerItem {
  id: string;
  attemptId: string;
  examQuestionId: string;
  questionId: string;
  userAnswer: string[];
  isCorrect: boolean;
  score: number;
  flagged: boolean;
  answeredAt: number;
}

export async function listAttemptAnswers(db: D1Database, attemptId: string): Promise<ExamAnswerItem[]> {
  const rows = await db
    .prepare('SELECT * FROM exam_answers WHERE attempt_id = ?')
    .bind(attemptId)
    .all<{
      id: string;
      attempt_id: string;
      exam_question_id: string;
      question_id: string;
      user_answer: string;
      is_correct: number;
      score: number;
      flagged: number;
      answered_at: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    attemptId: row.attempt_id,
    examQuestionId: row.exam_question_id,
    questionId: row.question_id,
    userAnswer: parseStringArray(row.user_answer),
    isCorrect: row.is_correct === 1,
    score: row.score,
    flagged: row.flagged === 1,
    answeredAt: row.answered_at,
  }));
}

export async function saveExamAnswer(
  db: D1Database,
  input: {
    id: string;
    attemptId: string;
    examQuestionId: string;
    questionId: string;
    userAnswer: string[];
    flagged: boolean;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO exam_answers (id, attempt_id, exam_question_id, question_id, user_answer, is_correct, score, flagged, answered_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
       ON CONFLICT(attempt_id, exam_question_id) DO UPDATE SET
         user_answer = excluded.user_answer,
         flagged = excluded.flagged,
         answered_at = excluded.answered_at`,
    )
    .bind(input.id, input.attemptId, input.examQuestionId, input.questionId, toJson(input.userAnswer), input.flagged ? 1 : 0, input.now)
    .run();
}

export async function finalizeAttemptGrades(
  db: D1Database,
  attemptId: string,
  grades: Array<{ examQuestionId: string; isCorrect: boolean; score: number }>,
): Promise<void> {
  const statements = grades.map((grade) =>
    db
      .prepare('UPDATE exam_answers SET is_correct = ?, score = ? WHERE attempt_id = ? AND exam_question_id = ?')
      .bind(grade.isCorrect ? 1 : 0, grade.score, attemptId, grade.examQuestionId),
  );
  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
}

export async function markAttemptSubmitted(
  db: D1Database,
  input: {
    id: string;
    score: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    durationSeconds: number;
    submittedAt: number;
    autoSubmitted: boolean;
    resultDetail: unknown;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE exam_attempts SET
        status = 'submitted', score = ?, correct_count = ?, wrong_count = ?, unanswered_count = ?,
        duration_seconds = ?, submitted_at = ?, auto_submitted = ?, result_detail = ?, updated_at = ?
       WHERE id = ? AND status = 'in_progress'`,
    )
    .bind(
      input.score,
      input.correctCount,
      input.wrongCount,
      input.unansweredCount,
      input.durationSeconds,
      input.submittedAt,
      input.autoSubmitted ? 1 : 0,
      JSON.stringify(input.resultDetail),
      input.submittedAt,
      input.id,
    )
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function listUserAttempts(
  db: D1Database,
  userId: string,
  examId?: string,
): Promise<Array<AttemptRecord & { examTitle: string; examDuration: number }>> {
  const params: unknown[] = [userId];
  let where = 'WHERE a.user_id = ?';
  if (examId) {
    where += ' AND a.exam_id = ?';
    params.push(examId);
  }
  const rows = await db
    .prepare(
      `SELECT a.*, e.title AS exam_title, e.duration_minutes
       FROM exam_attempts a JOIN exams e ON e.id = a.exam_id
       ${where} ORDER BY a.started_at DESC LIMIT 100`,
    )
    .bind(...params)
    .all<AttemptRow & { exam_title: string; duration_minutes: number }>();
  return (rows.results ?? []).map((row) => ({
    ...mapAttempt(row),
    examTitle: row.exam_title,
    examDuration: row.duration_minutes,
  }));
}

export interface ExamResultItem {
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

export async function listExamResults(db: D1Database, examId: string, limit = 500): Promise<ExamResultItem[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.user_id, u.username, a.score, a.total_score, a.correct_count, a.wrong_count,
              a.unanswered_count, a.duration_seconds, a.submitted_at, a.auto_submitted
       FROM exam_attempts a JOIN users u ON u.id = a.user_id
       WHERE a.exam_id = ? AND a.status != 'in_progress'
       ORDER BY a.score DESC, a.duration_seconds ASC LIMIT ?`,
    )
    .bind(examId, limit)
    .all<{
      id: string;
      user_id: string;
      username: string;
      score: number | null;
      total_score: number;
      correct_count: number;
      wrong_count: number;
      unanswered_count: number;
      duration_seconds: number | null;
      submitted_at: number | null;
      auto_submitted: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    attemptId: row.id,
    userId: row.user_id,
    username: row.username,
    score: row.score ?? 0,
    totalScore: row.total_score,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    unansweredCount: row.unanswered_count,
    durationSeconds: row.duration_seconds,
    submittedAt: row.submitted_at,
    autoSubmitted: row.auto_submitted === 1,
  }));
}

export async function examDashboardStats(db: D1Database): Promise<{ examCount: number; attemptCount: number }> {
  const exam = await db.prepare('SELECT COUNT(*) AS c FROM exams').first<{ c: number }>();
  const attempts = await db
    .prepare("SELECT COUNT(*) AS c FROM exam_attempts WHERE status != 'in_progress'")
    .first<{ c: number }>();
  return { examCount: exam?.c ?? 0, attemptCount: attempts?.c ?? 0 };
}

export async function setExamStatus(
  db: D1Database,
  examId: string,
  status: 'draft' | 'published' | 'closed',
  now: number,
): Promise<boolean> {
  const result = await db.prepare('UPDATE exams SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, examId).run();
  return (result.meta?.changes ?? 0) === 1;
}
