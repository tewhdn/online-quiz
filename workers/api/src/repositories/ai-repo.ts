import { parseJson, toJson } from '../utils/json.ts';

export interface AiTaskRecord {
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

interface AiTaskRow {
  id: string;
  admin_id: string;
  mode: 'outline' | 'document' | 'topic';
  subject: string | null;
  params: string;
  status: 'pending' | 'running' | 'succeeded' | 'partial' | 'failed';
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  request_count: number;
  attempts: number;
  source_id: string | null;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number | null;
  review_total?: number;
  review_pending?: number;
}

function mapTask(row: AiTaskRow): AiTaskRecord {
  return {
    id: row.id,
    adminId: row.admin_id,
    mode: row.mode,
    subject: row.subject,
    params: parseJson(row.params, {}),
    status: row.status,
    model: row.model,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    requestCount: row.request_count,
    attempts: row.attempts,
    sourceId: row.source_id,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    reviewTotal: row.review_total ?? 0,
    reviewPending: row.review_pending ?? 0,
  };
}

export async function createAiTask(
  db: D1Database,
  input: {
    id: string;
    adminId: string;
    mode: 'outline' | 'document' | 'topic';
    subject: string | null;
    params: Record<string, unknown>;
    sourceId: string | null;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_generation_tasks (id, admin_id, mode, subject, params, status, source_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(input.id, input.adminId, input.mode, input.subject, toJson(input.params), input.sourceId, input.now)
    .run();
}

export async function updateAiTask(
  db: D1Database,
  id: string,
  patch: {
    status?: 'pending' | 'running' | 'succeeded' | 'partial' | 'failed';
    model?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    requestCount?: number;
    attempts?: number;
    error?: string | null;
    startedAt?: number | null;
    finishedAt?: number | null;
    durationMs?: number | null;
  },
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, unknown> = {
    status: patch.status,
    model: patch.model,
    prompt_tokens: patch.promptTokens,
    completion_tokens: patch.completionTokens,
    total_tokens: patch.totalTokens,
    request_count: patch.requestCount,
    attempts: patch.attempts,
    error: patch.error,
    started_at: patch.startedAt,
    finished_at: patch.finishedAt,
    duration_ms: patch.durationMs,
  };
  for (const [column, value] of Object.entries(map)) {
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (fields.length === 0) return;
  await db.prepare(`UPDATE ai_generation_tasks SET ${fields.join(', ')} WHERE id = ?`).bind(...params, id).run();
}

export async function findAiTask(db: D1Database, id: string): Promise<AiTaskRecord | null> {
  const row = await db.prepare('SELECT * FROM ai_generation_tasks WHERE id = ?').bind(id).first<AiTaskRow>();
  return row ? mapTask(row) : null;
}

export async function listAiTasks(
  db: D1Database,
  filters: { status?: string; offset: number; pageSize: number },
): Promise<{ items: AiTaskRecord[]; total: number }> {
  const params: unknown[] = [];
  let where = 'WHERE 1 = 1';
  if (filters.status && filters.status !== 'all') {
    where += ' AND t.status = ?';
    params.push(filters.status);
  }
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM ai_generation_tasks t ${where}`)
    .bind(...params)
    .first<{ c: number }>();
  const rows = await db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM ai_review_questions r WHERE r.task_id = t.id) AS review_total,
        (SELECT COUNT(*) FROM ai_review_questions r WHERE r.task_id = t.id AND r.status = 'pending') AS review_pending
       FROM ai_generation_tasks t ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, filters.pageSize, filters.offset)
    .all<AiTaskRow>();
  return { total: total?.c ?? 0, items: (rows.results ?? []).map(mapTask) };
}

export async function countAiTasksSince(db: D1Database, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM ai_generation_tasks WHERE created_at >= ?')
    .bind(since)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export async function aiUsageStats(db: D1Database, since: number): Promise<{
  taskCount: number;
  succeeded: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  pendingReview: number;
}> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS task_count,
              SUM(CASE WHEN status IN ('succeeded','partial') THEN 1 ELSE 0 END) AS succeeded,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(COALESCE(prompt_tokens, 0)) AS prompt_tokens,
              SUM(COALESCE(completion_tokens, 0)) AS completion_tokens,
              SUM(COALESCE(total_tokens, 0)) AS total_tokens
       FROM ai_generation_tasks WHERE created_at >= ?`,
    )
    .bind(since)
    .first<{
      task_count: number;
      succeeded: number | null;
      failed: number | null;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      total_tokens: number | null;
    }>();
  const pending = await db
    .prepare("SELECT COUNT(*) AS c FROM ai_review_questions WHERE status = 'pending'")
    .first<{ c: number }>();
  return {
    taskCount: row?.task_count ?? 0,
    succeeded: row?.succeeded ?? 0,
    failed: row?.failed ?? 0,
    promptTokens: row?.prompt_tokens ?? 0,
    completionTokens: row?.completion_tokens ?? 0,
    totalTokens: row?.total_tokens ?? 0,
    pendingReview: pending?.c ?? 0,
  };
}

// ---------------------------------------------------------------------------
// AI 待审核题目
// ---------------------------------------------------------------------------

export interface ReviewQuestionRecord {
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

interface ReviewRow {
  id: string;
  task_id: string;
  payload: string;
  status: 'pending' | 'approved' | 'rejected' | 'invalid';
  validation: string;
  duplicate_of: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  reject_reason: string | null;
  created_question_id: string | null;
  created_at: number;
}

export async function insertReviewQuestions(
  db: D1Database,
  items: Array<{
    id: string;
    taskId: string;
    payload: unknown;
    status: 'pending' | 'invalid';
    validation: unknown;
    duplicateOf: string | null;
    now: number;
  }>,
): Promise<void> {
  const statements = items.map((item) =>
    db
      .prepare(
        `INSERT INTO ai_review_questions (id, task_id, payload, status, validation, duplicate_of, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(item.id, item.taskId, JSON.stringify(item.payload), item.status, JSON.stringify(item.validation), item.duplicateOf, item.now),
  );
  for (let i = 0; i < statements.length; i += 40) {
    await db.batch(statements.slice(i, i + 40));
  }
}

export async function listReviewQuestions(
  db: D1Database,
  filters: { status?: string; taskId?: string; offset: number; pageSize: number },
): Promise<{ items: ReviewQuestionRecord[]; total: number }> {
  const params: unknown[] = [];
  let where = 'WHERE 1 = 1';
  if (filters.status && filters.status !== 'all') {
    where += ' AND r.status = ?';
    params.push(filters.status);
  }
  if (filters.taskId) {
    where += ' AND r.task_id = ?';
    params.push(filters.taskId);
  }
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM ai_review_questions r ${where}`)
    .bind(...params)
    .first<{ c: number }>();
  const rows = await db
    .prepare(`SELECT r.* FROM ai_review_questions r ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, filters.pageSize, filters.offset)
    .all<ReviewRow>();
  return { total: total?.c ?? 0, items: (rows.results ?? []).map(mapReview) };
}

function mapReview(row: ReviewRow): ReviewQuestionRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    payload: parseJson(row.payload, {}),
    status: row.status,
    validation: parseJson(row.validation, {}),
    duplicateOf: row.duplicate_of,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    createdQuestionId: row.created_question_id,
    createdAt: row.created_at,
  };
}

export async function findReviewQuestion(db: D1Database, id: string): Promise<ReviewQuestionRecord | null> {
  const row = await db.prepare('SELECT * FROM ai_review_questions WHERE id = ?').bind(id).first<ReviewRow>();
  return row ? mapReview(row) : null;
}

export async function updateReviewPayload(
  db: D1Database,
  id: string,
  payload: unknown,
  validation: unknown,
): Promise<void> {
  await db
    .prepare('UPDATE ai_review_questions SET payload = ?, validation = ? WHERE id = ?')
    .bind(JSON.stringify(payload), JSON.stringify(validation), id)
    .run();
}

export async function markReviewApproved(
  db: D1Database,
  input: { id: string; questionId: string; reviewedBy: string; now: number },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE ai_review_questions
       SET status = 'approved', created_question_id = ?, reviewed_by = ?, reviewed_at = ?
       WHERE id = ? AND status IN ('pending', 'invalid')`,
    )
    .bind(input.questionId, input.reviewedBy, input.now, input.id)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function markReviewRejected(
  db: D1Database,
  input: { id: string; reason: string; reviewedBy: string; now: number },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE ai_review_questions SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ?
       WHERE id = ? AND status IN ('pending', 'invalid')`,
    )
    .bind(input.reason, input.reviewedBy, input.now, input.id)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function rejectTaskReviewQuestions(
  db: D1Database,
  taskId: string,
  reason: string,
  reviewedBy: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE ai_review_questions SET status = 'rejected', reject_reason = ?, reviewed_by = ?, reviewed_at = ?
       WHERE task_id = ? AND status IN ('pending', 'invalid')`,
    )
    .bind(reason, reviewedBy, now, taskId)
    .run();
}

// ---------------------------------------------------------------------------
// 上传资料
// ---------------------------------------------------------------------------

export interface SourceRecord {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  charCount: number;
  textContent?: string;
  storage: 'd1' | 'r2';
  r2Key: string | null;
  uploadedBy: string | null;
  createdAt: number;
}

export async function createAiSource(
  db: D1Database,
  input: {
    id: string;
    name: string;
    mime: string;
    sizeBytes: number;
    charCount: number;
    textContent: string;
    storage: 'd1' | 'r2';
    r2Key: string | null;
    uploadedBy: string;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_sources (id, name, mime, size_bytes, char_count, text_content, storage, r2_key, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.name,
      input.mime,
      input.sizeBytes,
      input.charCount,
      input.storage === 'd1' ? input.textContent : '',
      input.storage,
      input.r2Key,
      input.uploadedBy,
      input.now,
    )
    .run();
}

export async function findAiSource(db: D1Database, id: string): Promise<SourceRecord | null> {
  const row = await db
    .prepare('SELECT * FROM ai_sources WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<{
      id: string;
      name: string;
      mime: string;
      size_bytes: number;
      char_count: number;
      text_content: string;
      storage: 'd1' | 'r2';
      r2_key: string | null;
      uploaded_by: string | null;
      created_at: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    charCount: row.char_count,
    textContent: row.text_content,
    storage: row.storage,
    r2Key: row.r2_key,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export async function listAiSources(
  db: D1Database,
  limit = 50,
): Promise<Array<Omit<SourceRecord, 'textContent'>>> {
  const rows = await db
    .prepare(
      `SELECT id, name, mime, size_bytes, char_count, storage, r2_key, uploaded_by, created_at
       FROM ai_sources WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{
      id: string;
      name: string;
      mime: string;
      size_bytes: number;
      char_count: number;
      storage: 'd1' | 'r2';
      r2_key: string | null;
      uploaded_by: string | null;
      created_at: number;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    charCount: row.char_count,
    storage: row.storage,
    r2Key: row.r2_key,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }));
}

export async function softDeleteAiSource(db: D1Database, id: string, now: number): Promise<void> {
  await db.prepare('UPDATE ai_sources SET deleted_at = ? WHERE id = ?').bind(now, id).run();
}

export async function countRunningAiTasks(db: D1Database, since: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM ai_generation_tasks WHERE status IN ('pending','running') AND created_at >= ?")
    .bind(since)
    .first<{ c: number }>();
  return row?.c ?? 0;
}
