import { Router } from './router.ts';
import { loadConfig } from './utils/config.ts';
import { ApiError, toApiError } from './utils/errors.ts';
import { jsonError, jsonOk } from './utils/response.ts';
import { loadSession, enforceRouteAuth, enforceCsrf } from './middleware/auth.ts';
import { enforceRateLimit } from './middleware/rate-limit.ts';
import { assertSameOrigin, getClientIp, hashIp } from './utils/http.ts';
import { newId } from './utils/id.ts';
import { logError, logInfo } from './utils/logger.ts';
import { pruneRateLimits } from './repositories/content-repo.ts';
import { deleteExpiredSessions } from './repositories/user-repo.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerUserRoutes } from './routes/users.ts';
import { registerQuestionRoutes } from './routes/questions.ts';
import { registerPracticeRoutes } from './routes/practice.ts';
import { registerMistakeRoutes } from './routes/mistakes.ts';
import { registerFavoriteRoutes } from './routes/favorites.ts';
import { registerExamRoutes } from './routes/exams.ts';
import { registerAnnouncementRoutes } from './routes/announcements.ts';
import { registerAdminRoutes } from './routes/admin/index.ts';
import { registerAiExplainRoutes } from './routes/ai-explain.ts';
import type { Env, RequestContext } from './types/env.ts';

export const VERSION = '1.0.0';

const router = new Router();
router.get('/api/v1/health', async (ctx) => {
  let dbOk = false;
  let dbError: string | null = null;
  try {
    const row = await ctx.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    dbOk = row?.ok === 1;
  } catch (error) {
    dbError = error instanceof Error ? error.message.slice(0, 120) : 'unknown';
  }
  return jsonOk(
    {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'error',
      ...(dbError && (ctx.env.ENVIRONMENT ?? 'development') !== 'production' ? { dbError } : {}),
      version: VERSION,
      time: Date.now(),
      environment: ctx.env.ENVIRONMENT ?? 'development',
    },
    {},
    dbOk ? 200 : 503,
  );
});
registerAuthRoutes(router);
registerUserRoutes(router);
registerQuestionRoutes(router);
registerPracticeRoutes(router);
registerMistakeRoutes(router);
registerFavoriteRoutes(router);
registerExamRoutes(router);
registerAnnouncementRoutes(router);
registerAdminRoutes(router);
registerAiExplainRoutes(router);

async function handleApi(request: Request, env: Env, url: URL, execCtx: ExecutionContext): Promise<Response> {
  const requestId = newId('req');
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, X-Setup-Token',
          'Access-Control-Max-Age': '600',
        },
      });
    }

    const matched = router.match(request.method, url.pathname);
    if (!matched) {
      const allowed = router.methodsFor(url.pathname);
      if (allowed.length > 0) {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', '请求方法不被允许', { allowed });
      }
      throw ApiError.notFound('接口不存在');
    }

    const ip = getClientIp(request);
    const ipHash = await hashIp(ip);
    const config = loadConfig(env);

    // 所有写请求（含登录、注册）都校验同源，降低跨站请求伪造风险
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      assertSameOrigin(request, url);
    }

    let user = null;
    let session = null;
    if (matched.options.auth) {
      const resolved = await loadSession(env.DB, request);
      user = resolved?.user ?? null;
      session = resolved?.session ?? null;
    }

    enforceRouteAuth(request, url, matched.options, user);
    enforceCsrf(request, matched.options, user, session);

    if (matched.options.rateLimit) {
      const identity = user ? `u:${user.id}` : `ip:${ipHash}`;
      await enforceRateLimit(
        env,
        matched.options.rateLimit.key,
        matched.options.rateLimit.limit,
        matched.options.rateLimit.windowSeconds,
        identity,
      );
    }

    const ctx: RequestContext = {
      req: request,
      env,
      url,
      params: matched.params,
      requestId,
      user: user ?? undefined,
      session: session ?? undefined,
      ipHash,
      userAgent: request.headers.get('user-agent') ?? undefined,
      execCtx,
    };

    const response = await matched.handler(ctx);
    response.headers.set('X-Request-Id', requestId);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    if (config.isProduction) response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // 抽样清理过期限流记录（约 1% 请求）：不阻塞响应
    if (Math.random() < 0.01) {
      execCtx.waitUntil(
        Promise.all([pruneRateLimits(env.DB, Date.now()), deleteExpiredSessions(env.DB, Date.now())]).catch(() => {
          // 清理失败不影响主流程
        }),
      );
    }
    return response;
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status >= 500) {
      logError('api_unhandled', error, { requestId, path: url.pathname, method: request.method });
    } else if (apiError.status === 429) {
      logInfo('api_rate_limited', { requestId, path: url.pathname });
    }
    return jsonError(apiError, requestId);
  }
}

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url, execCtx);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
} satisfies ExportedHandler<Env>;
