import { ApiError } from './errors.ts';

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function jsonOk(data: unknown, extra: Record<string, unknown> = {}, status = 200, headers?: Headers): Response {
  const payload = JSON.stringify({ ok: true, data, ...extra });
  const response = new Response(payload, { status, headers: headers ?? new Headers() });
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(key) || key === 'Content-Type') response.headers.set(key, value);
  }
  return response;
}

export function jsonError(error: ApiError, requestId: string): Response {
  const body = {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    requestId,
  };
  const response = new Response(JSON.stringify(body), { status: error.status, headers: new Headers() });
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
  if (error.status === 429 && error.details && typeof error.details === 'object') {
    const retry = (error.details as { retryAfterSeconds?: number }).retryAfterSeconds;
    if (retry) response.headers.set('Retry-After', String(retry));
  }
  return response;
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function fileResponse(content: string, filename: string, contentType: string): Response {
  const headers = new Headers();
  headers.set('Content-Type', `${contentType}; charset=utf-8`);
  headers.set('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(content, { status: 200, headers });
}
