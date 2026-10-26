/** 宽松但安全的 JSON 辅助函数：数据库中的 JSON 字段解析失败时回退，不抛出。 */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function parseStringArray(value: unknown): string[] {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** 限制长度并按需要截断，用于日志与详情字段。 */
export function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
