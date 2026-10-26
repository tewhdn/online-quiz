import type { Router } from '../../router.ts';
import { ApiError } from '../../utils/errors.ts';
import { jsonOk, paginationMeta } from '../../utils/response.ts';
import { readJsonBody } from '../../utils/http.ts';
import { readPagination, asRecord } from '../../validators/common.ts';
import { loadConfig } from '../../utils/config.ts';
import {
  aiDashboard,
  approveReviewQuestion,
  batchReview,
  deleteSource,
  generateQuestions,
  getAiRuntimeConfig,
  regenerateReviewQuestion,
  rejectReviewQuestion,
  updateAiSettings,
  updateReviewPayload,
  uploadSource,
} from '../../services/ai-service.ts';
import {
  findAiSource,
  findAiTask,
  listAiSources,
  listAiTasks,
  listReviewQuestions,
} from '../../repositories/ai-repo.ts';

export function registerAdminAiRoutes(router: Router): void {
  router.get('/api/v1/admin/ai/settings', async (ctx) => {
    const config = loadConfig(ctx.env);
    const runtime = await getAiRuntimeConfig(ctx.env.DB, config);
    return jsonOk({ ...runtime, model: config.deepseekModel, apiKeyConfigured: Boolean(config.deepseekApiKey) });
  }, { auth: true, admin: true });

  router.put('/api/v1/admin/ai/settings', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 5_000));
    const result = await updateAiSettings(
      ctx.env.DB,
      ctx.user!.id,
      {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        dailyLimit: body.dailyLimit === undefined ? undefined : Number(body.dailyLimit),
        maxQuestions: body.maxQuestions === undefined ? undefined : Number(body.maxQuestions),
      },
      ctx.ipHash ?? null,
    );
    return jsonOk(result);
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/ai/usage', async (ctx) => {
    const config = loadConfig(ctx.env);
    return jsonOk(await aiDashboard(ctx.env.DB, config));
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/ai/generate', async (ctx) => {
    const config = loadConfig(ctx.env);
    const body = await readJsonBody<unknown>(ctx.req, 200_000);
    const result = await generateQuestions(ctx.env.DB, config, ctx.user!, body, ctx.ipHash ?? null);
    // 任务已创建并记录失败原因，返回 200 便于前端展示诊断信息
    return jsonOk(result, {}, result.status === 'failed' ? 200 : 201);
  }, { auth: true, admin: true, rateLimit: { key: 'ai-generate', limit: 5, windowSeconds: 60 } });

  router.get('/api/v1/admin/ai/tasks', async (ctx) => {
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listAiTasks(ctx.env.DB, {
      status: ctx.url.searchParams.get('status') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/ai/tasks/:id', async (ctx) => {
    const task = await findAiTask(ctx.env.DB, ctx.params.id);
    if (!task) throw ApiError.notFound('任务不存在');
    const reviews = await listReviewQuestions(ctx.env.DB, {
      taskId: task.id,
      offset: 0,
      pageSize: 100,
    });
    return jsonOk({ task, reviewQuestions: reviews.items });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/ai/review-questions', async (ctx) => {
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listReviewQuestions(ctx.env.DB, {
      status: ctx.url.searchParams.get('status') ?? 'pending',
      taskId: ctx.url.searchParams.get('taskId') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true, admin: true });

  router.put('/api/v1/admin/ai/review-questions/:id', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 100_000));
    const result = await updateReviewPayload(ctx.env.DB, ctx.user!, ctx.params.id, body, ctx.ipHash ?? null);
    return jsonOk(result);
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/ai/review-questions/batch', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 50_000));
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const action = body.action === 'reject' ? 'reject' : 'approve';
    const result = await batchReview(
      ctx.env.DB,
      ctx.user!,
      { ids, action, reason: typeof body.reason === 'string' ? body.reason : undefined },
      ctx.ipHash ?? null,
    );
    return jsonOk(result);
  }, { auth: true, admin: true, rateLimit: { key: 'ai-batch-review', limit: 30, windowSeconds: 60 } });

  router.post('/api/v1/admin/ai/review-questions/:id/approve', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 100_000));
    const overrides = Object.keys(body).length > 0 ? body : undefined;
    const result = await approveReviewQuestion(ctx.env.DB, ctx.user!, ctx.params.id, ctx.ipHash ?? null, overrides);
    return jsonOk(result);
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/ai/review-questions/:id/reject', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 5_000));
    const reason = typeof body.reason === 'string' ? body.reason : '';
    await rejectReviewQuestion(ctx.env.DB, ctx.user!, ctx.params.id, reason, ctx.ipHash ?? null);
    return jsonOk({ id: ctx.params.id, status: 'rejected' });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/ai/review-questions/:id/regenerate', async (ctx) => {
    const config = loadConfig(ctx.env);
    const result = await regenerateReviewQuestion(ctx.env.DB, config, ctx.user!, ctx.params.id, ctx.ipHash ?? null);
    return jsonOk(result);
  }, { auth: true, admin: true, rateLimit: { key: 'ai-regenerate', limit: 10, windowSeconds: 60 } });

  router.get('/api/v1/admin/ai/sources', async (ctx) => {
    const sources = await listAiSources(ctx.env.DB, 50);
    return jsonOk(sources);
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/ai/sources', async (ctx) => {
    const config = loadConfig(ctx.env);
    const contentType = ctx.req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) throw ApiError.badRequest('请使用 multipart/form-data 上传文件');
    const declared = Number(ctx.req.headers.get('content-length') ?? 0);
    if (declared > config.uploadMaxBytes + 2 * 1024 * 1024) {
      throw ApiError.payloadTooLarge(`文件不能超过 ${Math.floor(config.uploadMaxBytes / 1024 / 1024)} MB`);
    }
    let form: FormData;
    try {
      form = await ctx.req.formData();
    } catch {
      throw ApiError.badRequest('文件上传解析失败');
    }
    const file = form.get('file');
    if (!(file instanceof File)) throw ApiError.badRequest('请选择要上传的文件');
    if (file.size > config.uploadMaxBytes) {
      throw ApiError.payloadTooLarge(`文件不能超过 ${Math.floor(config.uploadMaxBytes / 1024 / 1024)} MB`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadSource(ctx.env.DB, { R2: ctx.env.R2 }, config, ctx.user!, {
      name: file.name,
      mime: file.type,
      bytes,
    });
    return jsonOk(result, {}, 201);
  }, { auth: true, admin: true, rateLimit: { key: 'ai-upload', limit: 10, windowSeconds: 60 } });

  router.get('/api/v1/admin/ai/sources/:id', async (ctx) => {
    const source = await findAiSource(ctx.env.DB, ctx.params.id);
    if (!source) throw ApiError.notFound('资料不存在');
    return jsonOk({ ...source, textContent: source.textContent?.slice(0, 3000), previewOnly: true });
  }, { auth: true, admin: true });

  router.delete('/api/v1/admin/ai/sources/:id', async (ctx) => {
    await deleteSource(ctx.env.DB, { R2: ctx.env.R2 }, ctx.user!, ctx.params.id, ctx.ipHash ?? null);
    return jsonOk({ id: ctx.params.id, deleted: true });
  }, { auth: true, admin: true });
}
