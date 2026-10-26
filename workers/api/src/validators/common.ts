import { ApiError } from '../utils/errors.ts';

export interface ValidationIssue {
  field: string;
  message: string;
}

export class ValidationCollector {
  readonly issues: ValidationIssue[] = [];

  add(field: string, message: string): void {
    this.issues.push({ field, message });
  }

  throwIfAny(message = '请求参数校验失败'): void {
    if (this.issues.length > 0) {
      throw ApiError.badRequest(message, this.issues);
    }
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function readString(
  source: Record<string, unknown>,
  key: string,
  options: { required?: boolean; min?: number; max?: number; trim?: boolean; label?: string; pattern?: RegExp } = {},
): string {
  const raw = source[key];
  const label = options.label ?? key;
  if (raw === undefined || raw === null) {
    if (options.required) throw ApiError.badRequest(`${label}不能为空`);
    return '';
  }
  if (typeof raw !== 'string') throw ApiError.badRequest(`${label}必须是字符串`);
  const value = options.trim === false ? raw : raw.trim();
  if (options.required && value.length === 0) throw ApiError.badRequest(`${label}不能为空`);
  if (options.min !== undefined && value.length > 0 && value.length < options.min) {
    throw ApiError.badRequest(`${label}长度不能少于 ${options.min} 个字符`);
  }
  if (options.max !== undefined && value.length > options.max) {
    throw ApiError.badRequest(`${label}长度不能超过 ${options.max} 个字符`);
  }
  if (options.pattern && value.length > 0 && !options.pattern.test(value)) {
    throw ApiError.badRequest(`${label}格式不正确`);
  }
  return value;
}

export function readInt(
  source: Record<string, unknown>,
  key: string,
  options: { required?: boolean; min?: number; max?: number; fallback?: number; label?: string } = {},
): number {
  const raw = source[key];
  const label = options.label ?? key;
  if (raw === undefined || raw === null || raw === '') {
    if (options.fallback !== undefined) return options.fallback;
    if (options.required) throw ApiError.badRequest(`${label}不能为空`);
    return 0;
  }
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw ApiError.badRequest(`${label}必须是整数`);
  }
  if (options.min !== undefined && value < options.min) throw ApiError.badRequest(`${label}不能小于 ${options.min}`);
  if (options.max !== undefined && value > options.max) throw ApiError.badRequest(`${label}不能大于 ${options.max}`);
  return value;
}

export function readBoolean(
  source: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const raw = source[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  if (raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === 0 || raw === '0' || raw === 'false') return false;
  throw ApiError.badRequest(`${key} 必须是布尔值`);
}

export function readStringArray(
  source: Record<string, unknown>,
  keys: string[],
  options: { maxItems?: number; maxLength?: number; label?: string } = {},
): string[] {
  const label = options.label ?? keys[0];
  let raw: unknown;
  for (const key of keys) {
    if (source[key] !== undefined) {
      raw = source[key];
      break;
    }
  }
  if (raw === undefined || raw === null || raw === '') return [];
  let list: unknown[];
  if (typeof raw === 'string') {
    list = raw.split(/[,，;；|]/).map((item) => item.trim()).filter(Boolean);
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    throw ApiError.badRequest(`${label} 必须是数组`);
  }
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') throw ApiError.badRequest(`${label} 的元素必须是字符串`);
    const value = item.trim();
    if (!value) continue;
    if (options.maxLength !== undefined && value.length > options.maxLength) {
      throw ApiError.badRequest(`${label} 的单个元素不能超过 ${options.maxLength} 个字符`);
    }
    if (!out.includes(value)) out.push(value);
  }
  if (options.maxItems !== undefined && out.length > options.maxItems) {
    throw ApiError.badRequest(`${label} 最多 ${options.maxItems} 项`);
  }
  return out;
}

export function readEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  options: { required?: boolean; fallback?: T; label?: string } = {},
): T {
  const raw = source[key];
  const label = options.label ?? key;
  if (raw === undefined || raw === null || raw === '') {
    if (options.fallback !== undefined) return options.fallback;
    if (options.required) throw ApiError.badRequest(`${label}不能为空`);
    throw ApiError.badRequest(`${label}不能为空`);
  }
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    throw ApiError.badRequest(`${label} 必须是以下之一：${allowed.join(', ')}`);
  }
  return raw as T;
}

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function readPagination(url: URL, defaultSize = 20, maxSize = 100): Pagination {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const sizeRaw = Number(url.searchParams.get('pageSize'));
  const pageSize = Math.min(maxSize, Math.max(1, Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function requireId(value: string | undefined, label = 'ID'): string {
  if (!value || !/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
    throw ApiError.badRequest(`${label} 格式不正确`);
  }
  return value;
}
