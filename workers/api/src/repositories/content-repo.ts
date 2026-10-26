import { ApiError } from '../utils/errors.ts';

// ---------------------------------------------------------------------------
// 系统设置
// ---------------------------------------------------------------------------

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, now)
    .run();
}

// ---------------------------------------------------------------------------
// 管理员操作审计（不含任何密码、Token、API Key）
// ---------------------------------------------------------------------------

export async function writeAudit(
  db: D1Database,
  input: {
    id: string;
    adminId: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    detail?: Record<string, unknown>;
    ipHash?: string | null;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, detail, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.adminId,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.detail ?? {}),
      input.ipHash ?? null,
      input.now,
    )
    .run();
}

export interface AuditItem {
  id: string;
  adminId: string | null;
  adminName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string;
  createdAt: number;
}

export async function listAuditLogs(
  db: D1Database,
  filters: { action?: string; offset: number; pageSize: number },
): Promise<{ items: AuditItem[]; total: number }> {
  const params: unknown[] = [];
  let where = 'WHERE 1 = 1';
  if (filters.action) {
    where += ' AND a.action = ?';
    params.push(filters.action);
  }
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM admin_audit_logs a ${where}`)
    .bind(...params)
    .first<{ c: number }>();
  const rows = await db
    .prepare(
      `SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id, a.detail, a.created_at, u.username
       FROM admin_audit_logs a LEFT JOIN users u ON u.id = a.admin_id
       ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, filters.pageSize, filters.offset)
    .all<{
      id: string;
      admin_id: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      detail: string;
      created_at: number;
      username: string | null;
    }>();
  return {
    total: total?.c ?? 0,
    items: (rows.results ?? []).map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      adminName: row.username,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: row.detail,
      createdAt: row.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// 固定窗口限流（D1 原子自增）
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

export async function hitRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
  now: number,
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  try {
    const row = await db
      .prepare(
        `INSERT INTO rate_limits (key, window_start, count, updated_at) VALUES (?, ?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
           window_start = excluded.window_start,
           updated_at = excluded.updated_at
         RETURNING count, window_start`,
      )
      .bind(key, windowStart, now)
      .first<{ count: number; window_start: number }>();
    const count = row?.count ?? 1;
    return {
      allowed: count <= limit,
      count,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - (row?.window_start ?? windowStart))) / 1000)),
    };
  } catch (error) {
    // 限流表异常不应阻断业务，但要记录（不含敏感信息）
    console.error('rate_limit_error', String(error).slice(0, 200));
    return { allowed: true, count: 0, limit, retryAfterSeconds: 0 };
  }
}

export async function pruneRateLimits(db: D1Database, now: number): Promise<void> {
  await db.prepare('DELETE FROM rate_limits WHERE updated_at < ?').bind(now - 86_400_000).run();
}

export function assertWithinRateLimit(result: RateLimitResult): void {
  if (!result.allowed) {
    throw ApiError.tooManyRequests('操作过于频繁，请稍后再试', { retryAfterSeconds: result.retryAfterSeconds });
  }
}

// ---------------------------------------------------------------------------
// 公告
// ---------------------------------------------------------------------------

export interface AnnouncementRecord {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  pinned: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

function mapAnnouncement(row: AnnouncementRow): AnnouncementRecord {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function listAnnouncements(
  db: D1Database,
  options: { includeDrafts: boolean; limit: number },
): Promise<AnnouncementRecord[]> {
  const where = options.includeDrafts ? '' : "WHERE status = 'published'";
  const rows = await db
    .prepare(`SELECT * FROM announcements ${where} ORDER BY pinned DESC, COALESCE(published_at, created_at) DESC LIMIT ?`)
    .bind(options.limit)
    .all<AnnouncementRow>();
  return (rows.results ?? []).map(mapAnnouncement);
}

export async function findAnnouncement(db: D1Database, id: string): Promise<AnnouncementRecord | null> {
  const row = await db.prepare('SELECT * FROM announcements WHERE id = ?').bind(id).first<AnnouncementRow>();
  return row ? mapAnnouncement(row) : null;
}

export async function createAnnouncement(
  db: D1Database,
  input: { id: string; title: string; content: string; status: 'draft' | 'published'; pinned: boolean; createdBy: string; now: number },
): Promise<AnnouncementRecord> {
  await db
    .prepare(
      `INSERT INTO announcements (id, title, content, status, pinned, created_by, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.title,
      input.content,
      input.status,
      input.pinned ? 1 : 0,
      input.createdBy,
      input.now,
      input.now,
      input.status === 'published' ? input.now : null,
    )
    .run();
  const created = await findAnnouncement(db, input.id);
  if (!created) throw ApiError.internal('公告创建失败');
  return created;
}

export async function updateAnnouncement(
  db: D1Database,
  id: string,
  input: { title: string; content: string; status: 'draft' | 'published'; pinned: boolean },
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE announcements
       SET title = ?, content = ?, status = ?, pinned = ?, updated_at = ?,
           published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN ? ELSE published_at END
       WHERE id = ?`,
    )
    .bind(input.title, input.content, input.status, input.pinned ? 1 : 0, now, input.status, now, id)
    .run();
}

export async function deleteAnnouncement(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
}
