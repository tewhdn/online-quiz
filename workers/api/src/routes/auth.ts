import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { loadConfig } from '../utils/config.ts';
import { jsonOk } from '../utils/response.ts';
import { readJsonBody, hashIp, getClientIp } from '../utils/http.ts';
import { sha256Hex } from '../utils/id.ts';
import { clearSessionCookie, sessionCookieValue } from '../middleware/auth.ts';
import {
  bootstrapAdmin,
  changePassword,
  loginUser,
  logoutUser,
  registerUser,
} from '../services/auth-service.ts';
import { enforceRateLimit } from '../middleware/rate-limit.ts';
import { getSetting } from '../repositories/content-repo.ts';
import type { RequestContext } from '../types/env.ts';

export function registerAuthRoutes(router: Router): void {
  router.get('/api/v1/meta', async (ctx) => {
    const siteName = (await getSetting(ctx.env.DB, 'site_name')) ?? ctx.env.APP_NAME ?? '智能答题系统';
    const aiEnabled = (await getSetting(ctx.env.DB, 'ai_enabled')) === 'true';
    return jsonOk({ siteName, aiEnabled, version: '1.0.0' });
  });

  router.post(
    '/api/v1/auth/register',
    async (ctx) => {
      const config = loadConfig(ctx.env);
      const body = await readJsonBody<Record<string, unknown>>(ctx.req, 20_000);
      const result = await registerUser(ctx.env.DB, config, body, {
        ipHash: ctx.ipHash ?? null,
        userAgent: ctx.req.headers.get('user-agent'),
      });
      const response = jsonOk({
        user: result.user,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      });
      response.headers.append('Set-Cookie', sessionCookieValue(config, ctx.url, result.token, result.expiresAt));
      return response;
    },
    { rateLimit: { key: 'register', limit: 5, windowSeconds: 600 } },
  );

  router.post(
    '/api/v1/auth/login',
    async (ctx) => {
      const config = loadConfig(ctx.env);
      const body = await readJsonBody<Record<string, unknown>>(ctx.req, 10_000);
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (username) {
        const accountKey = await sha256Hex(`account:${username}`);
        await enforceRateLimit(ctx.env, 'login-account', 8, 300, accountKey);
      }
      const result = await loginUser(ctx.env.DB, config, body, {
        ipHash: ctx.ipHash ?? null,
        userAgent: ctx.req.headers.get('user-agent'),
      });
      const response = jsonOk({
        user: result.user,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      });
      response.headers.append('Set-Cookie', sessionCookieValue(config, ctx.url, result.token, result.expiresAt));
      return response;
    },
    { rateLimit: { key: 'login', limit: 10, windowSeconds: 300 } },
  );

  router.post(
    '/api/v1/auth/logout',
    async (ctx) => {
      const config = loadConfig(ctx.env);
      if (ctx.session) await logoutUser(ctx.env.DB, ctx.session.tokenHash);
      const response = jsonOk({ loggedOut: true });
      response.headers.append('Set-Cookie', clearSessionCookie(config, ctx.url));
      return response;
    },
    { auth: true, allowPasswordChangePending: true },
  );

  router.get(
    '/api/v1/auth/me',
    async (ctx) => {
      const siteName = (await getSetting(ctx.env.DB, 'site_name')) ?? '智能答题系统';
      return jsonOk({
        user: ctx.user,
        csrfToken: ctx.session?.csrfToken,
        siteName,
      });
    },
    { auth: true, allowPasswordChangePending: true },
  );

  router.post(
    '/api/v1/auth/change-password',
    async (ctx) => {
      const config = loadConfig(ctx.env);
      const body = await readJsonBody<Record<string, unknown>>(ctx.req, 10_000);
      if (!ctx.user) throw ApiError.unauthorized();
      const result = await changePassword(ctx.env.DB, config, ctx.user, ctx.session?.tokenHash ?? '', body, {
        ipHash: ctx.ipHash ?? null,
        userAgent: ctx.req.headers.get('user-agent'),
      });
      const response = jsonOk({
        user: result.user,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      });
      response.headers.append('Set-Cookie', sessionCookieValue(config, ctx.url, result.token, result.expiresAt));
      return response;
    },
    { auth: true, allowPasswordChangePending: true, rateLimit: { key: 'change-password', limit: 5, windowSeconds: 300 } },
  );

  router.post(
    '/api/v1/admin/bootstrap',
    async (ctx) => {
      const config = loadConfig(ctx.env);
      const body = await readJsonBody<Record<string, unknown>>(ctx.req, 10_000);
      await bootstrapAdmin(ctx.env.DB, config, {
        username: body.username,
        password: body.password,
        setupToken: (ctx.req.headers.get('x-setup-token') ?? (typeof body.setupToken === 'string' ? body.setupToken : null)) || null,
      });
      return jsonOk({ created: true });
    },
    { rateLimit: { key: 'bootstrap', limit: 5, windowSeconds: 3600 } },
  );
}

export function requestIpLabel(ctx: RequestContext): string {
  return getClientIp(ctx.req);
}

export async function ipHashOf(ctx: RequestContext): Promise<string> {
  return hashIp(getClientIp(ctx.req));
}
