import type { Pagination } from '../types';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ApiResult<T> {
  data: T;
  pagination?: Pagination;
}

export type QueryValue = string | number | boolean | null | undefined;

let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  formData?: FormData;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) };
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (csrfToken && method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}${buildQuery(options.query)}`, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError('网络连接失败，请检查网络后重试', 'NETWORK_ERROR', 0);
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  const envelope = payload as
    | { ok: true; data: T; pagination?: Pagination }
    | { ok: false; error?: { code?: string; message?: string; details?: unknown } }
    | null;

  if (!response.ok || !envelope || envelope.ok === false) {
    const error = envelope && envelope.ok === false ? envelope.error : undefined;
    if (response.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw new ApiClientError(
      error?.message || `请求失败（HTTP ${response.status}）`,
      error?.code || 'HTTP_ERROR',
      response.status,
      error?.details,
    );
  }

  if (envelope.data && typeof envelope.data === 'object' && 'csrfToken' in envelope.data) {
    const token = (envelope.data as { csrfToken?: unknown }).csrfToken;
    if (typeof token === 'string' && token) setCsrfToken(token);
  }

  return { data: envelope.data, pagination: envelope.pagination };
}

/** 下载接口（CSV 导出等），带 Cookie 与 CSRF。 */
export async function download(path: string, query?: Record<string, QueryValue>): Promise<Blob> {
  const response = await fetch(`/api/v1${path}${buildQuery(query)}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'text/csv, application/json' },
  });
  if (!response.ok) {
    let message = `下载失败（HTTP ${response.status}）`;
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      if (payload?.error?.message) message = payload.error.message;
    } catch {
      // ignore
    }
    throw new ApiClientError(message, 'DOWNLOAD_FAILED', response.status);
  }
  return response.blob();
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
