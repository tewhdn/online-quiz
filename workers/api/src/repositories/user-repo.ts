import { ApiError } from '../utils/errors.ts';

export interface UserRow {
  id: string;
  username: string;
  username_lower: string;
  password_hash: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled' | 'deleted';
  must_change_password: number;
  display_name: string | null;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
  deleted_at: number | null;
}

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled' | 'deleted';
  mustChangePassword: boolean;
  displayName: string | null;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
}

export function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password === 1,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function findUserById(db: D1Database, id: string): Promise<UserRecord | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function findUserByUsername(db: D1Database, username: string): Promise<UserRecord | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE username_lower = ?')
    .bind(username.trim().toLowerCase())
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

export interface CreateUserInput {
  id: string;
  username: string;
  passwordHash: string;
  role?: 'admin' | 'user';
  mustChangePassword?: boolean;
  displayName?: string | null;
  now: number;
}

export async function createUser(db: D1Database, input: CreateUserInput): Promise<UserRecord> {
  try {
    await db
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, role, status, must_change_password, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.username,
        input.username.trim().toLowerCase(),
        input.passwordHash,
        input.role ?? 'user',
        input.mustChangePassword ? 1 : 0,
        input.displayName ?? null,
        input.now,
        input.now,
      )
      .run();
  } catch (error) {
    if (String(error).includes('UNIQUE') || String(error).includes('users.username_lower')) {
      throw ApiError.conflict('用户名已被占用');
    }
    throw error;
  }
  const created = await findUserById(db, input.id);
  if (!created) throw ApiError.internal('用户创建失败');
  return created;
}

export async function touchLogin(db: D1Database, userId: string, now: number): Promise<void> {
  await db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now, now, userId).run();
}

export async function updateUserPassword(
  db: D1Database,
  userId: string,
  passwordHash: string,
  mustChangePassword: boolean,
  now: number,
): Promise<void> {
  await db
    .prepare('UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, mustChangePassword ? 1 : 0, now, userId)
    .run();
}

export async function setUserStatus(
  db: D1Database,
  userId: string,
  status: 'active' | 'disabled' | 'deleted',
  now: number,
): Promise<void> {
  await db
    .prepare('UPDATE users SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?')
    .bind(status, status === 'deleted' ? now : null, now, userId)
    .run();
}

export async function updateUserProfile(
  db: D1Database,
  userId: string,
  displayName: string | null,
  now: number,
): Promise<void> {
  await db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').bind(displayName, now, userId).run();
}

export async function countAdmins(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active' AND deleted_at IS NULL")
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export interface UserListFilters {
  q?: string;
  status?: string;
  role?: string;
  offset: number;
  pageSize: number;
}

export interface UserListItem {
  id: string;
  username: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  displayName: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  answerCount: number;
  correctCount: number;
  examCount: number;
}

export async function listUsers(db: D1Database, filters: UserListFilters): Promise<{ items: UserListItem[]; total: number }> {
  const where: string[] = ["u.status != 'deleted'"];
  const params: unknown[] = [];
  if (filters.q) {
    where.push('u.username_lower LIKE ?');
    params.push(`%${filters.q.trim().toLowerCase()}%`);
  }
  if (filters.status && filters.status !== 'all') {
    where.push('u.status = ?');
    params.push(filters.status);
  }
  if (filters.role && filters.role !== 'all') {
    where.push('u.role = ?');
    params.push(filters.role);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const totalRow = await db.prepare(`SELECT COUNT(*) AS c FROM users u ${whereSql}`).bind(...params).first<{ c: number }>();

  const rows = await db
    .prepare(
      `SELECT u.id, u.username, u.role, u.status, u.must_change_password, u.display_name, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM answer_records a WHERE a.user_id = u.id) AS answer_count,
              (SELECT COUNT(*) FROM answer_records a WHERE a.user_id = u.id AND a.is_correct = 1) AS correct_count,
              (SELECT COUNT(*) FROM exam_attempts e WHERE e.user_id = u.id AND e.status = 'submitted') AS exam_count
       FROM users u ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...params, filters.pageSize, filters.offset)
    .all<{
      id: string;
      username: string;
      role: string;
      status: string;
      must_change_password: number;
      display_name: string | null;
      created_at: number;
      last_login_at: number | null;
      answer_count: number;
      correct_count: number;
      exam_count: number;
    }>();

  return {
    total: totalRow?.c ?? 0,
    items: (rows.results ?? []).map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      status: row.status,
      mustChangePassword: row.must_change_password === 1,
      displayName: row.display_name,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      answerCount: row.answer_count,
      correctCount: row.correct_count,
      examCount: row.exam_count,
    })),
  };
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------

export interface SessionRow {
  token_hash: string;
  user_id: string;
  csrf_token: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

export async function createSession(
  db: D1Database,
  input: { tokenHash: string; userId: string; csrfToken: string; expiresAt: number; now: number; ipHash?: string | null; userAgent?: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at, ip_hash, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(input.tokenHash, input.userId, input.csrfToken, input.now, input.expiresAt, input.ipHash ?? null, input.userAgent ?? null)
    .run();
}

export async function findSession(db: D1Database, tokenHash: string): Promise<SessionRow | null> {
  return db
    .prepare('SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(tokenHash)
    .first<SessionRow>();
}

export async function revokeSession(db: D1Database, tokenHash: string, now: number): Promise<void> {
  await db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(now, tokenHash).run();
}

export async function revokeAllUserSessions(db: D1Database, userId: string, now: number): Promise<void> {
  await db
    .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(now, userId)
    .run();
}

export async function deleteExpiredSessions(db: D1Database, now: number): Promise<void> {
  // 清理：已撤销且过期的会话，以及过期超过 7 天的会话
  await db
    .prepare('DELETE FROM sessions WHERE (revoked_at IS NOT NULL AND expires_at < ?) OR expires_at < ?')
    .bind(now, now - 7 * 86_400_000)
    .run();
}

/** 注册：用户创建与邀请码使用记录在同一次 batch 中写入（D1 batch 原子执行）。 */
export async function createUserWithInvitation(
  db: D1Database,
  input: CreateUserInput,
  usage: { id: string; invitationId: string },
): Promise<UserRecord> {
  const now = input.now;
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, username, username_lower, password_hash, role, status, must_change_password, display_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'user', 'active', 0, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.username,
          input.username.trim().toLowerCase(),
          input.passwordHash,
          input.displayName ?? null,
          now,
          now,
        ),
      db
        .prepare('INSERT INTO invitation_usages (id, invitation_id, user_id, used_at) VALUES (?, ?, ?, ?)')
        .bind(usage.id, usage.invitationId, input.id, now),
    ]);
  } catch (error) {
    if (String(error).includes('UNIQUE') || String(error).includes('username_lower')) {
      throw ApiError.conflict('用户名已被占用');
    }
    throw error;
  }
  const created = await findUserById(db, input.id);
  if (!created) throw ApiError.internal('用户创建失败');
  return created;
}
