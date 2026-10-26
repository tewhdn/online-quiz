import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { jsonOk, paginationMeta } from '../utils/response.ts';
import { readJsonBody } from '../utils/http.ts';
import { readPagination, readInt, asRecord } from '../validators/common.ts';
import { finishPracticeSession, getPracticeSessionView, startPracticeSession } from '../services/question-service.ts';
import { listPracticeHistory } from '../repositories/practice-repo.ts';
import type { RequestContext } from '../types/env.ts';

function requiredUser(ctx: RequestContext) {
  if (!ctx.user) throw ApiError.unauthorized();
  return ctx.user;
}

export function registerPracticeRoutes(router: Router): void {
  router.post('/api/v1/practice/sessions', async (ctx) => {
    const user = requiredUser(ctx);
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 10_000));
    const mode = typeof body.mode === 'string' ? body.mode : 'random';
    const count = readInt(body, 'count', { min: 1, max: 100, fallback: 10, label: '题目数量' });
    const difficultyRaw = body.difficulty;
    const difficulty = difficultyRaw === undefined || difficultyRaw === null || difficultyRaw === ''
      ? undefined
      : readInt(body, 'difficulty', { min: 1, max: 5, label: '难度' });
    const result = await startPracticeSession(ctx.env.DB, user, {
      mode,
      count,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
      type: typeof body.type === 'string' ? body.type : undefined,
      difficulty,
      knowledgePoint: typeof body.knowledgePoint === 'string' ? body.knowledgePoint : undefined,
    });
    return jsonOk(result, {}, 201);
  }, { auth: true, rateLimit: { key: 'practice-start', limit: 30, windowSeconds: 60 } });

  router.get('/api/v1/practice/sessions/:id', async (ctx) => {
    const user = requiredUser(ctx);
    const view = await getPracticeSessionView(ctx.env.DB, user, ctx.params.id);
    return jsonOk(view);
  }, { auth: true });

  router.post('/api/v1/practice/sessions/:id/submit', async (ctx) => {
    const user = requiredUser(ctx);
    const result = await finishPracticeSession(ctx.env.DB, user, ctx.params.id);
    return jsonOk(result);
  }, { auth: true });

  router.get('/api/v1/practice/history', async (ctx) => {
    const user = requiredUser(ctx);
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listPracticeHistory(ctx.env.DB, {
      userId: user.id,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true });
}
