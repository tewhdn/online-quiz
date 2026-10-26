import type { Router } from '../../router.ts';
import { jsonOk, paginationMeta } from '../../utils/response.ts';
import { readJsonBody } from '../../utils/http.ts';
import { readPagination, asRecord } from '../../validators/common.ts';
import { loadConfig } from '../../utils/config.ts';
import { adminDashboard } from '../../services/stats-service.ts';
import { getSetting, listAuditLogs, setSetting, writeAudit } from '../../repositories/content-repo.ts';
import { updateAiSettings } from '../../services/ai-service.ts';
import { newId } from '../../utils/id.ts';
import { nowMs } from '../../utils/time.ts';

export function registerAdminSystemRoutes(router: Router): void {
  router.get('/api/v1/admin/dashboard', async (ctx) => {
    const config = loadConfig(ctx.env);
    return jsonOk(await adminDashboard(ctx.env.DB, config));
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/logs', async (ctx) => {
    const pagination = readPagination(ctx.url, 30, 100);
    const result = await listAuditLogs(ctx.env.DB, {
      action: ctx.url.searchParams.get('action') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/settings', async (ctx) => {
    const config = loadConfig(ctx.env);
    const [siteName, aiEnabled, dailyLimit, maxQuestions] = await Promise.all([
      getSetting(ctx.env.DB, 'site_name'),
      getSetting(ctx.env.DB, 'ai_enabled'),
      getSetting(ctx.env.DB, 'ai_daily_task_limit'),
      getSetting(ctx.env.DB, 'ai_max_questions_per_request'),
    ]);
    return jsonOk({
      siteName: siteName ?? '智能答题系统',
      aiEnabled: aiEnabled === 'true',
      aiDailyTaskLimit: Number(dailyLimit) || config.aiDailyLimit,
      aiMaxQuestions: Number(maxQuestions) || config.aiMaxQuestions,
      model: config.deepseekModel,
      environment: config.environment,
      deepseekConfigured: Boolean(config.deepseekApiKey),
      r2Enabled: Boolean(ctx.env.R2),
    });
  }, { auth: true, admin: true });

  router.put('/api/v1/admin/settings', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 10_000));
    const now = nowMs();
    if (typeof body.siteName === 'string' && body.siteName.trim()) {
      await setSetting(ctx.env.DB, 'site_name', body.siteName.trim().slice(0, 40), now);
    }
    if (typeof body.aiEnabled === 'boolean' || body.aiDailyTaskLimit !== undefined || body.aiMaxQuestions !== undefined) {
      await updateAiSettings(
        ctx.env.DB,
        ctx.user!.id,
        {
          enabled: typeof body.aiEnabled === 'boolean' ? body.aiEnabled : undefined,
          dailyLimit: body.aiDailyTaskLimit === undefined ? undefined : Number(body.aiDailyTaskLimit),
          maxQuestions: body.aiMaxQuestions === undefined ? undefined : Number(body.aiMaxQuestions),
        },
        ctx.ipHash ?? null,
      );
    }
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'settings.update',
      targetType: 'settings',
      detail: { siteName: body.siteName ?? null },
      ipHash: ctx.ipHash ?? null,
      now,
    });
    return jsonOk({ updated: true });
  }, { auth: true, admin: true });
}
