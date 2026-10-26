export interface InviteRow {
  id: string;
  code_hash: string;
  code_mask: string;
  note: string | null;
  max_uses: number;
  used_count: number;
  expires_at: number | null;
  status: 'active' | 'disabled';
  created_by: string | null;
  created_at: number;
}

export interface InviteRecord {
  id: string;
  codeMask: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: number | null;
  status: 'active' | 'disabled';
  createdAt: number;
}

export function mapInvite(row: InviteRow): InviteRecord {
  return {
    id: row.id,
    codeMask: row.code_mask,
    note: row.note,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function createInvitation(
  db: D1Database,
  input: { id: string; codeHash: string; codeMask: string; note: string | null; maxUses: number; expiresAt: number | null; createdBy: string; now: number },
): Promise<InviteRecord> {
  await db
    .prepare(
      `INSERT INTO invitations (id, code_hash, code_mask, note, max_uses, used_count, expires_at, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'active', ?, ?)`,
    )
    .bind(input.id, input.codeHash, input.codeMask, input.note, input.maxUses, input.expiresAt, input.createdBy, input.now)
    .run();
  return {
    id: input.id,
    codeMask: input.codeMask,
    note: input.note,
    maxUses: input.maxUses,
    usedCount: 0,
    expiresAt: input.expiresAt,
    status: 'active',
    createdAt: input.now,
  };
}

export async function findInvitationByCodeHash(db: D1Database, codeHash: string): Promise<InviteRow | null> {
  return db.prepare('SELECT * FROM invitations WHERE code_hash = ?').bind(codeHash).first<InviteRow>();
}

/**
 * 原子占用一次邀请码名额。
 * 单条 UPDATE 由 D1 串行执行，条件放在 WHERE 中，避免并发超额使用。
 * 返回 true 表示成功占用，false 表示已失效/已用尽。
 */
export async function claimInvitation(db: D1Database, invitationId: string, now: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE invitations
       SET used_count = used_count + 1
       WHERE id = ?
         AND status = 'active'
         AND used_count < max_uses
         AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(invitationId, now)
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

/** 补偿回滚：用户创建失败时归还名额。 */
export async function releaseInvitation(db: D1Database, invitationId: string): Promise<void> {
  await db
    .prepare('UPDATE invitations SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END WHERE id = ?')
    .bind(invitationId)
    .run();
}

export async function recordInvitationUsage(
  db: D1Database,
  input: { id: string; invitationId: string; userId: string; now: number },
): Promise<void> {
  await db
    .prepare('INSERT INTO invitation_usages (id, invitation_id, user_id, used_at) VALUES (?, ?, ?, ?)')
    .bind(input.id, input.invitationId, input.userId, input.now)
    .run();
}

export async function listInvitations(
  db: D1Database,
  filters: { status?: string; offset: number; pageSize: number },
): Promise<{ items: InviteRecord[]; total: number }> {
  const params: unknown[] = [];
  let where = 'WHERE 1 = 1';
  if (filters.status && filters.status !== 'all') {
    where += ' AND status = ?';
    params.push(filters.status);
  }
  const total = await db
    .prepare(`SELECT COUNT(*) AS c FROM invitations ${where}`)
    .bind(...params)
    .first<{ c: number }>();
  const rows = await db
    .prepare(`SELECT * FROM invitations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, filters.pageSize, filters.offset)
    .all<InviteRow>();
  return { total: total?.c ?? 0, items: (rows.results ?? []).map(mapInvite) };
}

export async function disableInvitation(db: D1Database, invitationId: string): Promise<boolean> {
  const result = await db.prepare("UPDATE invitations SET status = 'disabled' WHERE id = ?").bind(invitationId).run();
  return (result.meta?.changes ?? 0) === 1;
}

export interface InviteUsageItem {
  id: string;
  userId: string;
  username: string;
  usedAt: number;
}

export async function listInvitationUsages(db: D1Database, invitationId: string): Promise<InviteUsageItem[]> {
  const rows = await db
    .prepare(
      `SELECT u.id, u.user_id, u.used_at, us.username
       FROM invitation_usages u
       JOIN users us ON us.id = u.user_id
       WHERE u.invitation_id = ?
       ORDER BY u.used_at DESC
       LIMIT 200`,
    )
    .bind(invitationId)
    .all<{ id: string; user_id: string; used_at: number; username: string }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    usedAt: row.used_at,
  }));
}
