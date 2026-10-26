import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { loadConfig } from '../utils/config.ts';
import { jsonOk, paginationMeta } from '../utils/response.ts';
import { readJsonBody } from '../utils/http.ts';
import { readPagination } from '../validators/common.ts';
import { findUserById, updateUserProfile } from '../repositories/user-repo.ts';
import { getUserStats, listPracticeHistory, listRecentAnswers } from '../repositories/practice-repo.ts';
import { nowMs } from '../utils/time.ts';
import type { RequestContext } from '../types/env.ts';

function userId(ctx: RequestContext): string {
  if (!ctx.user) throw ApiError.unauthorized();
  return ctx.user.id;
}

export function registerUserRoutes(router: Router): void {
  router.get('/api/v1/users/me', async (ctx) => {
    const user = await findUserById(ctx.env.DB, userId(ctx));
    if (!user) throw ApiError.notFound('用户不存在');
    return jsonOk({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: user.mustChangePassword,
    });
  }, { auth: true });

  router.patch('/api/v1/users/me', async (ctx) => {
    const body = await readJsonBody<{ displayName?: unknown }>(ctx.req, 5_000);
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 30) : null;
    await updateUserProfile(ctx.env.DB, userId(ctx), displayName || null, nowMs());
    return jsonOk({ displayName: displayName || null });
  }, { auth: true });

  router.get('/api/v1/users/me/stats', async (ctx) => {
    const config = loadConfig(ctx.env);
    const stats = await getUserStats(ctx.env.DB, userId(ctx), nowMs(), config.tzOffset);
    return jsonOk(stats);
  }, { auth: true });

  router.get('/api/v1/users/me/history', async (ctx) => {
    const pagination = readPagination(ctx.url, 20, 100);
    const [sessions, answers] = await Promise.all([
      listPracticeHistory(ctx.env.DB, {
        userId: userId(ctx),
        offset: pagination.offset,
        pageSize: pagination.pageSize,
      }),
      listRecentAnswers(ctx.env.DB, userId(ctx), 30),
    ]);
    return jsonOk(
      { practiceSessions: sessions.items, recentAnswers: answers },
      { pagination: paginationMeta(pagination.page, pagination.pageSize, sessions.total) },
    );
  }, { auth: true });
}
