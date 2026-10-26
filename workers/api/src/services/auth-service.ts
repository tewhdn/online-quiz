import { ApiError } from '../utils/errors.ts';
import { hashPassword, verifyPassword, hashInviteCode, randomStringForPassword } from '../utils/crypto.ts';
import { newId, randomToken, sha256Hex } from '../utils/id.ts';
import { nowMs } from '../utils/time.ts';
import { assertInviteCode, assertPassword, assertUsername } from '../validators/auth.ts';
import {
  createSession,
  createUser,
  createUserWithInvitation,
  findSession,
  findUserById,
  findUserByUsername,
  revokeAllUserSessions,
  revokeSession,
  setUserStatus,
  touchLogin,
  updateUserPassword,
  countAdmins,
} from '../repositories/user-repo.ts';
import {
  claimInvitation,
  findInvitationByCodeHash,
  recordInvitationUsage,
  releaseInvitation,
} from '../repositories/invite-repo.ts';
import { writeAudit } from '../repositories/content-repo.ts';
import type { AppConfig } from '../utils/config.ts';
import type { AuthUser } from '../types/env.ts';

/** 固定的假哈希：用户不存在时也执行一次 PBKDF2，降低用户名枚举的时序差异。 */
const DUMMY_HASH =
  'pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export interface AuthSessionResult {
  user: AuthUser;
  token: string;
  csrfToken: string;
  expiresAt: number;
}

export function toAuthUser(user: {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled' | 'deleted';
  mustChangePassword: boolean;
  displayName: string | null;
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    displayName: user.displayName,
  };
}

async function createSessionForUser(
  db: D1Database,
  config: AppConfig,
  userId: string,
  ipHash: string | null,
  userAgent: string | null,
): Promise<{ token: string; csrfToken: string; expiresAt: number }> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const csrfToken = randomToken(24);
  const now = nowMs();
  const expiresAt = now + config.sessionTtlMs;
  await createSession(db, { tokenHash, userId, csrfToken, expiresAt, now, ipHash, userAgent });
  return { token, csrfToken, expiresAt };
}

export async function registerUser(
  db: D1Database,
  config: AppConfig,
  input: { username?: unknown; password?: unknown; confirmPassword?: unknown; inviteCode?: unknown },
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<AuthSessionResult> {
  const username = assertUsername(input.username);
  const password = assertPassword(input.password, username);
  if (typeof input.confirmPassword === 'string' && input.confirmPassword !== password) {
    throw ApiError.badRequest('两次输入的密码不一致');
  }
  const inviteCode = assertInviteCode(input.inviteCode);

  const existing = await findUserByUsername(db, username);
  if (existing) throw ApiError.conflict('用户名已被占用');

  const codeHash = await hashInviteCode(inviteCode);
  const invitation = await findInvitationByCodeHash(db, codeHash);
  if (!invitation) throw ApiError.badRequest('邀请码无效');
  const now = nowMs();
  if (invitation.status !== 'active') throw ApiError.badRequest('邀请码已被禁用');
  if (invitation.expires_at !== null && invitation.expires_at <= now) throw ApiError.badRequest('邀请码已过期');
  if (invitation.used_count >= invitation.max_uses) throw ApiError.badRequest('邀请码使用次数已用尽');

  // 先原子占用名额，再创建用户；创建失败时补偿归还。
  const claimed = await claimInvitation(db, invitation.id, now);
  if (!claimed) throw ApiError.badRequest('邀请码已失效或使用次数已用尽');

  const passwordHash = await hashPassword(password, config.passwordIterations);
  let user;
  try {
    user = await createUserWithInvitation(
      db,
      {
        id: newId('u'),
        username,
        passwordHash,
        role: 'user',
        now,
      },
      { id: newId('iu'), invitationId: invitation.id },
    );
  } catch (error) {
    await releaseInvitation(db, invitation.id);
    throw error;
  }

  const session = await createSessionForUser(db, config, user.id, meta.ipHash, meta.userAgent);
  await touchLogin(db, user.id, now);
  return { user: toAuthUser(user), ...session };
}

export async function loginUser(
  db: D1Database,
  config: AppConfig,
  input: { username?: unknown; password?: unknown },
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<AuthSessionResult> {
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!username || !password) throw ApiError.badRequest('请输入用户名和密码');

  const user = await findUserByUsername(db, username);
  if (!user) {
    // 仍然执行一次哈希校验，避免通过响应时间枚举用户名
    await verifyPassword(password, DUMMY_HASH);
    throw ApiError.unauthorized('用户名或密码错误');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('用户名或密码错误');
  if (user.status !== 'active') throw ApiError.unauthorized('账号不可用，请联系管理员');

  const now = nowMs();
  const session = await createSessionForUser(db, config, user.id, meta.ipHash, meta.userAgent);
  await touchLogin(db, user.id, now);
  return { user: toAuthUser(user), ...session };
}

export async function logoutUser(db: D1Database, tokenHash: string): Promise<void> {
  await revokeSession(db, tokenHash, nowMs());
}

export async function changePassword(
  db: D1Database,
  config: AppConfig,
  user: AuthUser,
  tokenHash: string,
  input: { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown },
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<AuthSessionResult> {
  const record = await findUserById(db, user.id);
  if (!record) throw ApiError.unauthorized();
  if (typeof input.currentPassword !== 'string' || input.currentPassword.length === 0) {
    throw ApiError.badRequest('请输入当前密码');
  }
  const valid = await verifyPassword(input.currentPassword, record.passwordHash);
  if (!valid) throw ApiError.badRequest('当前密码不正确');
  const newPassword = assertPassword(input.newPassword, record.username);
  if (typeof input.confirmPassword === 'string' && input.confirmPassword !== newPassword) {
    throw ApiError.badRequest('两次输入的新密码不一致');
  }
  if (newPassword === input.currentPassword) throw ApiError.badRequest('新密码不能与当前密码相同');

  const now = nowMs();
  const passwordHash = await hashPassword(newPassword, config.passwordIterations);
  await updateUserPassword(db, record.id, passwordHash, false, now);
  // 安全策略：修改密码后使所有旧会话失效，并为当前设备签发新会话
  await revokeAllUserSessions(db, record.id, now);
  const fresh = await createSessionForUser(db, config, record.id, meta.ipHash, meta.userAgent);
  const refreshed = await findUserById(db, record.id);
  if (!refreshed) throw ApiError.internal();
  void tokenHash;
  return { user: toAuthUser(refreshed), ...fresh };
}

/** 管理员重置密码：生成一次性初始密码，返回明文仅此一次，并使该用户全部会话失效。 */
export async function resetUserPassword(
  db: D1Database,
  config: AppConfig,
  adminId: string,
  targetUserId: string,
  meta: { ipHash: string | null },
): Promise<{ initialPassword: string }> {
  const target = await findUserById(db, targetUserId);
  if (!target || target.status === 'deleted') throw ApiError.notFound('用户不存在');
  if (target.id === adminId) {
    throw ApiError.badRequest('不能通过管理接口重置自己的密码，请使用"修改密码"');
  }
  const initialPassword = randomStringForPassword(14);
  const passwordHash = await hashPassword(initialPassword, config.passwordIterations);
  const now = nowMs();
  await updateUserPassword(db, target.id, passwordHash, true, now);
  await revokeAllUserSessions(db, target.id, now);
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'user.reset_password',
    targetType: 'user',
    targetId: target.id,
    detail: { username: target.username },
    ipHash: meta.ipHash,
    now,
  });
  return { initialPassword };
}

export async function disableUser(
  db: D1Database,
  adminId: string,
  targetUserId: string,
  meta: { ipHash: string | null },
): Promise<void> {
  const target = await findUserById(db, targetUserId);
  if (!target || target.status === 'deleted') throw ApiError.notFound('用户不存在');
  if (target.id === adminId) throw ApiError.badRequest('不能禁用自己');
  if (target.role === 'admin') {
    const admins = await countAdmins(db);
    if (admins <= 1) throw ApiError.badRequest('系统至少需要保留一个可用管理员');
  }
  const now = nowMs();
  await setUserStatus(db, target.id, 'disabled', now);
  await revokeAllUserSessions(db, target.id, now);
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'user.disable',
    targetType: 'user',
    targetId: target.id,
    detail: { username: target.username },
    ipHash: meta.ipHash,
    now,
  });
}

export async function enableUser(
  db: D1Database,
  adminId: string,
  targetUserId: string,
  meta: { ipHash: string | null },
): Promise<void> {
  const target = await findUserById(db, targetUserId);
  if (!target || target.status === 'deleted') throw ApiError.notFound('用户不存在');
  const now = nowMs();
  await setUserStatus(db, target.id, 'active', now);
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'user.enable',
    targetType: 'user',
    targetId: target.id,
    detail: { username: target.username },
    ipHash: meta.ipHash,
    now,
  });
}

/** 初始化管理员：仅在系统中还没有管理员时可用，必须提供 ADMIN_SETUP_TOKEN。 */
export async function bootstrapAdmin(
  db: D1Database,
  config: AppConfig,
  input: { username?: unknown; password?: unknown; setupToken: string | null },
): Promise<void> {
  if (!config.adminSetupToken) {
    throw ApiError.forbidden('未配置 ADMIN_SETUP_TOKEN，无法通过接口初始化管理员');
  }
  if (!input.setupToken || input.setupToken !== config.adminSetupToken) {
    throw ApiError.forbidden('初始化令牌不正确');
  }
  const admins = await countAdmins(db);
  if (admins > 0) throw ApiError.conflict('管理员已存在，初始化接口已关闭');
  const username = assertUsername(input.username);
  const password = assertPassword(input.password, username);
  const now = nowMs();
  const passwordHash = await hashPassword(password, config.passwordIterations);
  const user = await createUser(db, {
    id: newId('u'),
    username,
    passwordHash,
    role: 'admin',
    now,
  });
  await writeAudit(db, {
    id: newId('log'),
    adminId: user.id,
    action: 'system.bootstrap_admin',
    targetType: 'user',
    targetId: user.id,
    detail: { username },
    now,
  });
}

export async function resolveSession(
  db: D1Database,
  token: string | null,
): Promise<{ user: AuthUser; session: { tokenHash: string; csrfToken: string } } | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await findSession(db, tokenHash);
  if (!session) return null;
  if (session.expires_at <= nowMs()) return null;
  const user = await findUserById(db, session.user_id);
  if (!user || user.status !== 'active') return null;
  return {
    user: toAuthUser(user),
    session: { tokenHash, csrfToken: session.csrf_token },
  };
}
