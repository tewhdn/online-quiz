import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { jsonOk, paginationMeta } from '../utils/response.ts';
import { readJsonBody } from '../utils/http.ts';
import { readPagination } from '../validators/common.ts';
import {
  filterOptions,
  getPublicQuestion,
  listPublicQuestions,
  listCategories,
  submitAnswer,
} from '../services/question-service.ts';
import { withEdgeCache } from '../utils/edge-cache.ts';
import type { RequestContext } from '../types/env.ts';

function requiredUser(ctx: RequestContext) {
  if (!ctx.user) throw ApiError.unauthorized();
  return ctx.user;
}

export function registerQuestionRoutes(router: Router): void {
  router.get('/api/v1/questions/filters', async (ctx) => {
    // 筛选项/分类计数对所有用户一致：边缘缓存 60s
    return withEdgeCache(ctx.req, ctx.execCtx, 60, async () => jsonOk(await filterOptions(ctx.env.DB)));
  }, { auth: true });

  router.get('/api/v1/categories', async (ctx) => {
    const subject = ctx.url.searchParams.get('subject') ?? undefined;
    return withEdgeCache(ctx.req, ctx.execCtx, 120, async () => jsonOk(await listCategories(ctx.env.DB, subject)));
  }, { auth: true });

  router.get('/api/v1/questions', async (ctx) => {
    const user = requiredUser(ctx);
    const pagination = readPagination(ctx.url, 20, 100);
    const params = ctx.url.searchParams;
    const difficulty = Number(params.get('difficulty'));
    const result = await listPublicQuestions(
      ctx.env.DB,
      {
        q: params.get('q') ?? undefined,
        subject: params.get('subject') ?? undefined,
        categoryId: params.get('categoryId') ?? undefined,
        type: params.get('type') ?? undefined,
        difficulty: Number.isFinite(difficulty) && difficulty > 0 ? difficulty : undefined,
        knowledge: params.get('knowledge') ?? undefined,
        offset: pagination.offset,
        pageSize: pagination.pageSize,
        sort: (params.get('sort') as 'newest' | 'oldest' | 'difficulty' | null) ?? 'newest',
      },
      user.id,
    );
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true });

  router.get('/api/v1/questions/:id', async (ctx) => {
    const user = requiredUser(ctx);
    const question = await getPublicQuestion(ctx.env.DB, user.id, ctx.params.id);
    return jsonOk(question);
  }, { auth: true });

  router.post('/api/v1/questions/:id/answer', async (ctx) => {
    const user = requiredUser(ctx);
    const body = await readJsonBody<{ answer?: unknown; sessionId?: string; timeSpentMs?: number }>(ctx.req, 10_000);
    const result = await submitAnswer(ctx.env.DB, user, {
      questionId: ctx.params.id,
      sessionId: body.sessionId ?? null,
      answer: body.answer,
      timeSpentMs: body.timeSpentMs,
    });
    return jsonOk(result);
  }, { auth: true, rateLimit: { key: 'answer', limit: 120, windowSeconds: 60 } });
}
