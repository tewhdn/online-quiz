import { ApiError } from '../utils/errors.ts';
import { constantTimeStringEqual } from '../utils/crypto.ts';
import { assertSameOrigin, isMutating, parseCookies, SESSION_COOKIE } from '../utils/http.ts';
import { resolveSession } from '../services/auth-service.ts';
import type { AppConfig } from '../utils/config.ts';
import type { AuthUser, RouteOptions, SessionInfo } from '../types/env.ts';

const PASSWORD_CHANGE_ALLOWED = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/change-password',
  '/api/v1/meta',
]);

/**
 * 解析会话。Cookie 中的令牌只用于计算哈希查询，不落库、不记日志。
 */
export async function loadSession(
  db: D1Database,
  request: Request,
): Promise<{ user: AuthUser; session: SessionInfo } | null> {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const resolved = await resolveSession(db, token);
  if (!resolved) return null;
  return {
    user: resolved.user,
    session: {
      tokenHash: resolved.session.tokenHash,
      userId: resolved.user.id,
      csrfToken: resolved.session.csrfToken,
      expiresAt: 0,
    },
  };
}

export function enforceRouteAuth(
  request: Request,
  url: URL,
  options: RouteOptions,
  user: AuthUser | null,
): void {
  if (!options.auth) return;
  if (!user) throw ApiError.unauthorized();

  if (user.mustChangePassword && !options.allowPasswordChangePending && !PASSWORD_CHANGE_ALLOWED.has(url.pathname)) {
    throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', '首次登录或密码被重置后必须先修改密码');
  }
  if (isMutating(request.method)) {
    if (url.pathname.startsWith('/api/v1/')) assertSameOrigin(request, url);
  }
  if (options.admin && user.role !== 'admin') {
    throw ApiError.forbidden('需要管理员权限');
  }
}

/**
 * CSRF：会话绑定的令牌放在 X-CSRF-Token 请求头中。
 * 会话令牌本身在 HttpOnly Cookie 中，JavaScript 无法读取，因此跨站脚本无法伪造完整请求。
 */
export function enforceCsrf(request: Request, options: RouteOptions, user: AuthUser | null, session: SessionInfo | null): void {
  if (!user) return;
  if (!isMutating(request.method)) return;
  if (options.csrf === false) return;
  const header = request.headers.get('x-csrf-token');
  if (!header || !session || !constantTimeStringEqual(header, session.csrfToken)) {
    throw new ApiError(403, 'CSRF_FAILED', 'CSRF 校验失败，请刷新页面后重试');
  }
}

export function sessionCookieValue(
  config: AppConfig,
  url: URL,
  token: string,
  expiresAt: number,
): string {
  const secure = config.cookieSecure || url.protocol === 'https:';
  return buildCookie(token, expiresAt, secure);
}

function buildCookie(token: string, expiresAt: number, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearSessionCookie(config: AppConfig, url: URL): string {
  const secure = config.cookieSecure || url.protocol === 'https:';
  return [`${SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Strict', secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}
