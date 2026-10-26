import { ApiError } from '../utils/errors.ts';
import { newId } from '../utils/id.ts';
import { nowMs } from '../utils/time.ts';
import { parseCsv, toCsv } from '../utils/csv.ts';
import { toJson } from '../utils/json.ts';
import {
  validateQuestionInput,
  gradeAnswer,
  contentHashOf,
  type NormalizedQuestion,
} from '../validators/question.ts';
import * as questions from '../repositories/question-repo.ts';
import {
  favoriteIdsOf,
  pickFavoriteQuestionIds,
  pickMistakeQuestionIds,
  createPracticeSession,
  findPracticeSession,
  finishPracticeSession as finishSessionRecord,
  findAnswerBySessionQuestion,
  insertAnswerRecord,
  incrementPracticeSession,
  upsertWrongQuestion,
  listSessionAnswers,
} from '../repositories/practice-repo.ts';
import { writeAudit } from '../repositories/content-repo.ts';
import { findSimilarStem, type DuplicateCandidate } from './dedupe.ts';
import { logWarn } from '../utils/logger.ts';
import type { AuthUser } from '../types/env.ts';
import type { PublicQuestion, QuestionRecord, QuestionStatus, QuestionType } from '../types/models.ts';

// ---------------------------------------------------------------------------
// 安全视图
// ---------------------------------------------------------------------------

export type PublicQuestionView = PublicQuestion & { isFavorite: boolean };

export function toPublicQuestion(question: QuestionRecord, favorite = false): PublicQuestionView {
  return {
    id: question.id,
    type: question.type,
    subject: question.subject,
    categoryId: question.categoryId,
    category: question.category,
    knowledgePoints: question.knowledgePoints,
    difficulty: question.difficulty,
    stem: question.stem,
    options: question.options,
    source: question.source,
    sourceRef: question.sourceRef,
    tags: question.tags,
    status: question.status,
    version: question.version,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
    publishedAt: question.publishedAt,
    archivedAt: question.archivedAt,
    isFavorite: favorite,
  };
}

export async function listPublicQuestions(
  db: D1Database,
  filters: questions.QuestionFilters,
  userId: string,
): Promise<{ items: PublicQuestionView[]; total: number }> {
  const result = await questions.listQuestions(db, filters, true);
  const favorites = await favoriteIdsOf(db, userId, result.items.map((item) => item.id));
  return {
    total: result.total,
    items: result.items.map((item) => toPublicQuestion(item, favorites.has(item.id))),
  };
}

export async function getPublicQuestion(db: D1Database, userId: string, id: string): Promise<PublicQuestionView> {
  const question = await questions.findQuestionById(db, id);
  if (!question || question.status !== 'published') throw ApiError.notFound('题目不存在或未发布');
  const favorites = await favoriteIdsOf(db, userId, [id]);
  return toPublicQuestion(question, favorites.has(id));
}

// ---------------------------------------------------------------------------
// 刷题
// ---------------------------------------------------------------------------

const PRACTICE_MODES = new Set([
  'random',
  'sequence',
  'subject',
  'category',
  'knowledge',
  'type',
  'difficulty',
  'mistake',
  'favorite',
]);

export interface StartPracticeInput {
  mode: string;
  count: number;
  subject?: string;
  categoryId?: string;
  type?: string;
  difficulty?: number;
  knowledgePoint?: string;
}

export async function startPracticeSession(
  db: D1Database,
  user: AuthUser,
  input: StartPracticeInput,
): Promise<{ sessionId: string; questions: PublicQuestionView[]; total: number; requested: number }> {
  if (!PRACTICE_MODES.has(input.mode)) throw ApiError.badRequest('刷题模式不合法');
  const count = Math.min(100, Math.max(1, Math.floor(input.count || 10)));
  const now = nowMs();

  let picked: QuestionRecord[] = [];
  const filters: Record<string, unknown> = {};

  if (input.mode === 'mistake') {
    const ids = await pickMistakeQuestionIds(db, user.id, count);
    picked = await questions.findQuestionsByIds(db, ids);
  } else if (input.mode === 'favorite') {
    const ids = await pickFavoriteQuestionIds(db, user.id, count);
    picked = await questions.findQuestionsByIds(db, ids);
  } else {
    let type: QuestionType | undefined;
    if (input.type && ['single', 'multiple', 'boolean'].includes(input.type)) type = input.type as QuestionType;
    if (input.mode === 'subject') {
      if (!input.subject) throw ApiError.badRequest('请选择科目');
      filters.subject = input.subject;
    }
    if (input.mode === 'category') {
      if (!input.categoryId) throw ApiError.badRequest('请选择分类');
      filters.categoryId = input.categoryId;
    }
    if (input.mode === 'knowledge') {
      if (!input.knowledgePoint) throw ApiError.badRequest('请填写知识点');
      filters.knowledgePoint = input.knowledgePoint;
    }
    if (input.mode === 'type' && !type) throw ApiError.badRequest('请选择题型');
    if (input.mode === 'difficulty' && !input.difficulty) throw ApiError.badRequest('请选择难度');

    // 筛选模式下按题型分别抽题，保证题型筛选生效
    if (type) {
      picked = await questions.pickRandomQuestions(db, {
        type,
        subject: input.subject || undefined,
        categoryIds: input.categoryId ? [input.categoryId] : undefined,
        knowledgePoints: input.knowledgePoint ? [input.knowledgePoint] : undefined,
        difficulty: input.difficulty ?? null,
        count,
        order: input.mode === 'sequence' ? 'sequence' : 'random',
      });
    } else {
      const perType: QuestionType[] = ['single', 'multiple', 'boolean'];
      const seen = new Set<string>();
      for (const t of perType) {
        // 每种题型都按总数量抽取，最后打乱截断，避免某一题型题量少时导致练习题目不足
        const batch = await questions.pickRandomQuestions(db, {
          type: t,
          subject: input.subject || undefined,
          categoryIds: input.categoryId ? [input.categoryId] : undefined,
          knowledgePoints: input.knowledgePoint ? [input.knowledgePoint] : undefined,
          difficulty: input.difficulty ?? null,
          count,
          order: input.mode === 'sequence' ? 'sequence' : 'random',
        });
        for (const item of batch) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            picked.push(item);
          }
        }
      }
      // 打乱跨题型顺序（顺序模式则按创建时间排序）
      picked = input.mode === 'sequence' ? picked.sort((a, b) => a.createdAt - b.createdAt) : shuffle(picked);
      picked = picked.slice(0, count);
    }
  }

  if (picked.length === 0) {
    throw ApiError.conflict(
      input.mode === 'mistake'
        ? '错题本中没有待复习的题目'
        : input.mode === 'favorite'
          ? '收藏夹中没有题目'
          : '当前筛选条件下没有已发布的题目',
    );
  }

  const sessionId = newId('ps');
  await createPracticeSession(db, {
    id: sessionId,
    userId: user.id,
    mode: input.mode,
    filters,
    questionIds: picked.map((item) => item.id),
    startedAt: now,
  });
  const favorites = await favoriteIdsOf(db, user.id, picked.map((item) => item.id));
  return {
    sessionId,
    questions: picked.map((item) => toPublicQuestion(item, favorites.has(item.id))),
    total: picked.length,
    requested: count,
  };
}

export async function finishPracticeSession(
  db: D1Database,
  user: AuthUser,
  sessionId: string,
): Promise<{ id: string; answeredCount: number; correctCount: number; totalQuestions: number; accuracy: number }> {
  const session = await findPracticeSession(db, sessionId);
  if (!session || session.userId !== user.id) throw ApiError.notFound('练习不存在');
  if (session.status === 'active') {
    await finishSessionRecord(db, session.id, nowMs());
    session.status = 'finished';
  }
  const accuracy = session.answeredCount > 0 ? Math.round((session.correctCount / session.answeredCount) * 10000) / 100 : 0;
  return {
    id: session.id,
    answeredCount: session.answeredCount,
    correctCount: session.correctCount,
    totalQuestions: session.totalQuestions,
    accuracy,
  };
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

/** 提交答案：完全由后端判分，返回正确答案与解析。 */
export async function submitAnswer(
  db: D1Database,
  user: AuthUser,
  input: { questionId: string; sessionId?: string | null; answer: unknown; timeSpentMs?: number },
): Promise<AnswerResult> {
  const question = await questions.findQuestionById(db, input.questionId);
  if (!question || question.status !== 'published') throw ApiError.notFound('题目不存在或未发布');

  let session = null;
  let source: 'practice' | 'mistake' | 'favorite' = 'practice';
  if (input.sessionId) {
    session = await findPracticeSession(db, input.sessionId);
    if (!session || session.userId !== user.id) throw ApiError.notFound('练习不存在');
    if (session.status !== 'active') throw ApiError.conflict('该练习已结束，请重新开始');
    if (!session.questionIds.includes(question.id)) throw ApiError.badRequest('该题不属于当前练习');
    if (session.mode === 'mistake') source = 'mistake';
    if (session.mode === 'favorite') source = 'favorite';
    const existing = await findAnswerBySessionQuestion(db, session.id, question.id);
    if (existing) {
      // 幂等：重复提交返回既有判分结果，不重复计数
      return {
        questionId: question.id,
        isCorrect: existing.isCorrect,
        correctAnswer: question.answer,
        explanation: question.explanation,
        duplicate: true,
        answeredAt: existing.createdAt,
        questionType: question.type,
      };
    }
  }

  const isCorrect = gradeAnswer(question.type, question.answer, input.answer);
  const now = nowMs();
  const timeSpentMs = Math.max(0, Math.min(Number(input.timeSpentMs) || 0, 3_600_000));
  await insertAnswerRecord(db, {
    id: newId('ar'),
    userId: user.id,
    sessionId: session?.id ?? null,
    questionId: question.id,
    questionType: question.type,
    userAnswer: Array.isArray(input.answer)
      ? input.answer.map(String)
      : input.answer === undefined || input.answer === null
        ? []
        : [String(input.answer)],
    isCorrect,
    timeSpentMs,
    source,
    createdAt: now,
  });
  if (session) await incrementPracticeSession(db, session.id, isCorrect);
  await upsertWrongQuestion(db, {
    id: newId('wq'),
    userId: user.id,
    questionId: question.id,
    isCorrect,
    now,
  });

  return {
    questionId: question.id,
    isCorrect,
    correctAnswer: question.answer,
    explanation: question.explanation,
    duplicate: false,
    answeredAt: now,
    questionType: question.type,
  };
}

// ---------------------------------------------------------------------------
// 分类与筛选项
// ---------------------------------------------------------------------------

export async function ensureCategory(db: D1Database, subject: string, category: string): Promise<string | null> {
  if (!category) return null;
  const existing = await questions.findCategoryByName(db, subject, category);
  if (existing) return existing.id;
  const id = newId('cat');
  await questions.upsertCategory(db, {
    id,
    name: category,
    subject,
    description: null,
    sortOrder: 0,
    now: nowMs(),
  });
  const created = await questions.findCategoryByName(db, subject, category);
  return created?.id ?? id;
}

export async function listCategories(db: D1Database, subject?: string) {
  return questions.listCategories(db, subject);
}

export async function createCategory(
  db: D1Database,
  adminId: string,
  input: { name: string; subject: string; description?: string; sortOrder?: number },
  ipHash: string | null,
): Promise<void> {
  const name = (input.name ?? '').trim();
  const subject = (input.subject ?? '').trim();
  if (!name || name.length > 40) throw ApiError.badRequest('分类名称不能为空且不超过 40 个字符');
  if (!subject || subject.length > 60) throw ApiError.badRequest('科目不能为空且不超过 60 个字符');
  const existing = await questions.findCategoryByName(db, subject, name);
  if (existing) throw ApiError.conflict('该科目下已存在同名分类');
  const id = newId('cat');
  const now = nowMs();
  await questions.upsertCategory(db, {
    id,
    name,
    subject,
    description: input.description?.slice(0, 200) ?? null,
    sortOrder: Number(input.sortOrder) || 0,
    now,
  });
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'category.create',
    targetType: 'category',
    targetId: id,
    detail: { subject, name },
    ipHash,
    now,
  });
}

export async function deleteCategory(
  db: D1Database,
  adminId: string,
  id: string,
  ipHash: string | null,
): Promise<void> {
  const category = await questions.findCategoryById(db, id);
  if (!category) throw ApiError.notFound('分类不存在');
  await questions.deleteCategory(db, id);
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'category.delete',
    targetType: 'category',
    targetId: id,
    detail: { subject: category.subject, name: category.name },
    ipHash,
    now: nowMs(),
  });
}

export async function filterOptions(db: D1Database) {
  const [subjects, categories] = await Promise.all([questions.listSubjects(db), questions.listCategories(db)]);
  return {
    subjects,
    categories,
    types: [
      { value: 'single', label: '单选题' },
      { value: 'multiple', label: '多选题' },
      { value: 'boolean', label: '判断题' },
    ],
    difficulties: [1, 2, 3, 4, 5],
  };
}

// ---------------------------------------------------------------------------
// 管理员题库操作
// ---------------------------------------------------------------------------

export interface AdminQuestionPayload {
  status?: QuestionStatus;
  [key: string]: unknown;
}

function buildInsertInput(
  normalized: NormalizedQuestion,
  contentHash: string,
  categoryId: string | null,
  status: QuestionStatus,
  createdBy: string,
  now: number,
): questions.InsertQuestionInput {
  return {
    id: newId('q'),
    type: normalized.type,
    subject: normalized.subject,
    categoryId,
    category: normalized.category,
    knowledgePoints: normalized.knowledgePoints,
    difficulty: normalized.difficulty,
    stem: normalized.stem,
    options: normalized.options,
    answer: normalized.answer,
    explanation: normalized.explanation,
    source: normalized.source,
    sourceRef: normalized.sourceRef,
    tags: normalized.tags,
    status,
    contentHash,
    createdBy,
    now,
  };
}

export async function adminCreateQuestion(
  db: D1Database,
  adminId: string,
  payload: Record<string, unknown>,
  ipHash: string | null,
): Promise<QuestionRecord> {
  const validation = await validateQuestionInput(payload);
  if (!validation.ok || !validation.question) {
    throw ApiError.badRequest('题目校验失败', validation.errors);
  }
  const status = normalizeStatus(payload.status, 'draft');
  const categoryId = await ensureCategory(db, validation.question.subject, validation.question.category);
  const input = buildInsertInput(validation.question, validation.contentHash!, categoryId, status, adminId, nowMs());
  await questions.insertQuestion(db, input);
  await questions.saveQuestionVersion(db, {
    id: newId('qv'),
    questionId: input.id,
    version: 1,
    snapshot: { ...validation.question, status },
    changedBy: adminId,
    changeNote: '创建题目',
    now: input.now,
  });
  const created = await questions.findQuestionById(db, input.id);
  if (!created) throw ApiError.internal('题目创建失败');
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'question.create',
    targetType: 'question',
    targetId: created.id,
    detail: { type: created.type, subject: created.subject },
    ipHash,
    now: input.now,
  });
  return created;
}

export async function adminUpdateQuestion(
  db: D1Database,
  adminId: string,
  questionId: string,
  payload: Record<string, unknown>,
  ipHash: string | null,
): Promise<QuestionRecord> {
  const existing = await questions.findQuestionById(db, questionId);
  if (!existing) throw ApiError.notFound('题目不存在');
  const validation = await validateQuestionInput({
    status: existing.status,
    ...payload,
  });
  if (!validation.ok || !validation.question) {
    throw ApiError.badRequest('题目校验失败', validation.errors);
  }
  const status = normalizeStatus(payload.status ?? existing.status, existing.status);
  const categoryId = await ensureCategory(db, validation.question.subject, validation.question.category);
  const now = nowMs();
  await questions.updateQuestionRecord(
    db,
    existing.id,
    {
      ...buildInsertInput(validation.question, validation.contentHash!, categoryId, status, adminId, now),
      version: existing.version + 1,
    },
    now,
  );
  await questions.saveQuestionVersion(db, {
    id: newId('qv'),
    questionId: existing.id,
    version: existing.version + 1,
    snapshot: { ...validation.question, status },
    changedBy: adminId,
    changeNote: '编辑题目',
    now,
  });
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'question.update',
    targetType: 'question',
    targetId: existing.id,
    detail: { version: existing.version + 1 },
    ipHash,
    now,
  });
  const updated = await questions.findQuestionById(db, existing.id);
  if (!updated) throw ApiError.internal('题目更新失败');
  return updated;
}

export async function adminSetQuestionStatus(
  db: D1Database,
  adminId: string,
  questionId: string,
  status: QuestionStatus,
  ipHash: string | null,
): Promise<void> {
  const existing = await questions.findQuestionById(db, questionId);
  if (!existing) throw ApiError.notFound('题目不存在');
  const now = nowMs();
  await questions.setQuestionStatus(db, questionId, status, now);
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: status === 'published' ? 'question.publish' : status === 'archived' ? 'question.archive' : 'question.status',
    targetType: 'question',
    targetId: questionId,
    detail: { from: existing.status, to: status },
    ipHash,
    now,
  });
}

export async function adminDeleteQuestion(
  db: D1Database,
  adminId: string,
  questionId: string,
  ipHash: string | null,
): Promise<void> {
  const existing = await questions.findQuestionById(db, questionId);
  if (!existing) throw ApiError.notFound('题目不存在');
  const now = nowMs();
  await questions.softDeleteQuestion(db, questionId, now);
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'question.delete',
    targetType: 'question',
    targetId: questionId,
    detail: { type: existing.type, subject: existing.subject },
    ipHash,
    now,
  });
}

export async function adminBulkCategory(
  db: D1Database,
  adminId: string,
  input: { ids: string[]; subject: string; category: string },
  ipHash: string | null,
): Promise<{ updated: number }> {
  if (!Array.isArray(input.ids) || input.ids.length === 0) throw ApiError.badRequest('请选择要修改的题目');
  if (input.ids.length > 200) throw ApiError.badRequest('单次最多修改 200 道题');
  const categoryId = await ensureCategory(db, input.subject, input.category);
  let updated = 0;
  for (const id of input.ids) {
    const existing = await questions.findQuestionById(db, id);
    if (!existing) continue;
    const now = nowMs();
    await questions.setQuestionStatus(db, id, existing.status, now);
    // 单独更新分类字段，避免改动其它内容
    await db
      .prepare('UPDATE questions SET subject = ?, category = ?, category_id = ?, updated_at = ? WHERE id = ?')
      .bind(input.subject, input.category, categoryId, now, id)
      .run();
    updated += 1;
  }
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'question.bulk_category',
    targetType: 'question',
    detail: { count: updated, subject: input.subject, category: input.category },
    ipHash,
    now: nowMs(),
  });
  return { updated };
}

// ---------------------------------------------------------------------------
// 导入
// ---------------------------------------------------------------------------

type DuplicateStrategy = 'skip' | 'update' | 'create';

interface ImportRow {
  row: number;
  raw: unknown;
}

interface ImportError {
  row: number;
  message: string;
}

const MAX_IMPORT_ROWS = 1000;

const JSON_KEYS = new Set(['type', 'subject', 'category', 'knowledge_points', 'knowledgePoints', 'difficulty', 'stem', 'options', 'answer', 'explanation', 'source', 'source_ref', 'sourceRef', 'tags', 'status']);

function parseImportContent(format: string, content: string): { rows: ImportRow[]; errors: ImportError[] } {
  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw ApiError.badRequest('JSON 文件格式错误，无法解析');
    }
    let list: unknown[] = [];
    if (Array.isArray(parsed)) list = parsed;
    else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown[] }).questions)) {
      list = (parsed as { questions: unknown[] }).questions;
    } else {
      throw ApiError.badRequest('JSON 必须是题目数组，或包含 questions 数组的对象');
    }
    if (list.length > MAX_IMPORT_ROWS) throw ApiError.badRequest(`单次最多导入 ${MAX_IMPORT_ROWS} 道题，请分批导入`);
    return { rows: list.map((raw, index) => ({ row: index + 1, raw })), errors: [] };
  }

  if (format === 'csv') {
    const { rows, errors: csvErrors } = parseCsv(content);
    if (rows.length === 0) throw ApiError.badRequest('CSV 内容为空');
    if (rows.length - 1 > MAX_IMPORT_ROWS) throw ApiError.badRequest(`单次最多导入 ${MAX_IMPORT_ROWS} 道题，请分批导入`);
    const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const errors: ImportError[] = csvErrors.map((message) => ({ row: 0, message }));
    const result: ImportRow[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const cells = rows[i];
      const record: Record<string, unknown> = {};
      header.forEach((key, index) => {
        const value = cells[index] ?? '';
        if (value === '') return;
        const canonical = canonicalCsvKey(key);
        if (canonical) record[canonical] = value;
      });
      // 兼容 option_a .. option_h 列
      const optionEntries: Array<{ key: string; text: string }> = [];
      for (const letter of 'abcdefgh') {
        const key = `option_${letter}`;
        if (typeof record[key] === 'string' && String(record[key]).trim()) {
          optionEntries.push({ key: letter.toUpperCase(), text: String(record[key]).trim() });
          delete record[key];
        }
      }
      if (optionEntries.length > 0) record.options = optionEntries;
      result.push({ row: i + 1, raw: record });
    }
    return { rows: result, errors };
  }

  throw ApiError.badRequest('仅支持 JSON 或 CSV 格式');
}

function canonicalCsvKey(key: string): string | null {
  const map: Record<string, string> = {
    type: 'type',
    '题型': 'type',
    subject: 'subject',
    '科目': 'subject',
    category: 'category',
    '分类': 'category',
    '章节': 'category',
    knowledge_points: 'knowledge_points',
    knowledgepoints: 'knowledge_points',
    '知识点': 'knowledge_points',
    difficulty: 'difficulty',
    '难度': 'difficulty',
    stem: 'stem',
    '题干': 'stem',
    options: 'options',
    '选项': 'options',
    answer: 'answer',
    '答案': 'answer',
    explanation: 'explanation',
    '解析': 'explanation',
    source: 'source',
    '来源': 'source',
    source_ref: 'source_ref',
    '来源章节': 'source_ref',
    tags: 'tags',
    '标签': 'tags',
    status: 'status',
  };
  for (const letter of 'abcdefgh') {
    map[`option_${letter}`] = `option_${letter}`;
    map[`option${letter}`] = `option_${letter}`;
  }
  return map[key] ?? null;
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
  errors: ImportError[];
  duplicateDetails: Array<{ row: number; existingId: string; similarity: number; reason: string }>;
  preview: NormalizedQuestion[];
}

export async function importQuestions(
  db: D1Database,
  adminId: string,
  payload: {
    format: string;
    content: string;
    mode?: string;
    duplicateStrategy?: string;
    defaultStatus?: string;
  },
  ipHash: string | null,
): Promise<ImportSummary> {
  const format = payload.format === 'csv' ? 'csv' : payload.format === 'json' ? 'json' : null;
  if (!format) throw ApiError.badRequest('仅支持 JSON 或 CSV 格式');
  if (typeof payload.content !== 'string' || payload.content.trim().length === 0) {
    throw ApiError.badRequest('导入内容不能为空');
  }
  if (new TextEncoder().encode(payload.content).byteLength > 5 * 1024 * 1024) {
    throw ApiError.payloadTooLarge('导入文件不能超过 5 MB');
  }
  const mode = payload.mode === 'commit' ? 'commit' : 'preview';
  const strategy: DuplicateStrategy =
    payload.duplicateStrategy === 'update' ? 'update' : payload.duplicateStrategy === 'create' ? 'create' : 'skip';
  const defaultStatus = payload.defaultStatus === 'published' ? 'published' : 'draft';

  const { rows, errors: parseErrors } = parseImportContent(format, payload.content);
  if (rows.length === 0) throw ApiError.badRequest('没有可导入的题目');

  const valid: Array<{ row: number; question: NormalizedQuestion; hash: string; status: QuestionStatus }> = [];
  const errors: ImportError[] = [...parseErrors];

  for (const item of rows) {
    const validation = await validateQuestionInput(item.raw);
    if (!validation.ok || !validation.question || !validation.contentHash) {
      errors.push({ row: item.row, message: validation.errors.join('；') || '题目校验失败' });
      continue;
    }
    const rawStatus = (item.raw as Record<string, unknown>)?.status;
    const status = rawStatus === 'published' ? 'published' : rawStatus === 'draft' ? 'draft' : defaultStatus;
    valid.push({ row: item.row, question: validation.question, hash: validation.contentHash, status });
  }

  const duplicateDetails: ImportSummary['duplicateDetails'] = [];
  const existingByHash = await questions.findQuestionsByHashes(db, valid.map((item) => item.hash));
  const candidateCache = new Map<string, DuplicateCandidate[]>();
  const getCandidates = async (subject: string): Promise<DuplicateCandidate[]> => {
    if (!candidateCache.has(subject)) {
      candidateCache.set(subject, await questions.findDuplicateCandidates(db, subject));
    }
    return candidateCache.get(subject)!;
  };

  const decisions: Array<{
    row: number;
    question: NormalizedQuestion;
    status: QuestionStatus;
    action: 'insert' | 'update' | 'skip';
    existingId?: string;
    similarity?: number;
  }> = [];

  for (const item of valid) {
    const exact = existingByHash.get(item.hash);
    if (exact) {
      if (strategy === 'skip') {
        decisions.push({ row: item.row, question: item.question, status: item.status, action: 'skip', existingId: exact.id });
        duplicateDetails.push({ row: item.row, existingId: exact.id, similarity: 1, reason: '题干完全重复' });
        continue;
      }
      if (strategy === 'update') {
        decisions.push({ row: item.row, question: item.question, status: item.status, action: 'update', existingId: exact.id });
        continue;
      }
      decisions.push({ row: item.row, question: item.question, status: item.status, action: 'insert' });
      continue;
    }
    const similar = findSimilarStem(item.question.stem, await getCandidates(item.question.subject));
    if (similar) {
      duplicateDetails.push({ row: item.row, existingId: similar.id, similarity: similar.similarity, reason: '题干高度相似' });
      if (strategy === 'skip') {
        decisions.push({ row: item.row, question: item.question, status: item.status, action: 'skip', existingId: similar.id, similarity: similar.similarity });
        continue;
      }
      if (strategy === 'update') {
        decisions.push({ row: item.row, question: item.question, status: item.status, action: 'update', existingId: similar.id, similarity: similar.similarity });
        continue;
      }
    }
    decisions.push({ row: item.row, question: item.question, status: item.status, action: 'insert' });
  }

  const toInsert = decisions.filter((item) => item.action === 'insert');
  const toUpdate = decisions.filter((item) => item.action === 'update');
  const toSkip = decisions.filter((item) => item.action === 'skip');
  const now = nowMs();

  if (mode === 'commit') {
    if (toInsert.length > 0) {
      const inputs: questions.InsertQuestionInput[] = [];
      for (const item of toInsert) {
        const categoryId = await ensureCategory(db, item.question.subject, item.question.category);
        inputs.push(buildInsertInput(item.question, await contentHashOf(item.question.stem), categoryId, item.status, adminId, now));
      }
      await questions.batchInsertQuestions(db, inputs);
    }
    for (const item of toUpdate) {
      if (!item.existingId) continue;
      const existing = await questions.findQuestionById(db, item.existingId);
      if (!existing) continue;
      const categoryId = await ensureCategory(db, item.question.subject, item.question.category);
      await questions.updateQuestionRecord(
        db,
        existing.id,
        {
          ...buildInsertInput(item.question, await contentHashOf(item.question.stem), categoryId, existing.status, adminId, now),
          version: existing.version + 1,
        },
        now,
      );
      await questions.saveQuestionVersion(db, {
        id: newId('qv'),
        questionId: existing.id,
        version: existing.version + 1,
        snapshot: { ...item.question, status: existing.status },
        changedBy: adminId,
        changeNote: `批量导入（第 ${item.row} 行）`,
        now,
      });
    }
    await writeAudit(db, {
      id: newId('log'),
      adminId,
      action: 'question.import',
      targetType: 'question',
      detail: {
        format,
        strategy,
        inserted: toInsert.length,
        updated: toUpdate.length,
        skipped: toSkip.length,
        invalid: rows.length - valid.length,
      },
      ipHash,
      now,
    });
    logWarn('question_import_commit', { format, inserted: toInsert.length, updated: toUpdate.length, skipped: toSkip.length });
  }

  return {
    mode,
    format,
    total: rows.length,
    valid: valid.length,
    invalid: rows.length - valid.length,
    duplicates: duplicateDetails.length,
    inserted: mode === 'commit' ? toInsert.length : 0,
    updated: mode === 'commit' ? toUpdate.length : 0,
    skipped: toSkip.length,
    errors: errors.slice(0, 100),
    duplicateDetails: duplicateDetails.slice(0, 100),
    preview: valid.slice(0, 10).map((item) => item.question),
  };
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export async function exportQuestions(
  db: D1Database,
  filters: questions.QuestionFilters,
  format: 'json' | 'csv',
): Promise<{ content: string; filename: string; count: number }> {
  const limitFilters = { ...filters, offset: 0, pageSize: 5000 };
  const result = await questions.listQuestions(db, limitFilters, false);
  const stamp = new Date(nowMs()).toISOString().slice(0, 10);
  if (format === 'csv') {
    const header = [
      'type', 'subject', 'category', 'knowledge_points', 'difficulty', 'stem',
      'options', 'answer', 'explanation', 'source', 'source_ref', 'tags', 'status',
    ];
    const rows: Array<Array<string | number>> = [header];
    for (const item of result.items) {
      rows.push([
        item.type,
        item.subject,
        item.category,
        item.knowledgePoints.join('|'),
        item.difficulty,
        item.stem,
        item.options.map((option) => `${option.key}. ${option.text}`).join('|'),
        item.answer.join('|'),
        item.explanation,
        item.source ?? '',
        item.sourceRef ?? '',
        item.tags.join('|'),
        item.status,
      ]);
    }
    return { content: toCsv(rows), filename: `questions-${stamp}.csv`, count: result.items.length };
  }
  const payload = {
    version: 1,
    exportedAt: new Date(nowMs()).toISOString(),
    count: result.items.length,
    questions: result.items.map((item) => ({
      type: item.type,
      subject: item.subject,
      category: item.category,
      knowledge_points: item.knowledgePoints,
      difficulty: item.difficulty,
      stem: item.stem,
      options: item.options,
      answer: item.answer,
      explanation: item.explanation,
      source: item.source,
      source_ref: item.sourceRef,
      tags: item.tags,
      status: item.status,
    })),
  };
  return { content: JSON.stringify(payload, null, 2), filename: `questions-${stamp}.json`, count: result.items.length };
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function normalizeStatus(value: unknown, fallback: QuestionStatus): QuestionStatus {
  return value === 'draft' || value === 'pending' || value === 'published' || value === 'archived' ? value : fallback;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export { JSON_KEYS, toJson };

/** 练习会话详情（用于刷新/断网恢复），答案记录只返回判分结果，不重复返回可被利用的判分信息。 */
export async function getPracticeSessionView(
  db: D1Database,
  user: AuthUser,
  sessionId: string,
): Promise<{
  session: {
    id: string;
    mode: string;
    totalQuestions: number;
    answeredCount: number;
    correctCount: number;
    status: string;
    startedAt: number;
    finishedAt: number | null;
  };
  questions: PublicQuestionView[];
  answers: Array<{ questionId: string; isCorrect: boolean; userAnswer: string[]; correctAnswer: string[]; explanation: string }>;
}> {
  const session = await findPracticeSession(db, sessionId);
  if (!session || session.userId !== user.id) throw ApiError.notFound('练习不存在');
  const records = await questions.findQuestionsByIds(db, session.questionIds);
  const favorites = await favoriteIdsOf(db, user.id, records.map((item) => item.id));
  const answers = await listSessionAnswers(db, session.id);
  return {
    session: {
      id: session.id,
      mode: session.mode,
      totalQuestions: session.totalQuestions,
      answeredCount: session.answeredCount,
      correctCount: session.correctCount,
      status: session.status,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
    },
    questions: records.map((item) => toPublicQuestion(item, favorites.has(item.id))),
    answers: answers.map((item) => {
      const record = records.find((question) => question.id === item.questionId);
      return {
        questionId: item.questionId,
        isCorrect: item.isCorrect,
        userAnswer: item.userAnswer,
        correctAnswer: record?.answer ?? [],
        explanation: record?.explanation ?? '',
      };
    }),
  };
}
