import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { jsonOk, paginationMeta } from '../utils/response.ts';
import { readJsonBody } from '../utils/http.ts';
import { readPagination } from '../validators/common.ts';
import { listMistakes, setMistakeMastered } from '../repositories/practice-repo.ts';
import { nowMs } from '../utils/time.ts';
import { toPublicQuestion } from '../services/question-service.ts';
import type { RequestContext } from '../types/env.ts';

function requiredUser(ctx: RequestContext) {
  if (!ctx.user) throw ApiError.unauthorized();
  return ctx.user;
}

export function registerMistakeRoutes(router: Router): void {
  router.get('/api/v1/mistakes', async (ctx) => {
    const user = requiredUser(ctx);
    const pagination = readPagination(ctx.url, 20, 100);
    const status = ctx.url.searchParams.get('status');
    const result = await listMistakes(ctx.env.DB, {
      userId: user.id,
      mastered: status === 'mastered' ? true : status === 'pending' ? false : null,
      subject: ctx.url.searchParams.get('subject') ?? undefined,
      type: ctx.url.searchParams.get('type') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    // 列表不包含答案与解析（练习提交后才返回），避免错题本被当作答案速查
    const items = result.items.map((item) => ({
      id: item.id,
      question: toPublicQuestion(item.question, false),
      wrongCount: item.wrongCount,
      attemptCount: item.attemptCount,
      lastResult: item.lastResult,
      lastWrongAt: item.lastWrongAt,
      mastered: item.mastered,
      updatedAt: item.updatedAt,
    }));
    return jsonOk(items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true });

  router.post('/api/v1/mistakes/:id/mastered', async (ctx) => {
    const user = requiredUser(ctx);
    const body = await readJsonBody<{ mastered?: unknown }>(ctx.req, 2_000);
    const mastered = body.mastered === undefined ? true : Boolean(body.mastered);
    const ok = await setMistakeMastered(ctx.env.DB, ctx.params.id, user.id, mastered, nowMs());
    if (!ok) throw ApiError.notFound('错题记录不存在');
    return jsonOk({ id: ctx.params.id, mastered });
  }, { auth: true });
}
