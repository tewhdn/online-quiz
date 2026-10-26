/**
 * 结构化日志：仅记录事件、请求 ID、状态等非敏感信息。
 * 明确不记录密码、Cookie、Authorization、API Key、完整请求体。
 */
const SENSITIVE_KEYS = /pass(word)?|token|secret|api[_-]?key|authorization|cookie/i;

export interface LogFields {
  [key: string]: unknown;
}

export function sanitizeFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEYS.test(key)) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > 300) {
      out[key] = `${value.slice(0, 300)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function logInfo(event: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ level: 'info', event, ...sanitizeFields(fields) }));
}

export function logWarn(event: string, fields: LogFields = {}): void {
  console.warn(JSON.stringify({ level: 'warn', event, ...sanitizeFields(fields) }));
}

export function logError(event: string, error: unknown, fields: LogFields = {}): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(JSON.stringify({ level: 'error', event, error: message, ...sanitizeFields(fields) }));
}
