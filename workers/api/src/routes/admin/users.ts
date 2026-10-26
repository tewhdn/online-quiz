import type { Router } from '../../router.ts';
import { ApiError } from '../../utils/errors.ts';
import { jsonOk, paginationMeta } from '../../utils/response.ts';
import { readPagination } from '../../validators/common.ts';
import { loadConfig } from '../../utils/config.ts';
import { findUserById, listUsers, revokeAllUserSessions, setUserStatus, countAdmins } from '../../repositories/user-repo.ts';
import { getUserStats } from '../../repositories/practice-repo.ts';
import { writeAudit } from '../../repositories/content-repo.ts';
import { disableUser, enableUser, resetUserPassword } from '../../services/auth-service.ts';
import { newId } from '../../utils/id.ts';
import { nowMs } from '../../utils/time.ts';

export function registerAdminUserRoutes(router: Router): void {
  router.get('/api/v1/admin/users', async (ctx) => {
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listUsers(ctx.env.DB, {
      q: ctx.url.searchParams.get('q') ?? undefined,
      status: ctx.url.searchParams.get('status') ?? undefined,
      role: ctx.url.searchParams.get('role') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/users/:id', async (ctx) => {
    const user = await findUserById(ctx.env.DB, ctx.params.id);
    if (!user) throw ApiError.notFound('用户不存在');
    const config = loadConfig(ctx.env);
    const stats = await getUserStats(ctx.env.DB, user.id, nowMs(), config.tzOffset);
    return jsonOk({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        displayName: user.displayName,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        mustChangePassword: user.mustChangePassword,
      },
      stats,
    });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/users/:id/reset-password', async (ctx) => {
    const config = loadConfig(ctx.env);
    const result = await resetUserPassword(ctx.env.DB, config, ctx.user!.id, ctx.params.id, {
      ipHash: ctx.ipHash ?? null,
    });
    return jsonOk({
      userId: ctx.params.id,
      initialPassword: result.initialPassword,
      notice: '该初始密码只显示一次，请通过安全渠道交给用户，并要求其首次登录后立即修改。',
    });
  }, { auth: true, admin: true, rateLimit: { key: 'admin-reset', limit: 30, windowSeconds: 60 } });

  router.post('/api/v1/admin/users/:id/disable', async (ctx) => {
    await disableUser(ctx.env.DB, ctx.user!.id, ctx.params.id, { ipHash: ctx.ipHash ?? null });
    return jsonOk({ userId: ctx.params.id, status: 'disabled' });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/users/:id/enable', async (ctx) => {
    await enableUser(ctx.env.DB, ctx.user!.id, ctx.params.id, { ipHash: ctx.ipHash ?? null });
    return jsonOk({ userId: ctx.params.id, status: 'active' });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/users/:id/delete', async (ctx) => {
    const adminId = ctx.user!.id;
    const target = await findUserById(ctx.env.DB, ctx.params.id);
    if (!target || target.status === 'deleted') throw ApiError.notFound('用户不存在');
    if (target.id === adminId) throw ApiError.badRequest('不能删除自己');
    if (target.role === 'admin') {
      const admins = await countAdmins(ctx.env.DB);
      if (admins <= 1) throw ApiError.badRequest('系统至少需要保留一个可用管理员');
    }
    const now = nowMs();
    // 软删除：保留答题记录、错题与考试成绩，避免历史数据丢失
    await setUserStatus(ctx.env.DB, target.id, 'deleted', now);
    await revokeAllUserSessions(ctx.env.DB, target.id, now);
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId,
      action: 'user.soft_delete',
      targetType: 'user',
      targetId: target.id,
      detail: { username: target.username },
      ipHash: ctx.ipHash ?? null,
      now,
    });
    return jsonOk({ userId: target.id, status: 'deleted' });
  }, { auth: true, admin: true });
}
