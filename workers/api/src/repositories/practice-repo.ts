import { ApiError } from '../utils/errors.ts';
import { toJson } from '../utils/json.ts';
import { startOfDay } from '../utils/time.ts';
import { mapQuestion } from './question-repo.ts';
import type { QuestionRecord, QuestionType } from '../types/models.ts';

export interface PracticeSessionRecord {
  id: string;
  userId: string;
  mode: string;
  filters: Record<string, unknown>;
  questionIds: string[];
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  status: 'active' | 'finished';
  startedAt: number;
  finishedAt: number | null;
}

interface PracticeSessionRow {
  id: string;
  user_id: string;
  mode: string;
  filters: string;
  question_ids: string;
  total_questions: number;
  answered_count: number;
  correct_count: number;
  status: 'active' | 'finished';
  started_at: number;
  finished_at: number | null;
}

export async function createPracticeSession(
  db: D1Database,
  input: { id: string; userId: string; mode: string; filters: Record<string, unknown>; questionIds: string[]; startedAt: number },
): Promise<PracticeSessionRecord> {
  await db
    .prepare(
      `INSERT INTO practice_sessions (id, user_id, mode, filters, question_ids, total_questions, answered_count, correct_count, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'active', ?)`,
    )
    .bind(
      input.id,
      input.userId,
      input.mode,
      toJson(input.filters),
      toJson(input.questionIds),
      input.questionIds.length,
      input.startedAt,
    )
    .run();
  return {
    id: input.id,
    userId: input.userId,
    mode: input.mode,
    filters: input.filters,
    questionIds: input.questionIds,
    totalQuestions: input.questionIds.length,
    answeredCount: 0,
    correctCount: 0,
    status: 'active',
    startedAt: input.startedAt,
    finishedAt: null,
  };
}

export async function findPracticeSession(db: D1Database, id: string): Promise<PracticeSessionRecord | null> {
  const row = await db.prepare('SELECT * FROM practice_sessions WHERE id = ?').bind(id).first<PracticeSessionRow>();
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    filters: safeJson(row.filters),
    questionIds: safeArray(row.question_ids),
    totalQuestions: row.total_questions,
    answeredCount: row.answered_count,
    correctCount: row.correct_count,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function incrementPracticeSession(
  db: D1Database,
  sessionId: string,
  isCorrect: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE practice_sessions
       SET answered_count = answered_count + 1,
           correct_count = correct_count + ?
       WHERE id = ?`,
    )
    .bind(isCorrect ? 1 : 0, sessionId)
    .run();
}

export async function finishPracticeSession(db: D1Database, sessionId: string, finishedAt: number): Promise<void> {
  await db
    .prepare("UPDATE practice_sessions SET status = 'finished', finished_at = ? WHERE id = ?")
    .bind(finishedAt, sessionId)
    .run();
}

export interface AnswerRecordRow {
  id: string;
  user_id: string;
  session_id: string | null;
  question_id: string;
  question_type: QuestionType;
  user_answer: string;
  is_correct: number;
  time_spent_ms: number;
  source: string;
  created_at: number;
}

export interface AnswerRecord {
  id: string;
  sessionId: string | null;
  questionId: string;
  questionType: QuestionType;
  userAnswer: string[];
  isCorrect: boolean;
  timeSpentMs: number;
  source: string;
  createdAt: number;
}

export function mapAnswerRecord(row: AnswerRecordRow): AnswerRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    questionId: row.question_id,
    questionType: row.question_type,
    userAnswer: safeArray(row.user_answer),
    isCorrect: row.is_correct === 1,
    timeSpentMs: row.time_spent_ms,
    source: row.source,
    createdAt: row.created_at,
  };
}

export async function findAnswerBySessionQuestion(
  db: D1Database,
  sessionId: string,
  questionId: string,
): Promise<AnswerRecord | null> {
  const row = await db
    .prepare('SELECT * FROM answer_records WHERE session_id = ? AND question_id = ?')
    .bind(sessionId, questionId)
    .first<AnswerRecordRow>();
  return row ? mapAnswerRecord(row) : null;
}

export async function insertAnswerRecord(
  db: D1Database,
  input: {
    id: string;
    userId: string;
    sessionId: string | null;
    questionId: string;
    questionType: QuestionType;
    userAnswer: string[];
    isCorrect: boolean;
    timeSpentMs: number;
    source: 'practice' | 'mistake' | 'favorite' | 'exam';
    createdAt: number;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO answer_records
          (id, user_id, session_id, question_id, question_type, user_answer, is_correct, time_spent_ms, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.userId,
        input.sessionId,
        input.questionId,
        input.questionType,
        toJson(input.userAnswer),
        input.isCorrect ? 1 : 0,
        Math.max(0, Math.min(input.timeSpentMs, 3_600_000)),
        input.source,
        input.createdAt,
      )
      .run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      throw ApiError.conflict('该题已经提交过答案，请勿重复提交');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 错题本
// ---------------------------------------------------------------------------

export async function upsertWrongQuestion(
  db: D1Database,
  input: { id: string; userId: string; questionId: string; isCorrect: boolean; now: number },
): Promise<void> {
  if (input.isCorrect) {
    // 只更新已在错题本中的题目，避免把每道答对的题都塞进错题本
    await db
      .prepare(
        `UPDATE wrong_questions
         SET attempt_count = attempt_count + 1, last_result = 1, updated_at = ?
         WHERE user_id = ? AND question_id = ?`,
      )
      .bind(input.now, input.userId, input.questionId)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO wrong_questions
        (id, user_id, question_id, wrong_count, attempt_count, last_result, last_wrong_at, mastered, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, 0, ?, 0, ?, ?)
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         wrong_count = wrong_questions.wrong_count + 1,
         attempt_count = wrong_questions.attempt_count + 1,
         last_result = 0,
         last_wrong_at = excluded.last_wrong_at,
         mastered = 0,
         updated_at = excluded.updated_at`,
    )
    .bind(input.id, input.userId, input.questionId, input.now, input.now, input.now)
    .run();
}

/** 错题重练抽题：优先最近答错的、未掌握的题目。 */
export async function pickMistakeQuestionIds(db: D1Database, userId: string, count: number): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT w.question_id FROM wrong_questions w JOIN questions q ON q.id = w.question_id
       WHERE w.user_id = ? AND w.mastered = 0 AND q.status = 'published' AND q.deleted_at IS NULL
       ORDER BY w.updated_at DESC LIMIT ?`,
    )
    .bind(userId, count)
    .all<{ question_id: string }>();
  return (rows.results ?? []).map((row) => row.question_id);
}

/** 收藏练习抽题。 */
export async function pickFavoriteQuestionIds(db: D1Database, userId: string, count: number): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT f.question_id FROM favorites f JOIN questions q ON q.id = f.question_id
       WHERE f.user_id = ? AND q.status = 'published' AND q.deleted_at IS NULL
       ORDER BY f.created_at DESC LIMIT ?`,
    )
    .bind(userId, count)
    .all<{ question_id: string }>();
  return (rows.results ?? []).map((row) => row.question_id);
}

export interface MistakeItem {
  id: string;
  question: QuestionRecord;
  wrongCount: number;
  attemptCount: number;
  lastResult: boolean;
  lastWrongAt: number | null;
  mastered: boolean;
  updatedAt: number;
}

export async function listMistakes(
  db: D1Database,
  filters: { userId: string; mastered?: boolean | null; subject?: string; type?: string; offset: number; pageSize: number },
): Promise<{ items: MistakeItem[]; total: number }> {
  const clauses = ['w.user_id = ?', 'q.deleted_at IS NULL'];
  const params: unknown[] = [filters.userId];
  if (filters.mastered === true) clauses.push('w.mastered = 1');
  if (filters.mastered === false) clauses.push('w.mastered = 0');
  if (filters.subject) {
    clauses.push('q.subject = ?');
    params.push(filters.subject);
  }
  if (filters.type && filters.type !== 'all') {
    clauses.push('q.type = ?');
    params.push(filters.type);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM wrong_questions w JOIN questions q ON q.id = w.question_id ${where}`)
    .bind(...params)
    .first<{ c: number }>();
  const rows = await db
    .prepare(
      `SELECT w.id AS w_id, w.wrong_count, w.attempt_count, w.last_result, w.last_wrong_at, w.mastered, w.updated_at, q.*
       FROM wrong_questions w JOIN questions q ON q.id = w.question_id
       ${where} ORDER BY w.updated_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, filters.pageSize, filters.offset)
    .all<Record<string, unknown>>();
  return {
    total: total?.c ?? 0,
    items: (rows.results ?? []).map((row) => {
      const { w_id, wrong_count, attempt_count, last_result, last_wrong_at, mastered, updated_at, ...questionRow } = row;
      return {
        id: String(w_id),
        question: mapQuestion(questionRow as never),
        wrongCount: Number(wrong_count),
        attemptCount: Number(attempt_count),
        lastResult: Number(last_result) === 1,
        lastWrongAt: last_wrong_at === null ? null : Number(last_wrong_at),
        mastered: Number(mastered) === 1,
        updatedAt: Number(updated_at),
      };
    }),
  };
}

export async function setMistakeMastered(
  db: D1Database,
  id: string,
  userId: string,
  mastered: boolean,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE wrong_questions SET mastered = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(mastered ? 1 : 0, now, id, userId)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

// ---------------------------------------------------------------------------
// 收藏
// ---------------------------------------------------------------------------

export async function addFavorite(
  db: D1Database,
  input: { id: string; userId: string; questionId: string; now: number },
): Promise<boolean> {
  const result = await db
    .prepare('INSERT OR IGNORE INTO favorites (id, user_id, question_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(input.id, input.userId, input.questionId, input.now)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function removeFavorite(db: D1Database, userId: string, questionId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM favorites WHERE user_id = ? AND question_id = ?')
    .bind(userId, questionId)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function isFavorite(db: D1Database, userId: string, questionId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM favorites WHERE user_id = ? AND question_id = ?')
    .bind(userId, questionId)
    .first<{ ok: number }>();
  return row?.ok === 1;
}

export interface FavoriteItem {
  id: string;
  question: QuestionRecord;
  createdAt: number;
}

export async function listFavorites(
  db: D1Database,
  filters: { userId: string; subject?: string; type?: string; offset: number; pageSize: number },
): Promise<{ items: FavoriteItem[]; total: number }> {
  const clauses = ['f.user_id = ?', 'q.deleted_at IS NULL'];
  const params: unknown[] = [filters.userId];
  if (filters.subject) {
    clauses.push('q.subject = ?');
    params.push(filters.subject);
  }
  if (filters.type && filters.type !== 'all') {
    clauses.push('q.type = ?');
    params.push(filters.type);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM favorites f JOIN questions q ON q.id = f.question_id ${where}`)
    .bind(...params)
    .first<{ c: number }>();
  const rows = await db
    .prepare(
      `SELECT f.id AS f_id, f.created_at AS f_created_at, q.*
       FROM favorites f JOIN questions q ON q.id = f.question_id
       ${where} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, filters.pageSize, filters.offset)
    .all<Record<string, unknown>>();
  return {
    total: total?.c ?? 0,
    items: (rows.results ?? []).map((row) => {
      const { f_id, f_created_at, ...questionRow } = row;
      return {
        id: String(f_id),
        question: mapQuestion(questionRow as never),
        createdAt: Number(f_created_at),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// 用户统计
// ---------------------------------------------------------------------------

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

export async function getUserStats(db: D1Database, userId: string, now: number, tzOffset: number): Promise<UserStats> {
  const dayStart = startOfDay(now, tzOffset);
  const today = await db
    .prepare(
      `SELECT COUNT(*) AS answered, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM answer_records WHERE user_id = ? AND created_at >= ?`,
    )
    .bind(userId, dayStart)
    .first<{ answered: number; correct: number | null }>();
  const total = await db
    .prepare(
      `SELECT COUNT(*) AS answered, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM answer_records WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{ answered: number; correct: number | null }>();
  const wrong = await db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN mastered = 0 THEN 1 ELSE 0 END) AS pending
       FROM wrong_questions WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{ total: number; pending: number | null }>();
  const favorites = await db
    .prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?')
    .bind(userId)
    .first<{ c: number }>();
  const examCount = await db
    .prepare("SELECT COUNT(*) AS c FROM exam_attempts WHERE user_id = ? AND status != 'in_progress'")
    .bind(userId)
    .first<{ c: number }>();
  const practiceCount = await db
    .prepare('SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ?')
    .bind(userId)
    .first<{ c: number }>();
  const lastExamRow = await db
    .prepare(
      `SELECT a.id, a.exam_id, a.score, a.total_score, a.submitted_at, e.title
       FROM exam_attempts a JOIN exams e ON e.id = a.exam_id
       WHERE a.user_id = ? AND a.status != 'in_progress'
       ORDER BY a.submitted_at DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string; exam_id: string; score: number | null; total_score: number; submitted_at: number | null; title: string }>();
  const recent = await db
    .prepare(
      `SELECT a.id, a.question_id, a.source, a.is_correct, a.created_at, q.stem, q.subject
       FROM answer_records a JOIN questions q ON q.id = a.question_id
       WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 10`,
    )
    .bind(userId)
    .all<{
      id: string;
      question_id: string;
      source: string;
      is_correct: number;
      created_at: number;
      stem: string;
      subject: string;
    }>();
  const activity = await db
    .prepare(
      `SELECT date(created_at / 1000 + ? * 60, 'unixepoch') AS day,
              COUNT(*) AS answered,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
       FROM answer_records
       WHERE user_id = ? AND created_at >= ?
       GROUP BY day ORDER BY day ASC`,
    )
    .bind(tzOffset, userId, dayStart - 6 * 86_400_000)
    .all<{ day: string; answered: number; correct: number }>();

  const todayAnswered = today?.answered ?? 0;
  const todayCorrect = today?.correct ?? 0;
  const totalAnswered = total?.answered ?? 0;
  const totalCorrect = total?.correct ?? 0;

  return {
    todayAnswered,
    todayCorrect,
    todayAccuracy: todayAnswered > 0 ? round2((todayCorrect / todayAnswered) * 100) : 0,
    totalAnswered,
    totalCorrect,
    totalAccuracy: totalAnswered > 0 ? round2((totalCorrect / totalAnswered) * 100) : 0,
    wrongCount: wrong?.pending ?? 0,
    wrongTotal: wrong?.total ?? 0,
    favoriteCount: favorites?.c ?? 0,
    examCount: examCount?.c ?? 0,
    practiceCount: practiceCount?.c ?? 0,
    lastExam: lastExamRow
      ? {
          id: lastExamRow.id,
          examId: lastExamRow.exam_id,
          title: lastExamRow.title,
          score: lastExamRow.score ?? 0,
          totalScore: lastExamRow.total_score,
          submittedAt: lastExamRow.submitted_at,
        }
      : null,
    recentRecords: (recent.results ?? []).map((row) => ({
      id: row.id,
      questionId: row.question_id,
      source: row.source,
      isCorrect: row.is_correct === 1,
      createdAt: row.created_at,
      stem: row.stem.slice(0, 120),
      subject: row.subject,
    })),
    dailyActivity: (activity.results ?? []).map((row) => ({
      date: row.day,
      answered: row.answered,
      correct: row.correct ?? 0,
    })),
  };
}

export async function listPracticeHistory(
  db: D1Database,
  filters: { userId: string; offset: number; pageSize: number },
): Promise<{
  items: Array<{
    id: string;
    mode: string;
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    status: string;
    startedAt: number;
    finishedAt: number | null;
  }>;
  total: number;
}> {
  const total = await db
    .prepare('SELECT COUNT(*) AS c FROM practice_sessions WHERE user_id = ?')
    .bind(filters.userId)
    .first<{ c: number }>();
  const rows = await db
    .prepare(
      `SELECT id, mode, total_questions, answered_count, correct_count, status, started_at, finished_at
       FROM practice_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(filters.userId, filters.pageSize, filters.offset)
    .all<{
      id: string;
      mode: string;
      total_questions: number;
      answered_count: number;
      correct_count: number;
      status: string;
      started_at: number;
      finished_at: number | null;
    }>();
  return {
    total: total?.c ?? 0,
    items: (rows.results ?? []).map((row) => ({
      id: row.id,
      mode: row.mode,
      totalQuestions: row.total_questions,
      answeredCount: row.answered_count,
      correctCount: row.correct_count,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    })),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function safeArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function favoriteIdsOf(db: D1Database, userId: string, questionIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(questionIds)).slice(0, 200);
  if (ids.length === 0) return new Set();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db
    .prepare(`SELECT question_id FROM favorites WHERE user_id = ? AND question_id IN (${placeholders})`)
    .bind(userId, ...ids)
    .all<{ question_id: string }>();
  return new Set((rows.results ?? []).map((row) => row.question_id));
}

export async function listRecentAnswers(
  db: D1Database,
  userId: string,
  limit = 30,
): Promise<Array<{ id: string; questionId: string; stem: string; subject: string; isCorrect: boolean; source: string; createdAt: number }>> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.question_id, a.is_correct, a.source, a.created_at, q.stem, q.subject
       FROM answer_records a JOIN questions q ON q.id = a.question_id
       WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT ?`,
    )
    .bind(userId, Math.min(100, Math.max(1, limit)))
    .all<{
      id: string;
      question_id: string;
      is_correct: number;
      source: string;
      created_at: number;
      stem: string;
      subject: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    questionId: row.question_id,
    stem: row.stem.slice(0, 120),
    subject: row.subject,
    isCorrect: row.is_correct === 1,
    source: row.source,
    createdAt: row.created_at,
  }));
}

export async function listSessionAnswers(db: D1Database, sessionId: string): Promise<AnswerRecord[]> {
  const rows = await db
    .prepare('SELECT * FROM answer_records WHERE session_id = ? ORDER BY created_at ASC')
    .bind(sessionId)
    .all<AnswerRecordRow>();
  return (rows.results ?? []).map(mapAnswerRecord);
}
