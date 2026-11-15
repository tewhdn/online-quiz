import { ApiError } from '../utils/errors.ts';
import { parseJson, parseStringArray, toJson } from '../utils/json.ts';
import type { QuestionOption, QuestionRecord, QuestionStatus, QuestionType } from '../types/models.ts';

interface QuestionRow {
  id: string;
  type: QuestionType;
  subject: string;
  category_id: string | null;
  category: string;
  knowledge_points: string;
  difficulty: number;
  stem: string;
  options: string;
  answer: string;
  explanation: string;
  source: string | null;
  source_ref: string | null;
  tags: string;
  status: QuestionStatus;
  version: number;
  content_hash: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  archived_at: number | null;
  deleted_at: number | null;
}

export function mapQuestion(row: QuestionRow): QuestionRecord {
  return {
    id: row.id,
    type: row.type,
    subject: row.subject,
    categoryId: row.category_id,
    category: row.category,
    knowledgePoints: parseStringArray(row.knowledge_points),
    difficulty: row.difficulty,
    stem: row.stem,
    options: parseJson<QuestionOption[]>(row.options, []),
    answer: parseStringArray(row.answer),
    explanation: row.explanation,
    source: row.source,
    sourceRef: row.source_ref,
    tags: parseStringArray(row.tags),
    status: row.status,
    version: row.version,
    contentHash: row.content_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

export interface QuestionFilters {
  q?: string;
  subject?: string;
  categoryId?: string;
  type?: string;
  difficulty?: number;
  status?: string;
  knowledge?: string;
  sourceId?: string;
  offset: number;
  pageSize: number;
  sort?: 'newest' | 'oldest' | 'difficulty';
}

function buildWhere(filters: QuestionFilters, publicOnly: boolean): { sql: string; params: unknown[] } {
  const clauses: string[] = ['q.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (publicOnly) {
    clauses.push("q.status = 'published'");
  } else if (filters.status && filters.status !== 'all') {
    if (filters.status === 'deleted') {
      clauses.length = 0;
      clauses.push('q.deleted_at IS NOT NULL');
    } else {
      clauses.push('q.status = ?');
      params.push(filters.status);
    }
  }
  if (filters.q) {
    clauses.push('(q.stem LIKE ? OR q.explanation LIKE ? OR q.source LIKE ?)');
    const like = `%${filters.q.trim()}%`;
    params.push(like, like, like);
  }
  if (filters.subject) {
    clauses.push('q.subject = ?');
    params.push(filters.subject);
  }
  if (filters.categoryId) {
    clauses.push('q.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.type && filters.type !== 'all') {
    clauses.push('q.type = ?');
    params.push(filters.type);
  }
  if (filters.difficulty) {
    clauses.push('q.difficulty = ?');
    params.push(filters.difficulty);
  }
  if (filters.knowledge) {
    clauses.push('q.knowledge_points LIKE ?');
    params.push(`%${filters.knowledge}%`);
  }
  if (filters.sourceId) {
    clauses.push('q.source_ref = ?');
    params.push(filters.sourceId);
  }
  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

export async function listQuestions(
  db: D1Database,
  filters: QuestionFilters,
  publicOnly: boolean,
): Promise<{ items: QuestionRecord[]; total: number }> {
  const { sql: whereSql, params } = buildWhere(filters, publicOnly);
  const order =
    filters.sort === 'oldest' ? 'q.created_at ASC' : filters.sort === 'difficulty' ? 'q.difficulty ASC, q.created_at DESC' : 'q.created_at DESC';
  // COUNT 与列表一次 batch 发出，少一次 D1 往返
  const [totalRes, rowsRes] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS c FROM questions q ${whereSql}`).bind(...params),
    db
      .prepare(`SELECT q.* FROM questions q ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .bind(...params, filters.pageSize, filters.offset),
  ]);
  const totalRow = (totalRes?.results?.[0] as { c: number } | undefined) ?? undefined;
  const rows = rowsRes as { results?: QuestionRow[] };
  return { total: totalRow?.c ?? 0, items: (rows?.results ?? []).map(mapQuestion) };
}

export async function findQuestionById(db: D1Database, id: string, includeDeleted = false): Promise<QuestionRecord | null> {
  const sql = includeDeleted ? 'SELECT * FROM questions WHERE id = ?' : 'SELECT * FROM questions WHERE id = ? AND deleted_at IS NULL';
  const row = await db.prepare(sql).bind(id).first<QuestionRow>();
  return row ? mapQuestion(row) : null;
}

export interface InsertQuestionInput {
  id: string;
  type: QuestionType;
  subject: string;
  categoryId: string | null;
  category: string;
  knowledgePoints: string[];
  difficulty: number;
  stem: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string;
  source: string;
  sourceRef: string;
  tags: string[];
  status: QuestionStatus;
  contentHash: string;
  createdBy: string;
  now: number;
}

export async function insertQuestion(db: D1Database, input: InsertQuestionInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO questions
        (id, type, subject, category_id, category, knowledge_points, difficulty, stem, options, answer,
         explanation, source, source_ref, tags, status, version, content_hash, created_by, created_at, updated_at,
         published_at, archived_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .bind(
      input.id,
      input.type,
      input.subject,
      input.categoryId,
      input.category,
      toJson(input.knowledgePoints),
      input.difficulty,
      input.stem,
      toJson(input.options),
      toJson(input.answer),
      input.explanation,
      input.source || null,
      input.sourceRef || null,
      toJson(input.tags),
      input.status,
      input.contentHash,
      input.createdBy,
      input.now,
      input.now,
      input.status === 'published' ? input.now : null,
    )
    .run();
}

/** 批量写入（每批 40 条），用于导入。调用方负责分段以控制请求规模。 */
export async function batchInsertQuestions(db: D1Database, items: InsertQuestionInput[], chunkSize = 40): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const statements = chunk.map((input) =>
      db
        .prepare(
          `INSERT INTO questions
            (id, type, subject, category_id, category, knowledge_points, difficulty, stem, options, answer,
             explanation, source, source_ref, tags, status, version, content_hash, created_by, created_at, updated_at,
             published_at, archived_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .bind(
          input.id,
          input.type,
          input.subject,
          input.categoryId,
          input.category,
          toJson(input.knowledgePoints),
          input.difficulty,
          input.stem,
          toJson(input.options),
          toJson(input.answer),
          input.explanation,
          input.source || null,
          input.sourceRef || null,
          toJson(input.tags),
          input.status,
          input.contentHash,
          input.createdBy,
          input.now,
          input.now,
          input.status === 'published' ? input.now : null,
        ),
    );
    await db.batch(statements);
  }
}

export interface UpdateQuestionInput extends Omit<InsertQuestionInput, 'id' | 'createdBy' | 'now'> {
  version: number;
}

export async function updateQuestionRecord(
  db: D1Database,
  id: string,
  input: UpdateQuestionInput,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE questions SET
        type = ?, subject = ?, category_id = ?, category = ?, knowledge_points = ?, difficulty = ?, stem = ?,
        options = ?, answer = ?, explanation = ?, source = ?, source_ref = ?, tags = ?, status = ?, version = ?,
        content_hash = ?, updated_at = ?,
        published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN ? ELSE published_at END,
        archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END
       WHERE id = ?`,
    )
    .bind(
      input.type,
      input.subject,
      input.categoryId,
      input.category,
      toJson(input.knowledgePoints),
      input.difficulty,
      input.stem,
      toJson(input.options),
      toJson(input.answer),
      input.explanation,
      input.source || null,
      input.sourceRef || null,
      toJson(input.tags),
      input.status,
      input.version,
      input.contentHash,
      now,
      input.status,
      now,
      input.status,
      now,
      id,
    )
    .run();
}

export async function setQuestionStatus(
  db: D1Database,
  id: string,
  status: QuestionStatus,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE questions SET status = ?, updated_at = ?,
        published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN ? ELSE published_at END,
        archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(status, now, status, now, status, now, id)
    .run();
}

export async function softDeleteQuestion(db: D1Database, id: string, now: number): Promise<void> {
  await db
    .prepare("UPDATE questions SET status = 'archived', deleted_at = ?, archived_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, now, id)
    .run();
}

export async function saveQuestionVersion(
  db: D1Database,
  input: { id: string; questionId: string; version: number; snapshot: unknown; changedBy: string; changeNote: string; now: number },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO question_versions (id, question_id, version, snapshot, changed_by, change_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.questionId, input.version, JSON.stringify(input.snapshot), input.changedBy, input.changeNote, input.now)
    .run();
}

export async function findQuestionsByHashes(db: D1Database, hashes: string[]): Promise<Map<string, QuestionRecord>> {
  const map = new Map<string, QuestionRecord>();
  for (let i = 0; i < hashes.length; i += 40) {
    const chunk = hashes.slice(i, i + 40);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db
      .prepare(`SELECT * FROM questions WHERE deleted_at IS NULL AND content_hash IN (${placeholders})`)
      .bind(...chunk)
      .all<QuestionRow>();
    for (const row of rows.results ?? []) {
      const record = mapQuestion(row);
      map.set(record.contentHash, record);
    }
  }
  return map;
}

export async function findDuplicateCandidates(
  db: D1Database,
  subject: string,
  limit = 800,
): Promise<Array<{ id: string; stem: string; type: string; status: string }>> {
  const rows = await db
    .prepare(
      `SELECT id, stem, type, status FROM questions
       WHERE deleted_at IS NULL AND subject = ? AND status != 'archived'
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .bind(subject, limit)
    .all<{ id: string; stem: string; type: string; status: string }>();
  return rows.results ?? [];
}

// ---------------------------------------------------------------------------
// 分类
// ---------------------------------------------------------------------------

export interface CategoryRecord {
  id: string;
  name: string;
  subject: string;
  description: string | null;
  sortOrder: number;
  questionCount?: number;
}

export async function listCategories(db: D1Database, subject?: string): Promise<CategoryRecord[]> {
  const params: unknown[] = [];
  let where = '';
  if (subject) {
    where = 'WHERE c.subject = ?';
    params.push(subject);
  }
  const rows = await db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.deleted_at IS NULL AND q.status = 'published') AS question_count
       FROM question_categories c ${where} ORDER BY c.subject, c.sort_order, c.name`,
    )
    .bind(...params)
    .all<{
      id: string;
      name: string;
      subject: string;
      description: string | null;
      sort_order: number;
      created_at: number;
      question_count: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject,
    description: row.description,
    sortOrder: row.sort_order,
    questionCount: row.question_count,
  }));
}

export async function findCategoryById(db: D1Database, id: string): Promise<CategoryRecord | null> {
  const row = await db.prepare('SELECT * FROM question_categories WHERE id = ?').bind(id).first<{
    id: string;
    name: string;
    subject: string;
    description: string | null;
    sort_order: number;
  }>();
  if (!row) return null;
  return { id: row.id, name: row.name, subject: row.subject, description: row.description, sortOrder: row.sort_order };
}

export async function upsertCategory(
  db: D1Database,
  input: { id: string; name: string; subject: string; description: string | null; sortOrder: number; now: number },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO question_categories (id, name, subject, description, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(subject, name) DO UPDATE SET description = excluded.description, sort_order = excluded.sort_order`,
    )
    .bind(input.id, input.name, input.subject, input.description, input.sortOrder, input.now)
    .run();
}

export async function deleteCategory(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE questions SET category_id = NULL WHERE category_id = ?').bind(id).run();
  await db.prepare('DELETE FROM question_categories WHERE id = ?').bind(id).run();
}

export async function findCategoryByName(db: D1Database, subject: string, name: string): Promise<CategoryRecord | null> {
  const row = await db
    .prepare('SELECT * FROM question_categories WHERE subject = ? AND name = ?')
    .bind(subject, name)
    .first<{ id: string; name: string; subject: string; description: string | null; sort_order: number }>();
  if (!row) return null;
  return { id: row.id, name: row.name, subject: row.subject, description: row.description, sortOrder: row.sort_order };
}

// ---------------------------------------------------------------------------
// 抽题与统计
// ---------------------------------------------------------------------------

export interface PickCriteria {
  type: QuestionType;
  order?: 'random' | 'sequence';
  subject?: string;
  categoryIds?: string[];
  knowledgePoints?: string[];
  difficulty?: number | null;
  count: number;
  excludeIds?: string[];
}

export async function pickRandomQuestions(db: D1Database, criteria: PickCriteria): Promise<QuestionRecord[]> {
  const clauses: string[] = ["q.status = 'published'", 'q.deleted_at IS NULL', 'q.type = ?'];
  const params: unknown[] = [criteria.type];
  if (criteria.subject) {
    clauses.push('q.subject = ?');
    params.push(criteria.subject);
  }
  if (criteria.categoryIds && criteria.categoryIds.length > 0) {
    clauses.push(`q.category_id IN (${criteria.categoryIds.map(() => '?').join(',')})`);
    params.push(...criteria.categoryIds);
  }
  if (criteria.knowledgePoints && criteria.knowledgePoints.length > 0) {
    const parts = criteria.knowledgePoints.map(() => 'q.knowledge_points LIKE ?');
    clauses.push(`(${parts.join(' OR ')})`);
    params.push(...criteria.knowledgePoints.map((point) => `%${point}%`));
  }
  if (criteria.difficulty) {
    clauses.push('q.difficulty = ?');
    params.push(criteria.difficulty);
  }
  const exclude = (criteria.excludeIds ?? []).filter(Boolean).slice(0, 100);
  if (exclude.length > 0) {
    clauses.push(`q.id NOT IN (${exclude.map(() => '?').join(',')})`);
    params.push(...exclude);
  }
  const orderSql = criteria.order === 'sequence' ? 'ORDER BY q.created_at ASC, q.id ASC' : 'ORDER BY RANDOM()';
  const rows = await db
    .prepare(`SELECT q.* FROM questions q WHERE ${clauses.join(' AND ')} ${orderSql} LIMIT ?`)
    .bind(...params, criteria.count)
    .all<QuestionRow>();
  return (rows.results ?? []).map(mapQuestion);
}

export async function countAvailableQuestions(
  db: D1Database,
  criteria: Omit<PickCriteria, 'count' | 'excludeIds'>,
): Promise<number> {
  const clauses: string[] = ["q.status = 'published'", 'q.deleted_at IS NULL', 'q.type = ?'];
  const params: unknown[] = [criteria.type];
  if (criteria.subject) {
    clauses.push('q.subject = ?');
    params.push(criteria.subject);
  }
  if (criteria.categoryIds && criteria.categoryIds.length > 0) {
    clauses.push(`q.category_id IN (${criteria.categoryIds.map(() => '?').join(',')})`);
    params.push(...criteria.categoryIds);
  }
  if (criteria.knowledgePoints && criteria.knowledgePoints.length > 0) {
    const parts = criteria.knowledgePoints.map(() => 'q.knowledge_points LIKE ?');
    clauses.push(`(${parts.join(' OR ')})`);
    params.push(...criteria.knowledgePoints.map((point) => `%${point}%`));
  }
  if (criteria.difficulty) {
    clauses.push('q.difficulty = ?');
    params.push(criteria.difficulty);
  }
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM questions q WHERE ${clauses.join(' AND ')}`).bind(...params).first<{ c: number }>();
  return row?.c ?? 0;
}

export async function questionStats(db: D1Database): Promise<{
  total: number;
  published: number;
  draft: number;
  pending: number;
  archived: number;
  byType: Record<string, number>;
  subjects: number;
}> {
  const totals = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
        COUNT(DISTINCT subject) AS subjects
       FROM questions WHERE deleted_at IS NULL`,
    )
    .first<{ total: number; published: number; draft: number; pending: number; archived: number; subjects: number }>();
  const typeRows = await db
    .prepare("SELECT type, COUNT(*) AS c FROM questions WHERE deleted_at IS NULL GROUP BY type")
    .all<{ type: string; c: number }>();
  const byType: Record<string, number> = {};
  for (const row of typeRows.results ?? []) byType[row.type] = row.c;
  return {
    total: totals?.total ?? 0,
    published: totals?.published ?? 0,
    draft: totals?.draft ?? 0,
    pending: totals?.pending ?? 0,
    archived: totals?.archived ?? 0,
    subjects: totals?.subjects ?? 0,
    byType,
  };
}

export async function listSubjects(db: D1Database): Promise<Array<{ subject: string; count: number }>> {
  const rows = await db
    .prepare(
      `SELECT subject, COUNT(*) AS c FROM questions
       WHERE deleted_at IS NULL AND status = 'published'
       GROUP BY subject ORDER BY c DESC LIMIT 200`,
    )
    .all<{ subject: string; c: number }>();
  return (rows.results ?? []).map((row) => ({ subject: row.subject, count: row.c }));
}

export async function assertQuestionExists(db: D1Database, id: string): Promise<QuestionRecord> {
  const question = await findQuestionById(db, id);
  if (!question) throw ApiError.notFound('题目不存在');
  return question;
}

/** 按 ID 批量查询，并保持传入顺序（用于错题重练、收藏练习）。 */
export async function findQuestionsByIds(db: D1Database, ids: string[]): Promise<QuestionRecord[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const map = new Map<string, QuestionRecord>();
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db
      .prepare(`SELECT * FROM questions WHERE id IN (${placeholders}) AND status = 'published' AND deleted_at IS NULL`)
      .bind(...chunk)
      .all<QuestionRow>();
    for (const row of rows.results ?? []) {
      const record = mapQuestion(row);
      map.set(record.id, record);
    }
  }
  return ids.map((id) => map.get(id)).filter((item): item is QuestionRecord => Boolean(item));
}
