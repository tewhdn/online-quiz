import type { Router } from '../../router.ts';
import { ApiError } from '../../utils/errors.ts';
import { fileResponse, jsonOk, paginationMeta } from '../../utils/response.ts';
import { readJsonBody } from '../../utils/http.ts';
import { readPagination, asRecord } from '../../validators/common.ts';
import {
  adminBulkCategory,
  adminCreateQuestion,
  adminDeleteQuestion,
  adminSetQuestionStatus,
  adminUpdateQuestion,
  createCategory,
  deleteCategory,
  exportQuestions,
  importQuestions,
} from '../../services/question-service.ts';
import { findQuestionById, listQuestions, questionStats } from '../../repositories/question-repo.ts';
import type { QuestionStatus } from '../../types/models.ts';

function filtersFromUrl(url: URL) {
  const difficulty = Number(url.searchParams.get('difficulty'));
  return {
    q: url.searchParams.get('q') ?? undefined,
    subject: url.searchParams.get('subject') ?? undefined,
    categoryId: url.searchParams.get('categoryId') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    difficulty: Number.isFinite(difficulty) && difficulty > 0 ? difficulty : undefined,
    knowledge: url.searchParams.get('knowledge') ?? undefined,
  };
}

export function registerAdminQuestionRoutes(router: Router): void {
  router.get('/api/v1/admin/questions/export', async (ctx) => {
    const format = ctx.url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
    const filters = { ...filtersFromUrl(ctx.url), offset: 0, pageSize: 5000 };
    const result = await exportQuestions(ctx.env.DB, filters, format);
    return fileResponse(result.content, result.filename, format === 'csv' ? 'text/csv' : 'application/json');
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/questions/stats', async (ctx) => {
    return jsonOk(await questionStats(ctx.env.DB));
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/questions', async (ctx) => {
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listQuestions(
      ctx.env.DB,
      { ...filtersFromUrl(ctx.url), offset: pagination.offset, pageSize: pagination.pageSize, sort: 'newest' },
      false,
    );
    const items = result.items.map((item) => ({
      id: item.id,
      type: item.type,
      subject: item.subject,
      category: item.category,
      categoryId: item.categoryId,
      knowledgePoints: item.knowledgePoints,
      difficulty: item.difficulty,
      stem: item.stem,
      options: item.options,
      answer: item.answer,
      explanation: item.explanation,
      source: item.source,
      sourceRef: item.sourceRef,
      tags: item.tags,
      status: item.status,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
    return jsonOk(items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/questions/:id', async (ctx) => {
    const question = await findQuestionById(ctx.env.DB, ctx.params.id, true);
    if (!question) throw ApiError.notFound('题目不存在');
    return jsonOk(question);
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/questions', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 100_000));
    const created = await adminCreateQuestion(ctx.env.DB, ctx.user!.id, body, ctx.ipHash ?? null);
    return jsonOk(created, {}, 201);
  }, { auth: true, admin: true, rateLimit: { key: 'admin-question-create', limit: 120, windowSeconds: 60 } });

  router.put('/api/v1/admin/questions/:id', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 100_000));
    const updated = await adminUpdateQuestion(ctx.env.DB, ctx.user!.id, ctx.params.id, body, ctx.ipHash ?? null);
    return jsonOk(updated);
  }, { auth: true, admin: true });

  router.delete('/api/v1/admin/questions/:id', async (ctx) => {
    await adminDeleteQuestion(ctx.env.DB, ctx.user!.id, ctx.params.id, ctx.ipHash ?? null);
    return jsonOk({ id: ctx.params.id, deleted: true });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/questions/import', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 6 * 1024 * 1024));
    const result = await importQuestions(
      ctx.env.DB,
      ctx.user!.id,
      {
        format: String(body.format ?? 'json'),
        content: typeof body.content === 'string' ? body.content : '',
        mode: typeof body.mode === 'string' ? body.mode : 'preview',
        duplicateStrategy: typeof body.duplicateStrategy === 'string' ? body.duplicateStrategy : 'skip',
        defaultStatus: typeof body.defaultStatus === 'string' ? body.defaultStatus : 'draft',
      },
      ctx.ipHash ?? null,
    );
    return jsonOk(result);
  }, { auth: true, admin: true, rateLimit: { key: 'admin-import', limit: 10, windowSeconds: 60 } });

  router.post('/api/v1/admin/questions/bulk-category', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 100_000));
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (!subject || !category) throw ApiError.badRequest('请填写科目与分类');
    const result = await adminBulkCategory(ctx.env.DB, ctx.user!.id, { ids, subject, category }, ctx.ipHash ?? null);
    return jsonOk(result);
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/questions/:id/publish', async (ctx) => {
    await adminSetQuestionStatus(ctx.env.DB, ctx.user!.id, ctx.params.id, 'published' as QuestionStatus, ctx.ipHash ?? null);
    return jsonOk({ id: ctx.params.id, status: 'published' });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/questions/:id/archive', async (ctx) => {
    await adminSetQuestionStatus(ctx.env.DB, ctx.user!.id, ctx.params.id, 'archived' as QuestionStatus, ctx.ipHash ?? null);
    return jsonOk({ id: ctx.params.id, status: 'archived' });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/categories', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 10_000));
    await createCategory(
      ctx.env.DB,
      ctx.user!.id,
      {
        name: typeof body.name === 'string' ? body.name : '',
        subject: typeof body.subject === 'string' ? body.subject : '',
        description: typeof body.description === 'string' ? body.description : undefined,
        sortOrder: Number(body.sortOrder) || 0,
      },
      ctx.ipHash ?? null,
    );
    return jsonOk({ created: true }, {}, 201);
  }, { auth: true, admin: true });

  router.delete('/api/v1/admin/categories/:id', async (ctx) => {
    await deleteCategory(ctx.env.DB, ctx.user!.id, ctx.params.id, ctx.ipHash ?? null);
    return jsonOk({ id: ctx.params.id, deleted: true });
  }, { auth: true, admin: true });
}
