import { ApiError } from './errors.ts';
import { sha256Hex } from './id.ts';

export const SESSION_COOKIE = 'oq_session';

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  expiresAt?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
}

export function buildCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAgeSeconds)}`);
  if (options.expiresAt !== undefined) parts.push(`Expires=${new Date(options.expiresAt).toUTCString()}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite ?? 'Strict'}`);
  return parts.join('; ');
}

export function clearCookie(name: string, secure = false): string {
  return buildCookie(name, '', { maxAgeSeconds: 0, expiresAt: 0, secure, httpOnly: true });
}

/**
 * 请求体大小限制：先看 Content-Length，再实际读取后复核，
 * 防止超大 JSON 占用 Worker 内存。
 */
export async function readJsonBody<T>(req: Request, maxBytes = 1_000_000): Promise<T> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) {
    throw ApiError.payloadTooLarge(`请求体超过 ${Math.floor(maxBytes / 1024)} KB 限制`);
  }
  const buffer = await req.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw ApiError.payloadTooLarge(`请求体超过 ${Math.floor(maxBytes / 1024)} KB 限制`);
  }
  if (buffer.byteLength === 0) return {} as T;
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as T;
  } catch {
    throw ApiError.badRequest('请求体不是合法的 JSON');
  }
}

export function getClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return 'unknown';
}

/** 只保存 IP 的截断哈希，避免明文留存个人网络信息。 */
export async function hashIp(ip: string): Promise<string> {
  return (await sha256Hex(`ip:${ip}`)).slice(0, 24);
}

export function isMutating(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/**
 * CSRF 防护（服务端会话 + 会话绑定令牌 + 同源校验）：
 * 1. 会话令牌只在 HttpOnly Cookie 中，前端拿不到；
 * 2. 写操作必须携带 X-CSRF-Token，且与会话中的 csrfToken 一致；
 * 3. 浏览器跨站请求会带 Origin / Sec-Fetch-Site，直接拒绝。
 */
export function assertSameOrigin(req: Request, url: URL): void {
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin) {
    throw ApiError.forbidden('跨站请求被拒绝');
  }
  const site = req.headers.get('sec-fetch-site');
  if (site === 'cross-site') {
    throw ApiError.forbidden('跨站请求被拒绝');
  }
}

export function clientAcceptsJson(req: Request): boolean {
  return (req.headers.get('accept') ?? '').includes('application/json');
}
