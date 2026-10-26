/** 统一使用 Unix 毫秒。 */
export function nowMs(): number {
  return Date.now();
}

export function tzOffsetMinutes(envValue?: string): number {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 840 ? parsed : 480;
}

/** 按指定时区偏移计算"当天 00:00"的时间戳。 */
export function startOfDay(ts: number, offsetMinutes: number): number {
  const shifted = ts + offsetMinutes * 60_000;
  return shifted - (shifted % 86_400_000) - offsetMinutes * 60_000;
}

export function addHours(ts: number, hours: number): number {
  return ts + hours * 3_600_000;
}

export function addDays(ts: number, days: number): number {
  return ts + days * 86_400_000;
}

export function secondsBetween(start: number, end: number): number {
  return Math.max(0, Math.round((end - start) / 1000));
}

/** 格式化为 yyyy-MM-dd HH:mm（用于导出、日志展示，时区固定为 Asia/Shanghai）。 */
export function formatDateTime(ts: number, offsetMinutes = 480): string {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatDate(ts: number, offsetMinutes = 480): string {
  return formatDateTime(ts, offsetMinutes).slice(0, 10);
}
