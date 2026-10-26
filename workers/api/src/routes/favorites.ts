import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { jsonOk, paginationMeta } from '../utils/response.ts';
import { readPagination } from '../validators/common.ts';
import { addFavorite, listFavorites, removeFavorite } from '../repositories/practice-repo.ts';
import { findQuestionById } from '../repositories/question-repo.ts';
import { toPublicQuestion } from '../services/question-service.ts';
import { newId } from '../utils/id.ts';
import { nowMs } from '../utils/time.ts';
import type { RequestContext } from '../types/env.ts';

function requiredUser(ctx: RequestContext) {
  if (!ctx.user) throw ApiError.unauthorized();
  return ctx.user;
}

export function registerFavoriteRoutes(router: Router): void {
  router.get('/api/v1/favorites', async (ctx) => {
    const user = requiredUser(ctx);
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listFavorites(ctx.env.DB, {
      userId: user.id,
      subject: ctx.url.searchParams.get('subject') ?? undefined,
      type: ctx.url.searchParams.get('type') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    const items = result.items.map((item) => ({
      id: item.id,
      question: toPublicQuestion(item.question, true),
      createdAt: item.createdAt,
    }));
    return jsonOk(items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true });

  router.post('/api/v1/favorites/:questionId', async (ctx) => {
    const user = requiredUser(ctx);
    const question = await findQuestionById(ctx.env.DB, ctx.params.questionId);
    if (!question || question.status !== 'published') throw ApiError.notFound('题目不存在或未发布');
    const created = await addFavorite(ctx.env.DB, {
      id: newId('fav'),
      userId: user.id,
      questionId: question.id,
      now: nowMs(),
    });
    return jsonOk({ questionId: question.id, favorited: true, created });
  }, { auth: true, rateLimit: { key: 'favorite', limit: 60, windowSeconds: 60 } });

  router.delete('/api/v1/favorites/:questionId', async (ctx) => {
    const user = requiredUser(ctx);
    const removed = await removeFavorite(ctx.env.DB, user.id, ctx.params.questionId);
    return jsonOk({ questionId: ctx.params.questionId, favorited: false, removed });
  }, { auth: true });
}
