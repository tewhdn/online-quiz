import { ApiError } from './errors.ts';

export interface CsvParseResult {
  rows: string[][];
  errors: string[];
}

/**
 * 轻量 CSV 解析器：支持双引号包裹、引号转义（""）、字段内换行、CRLF、UTF-8 BOM。
 * 不依赖第三方库，行为可预测。
 */
export function parseCsv(input: string): CsvParseResult {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.length > 0) {
        errors.push(`第 ${line} 行：引号必须出现在字段开头`);
      }
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\r') continue;
    if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      line += 1;
      rowStartLine = line;
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    errors.push(`从第 ${rowStartLine} 行开始存在未闭合的引号`);
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 丢弃完全空白的行
  const cleaned = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  return { rows: cleaned, errors };
}

export function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

export function assertCsvSize(input: string, maxBytes = 5_000_000): void {
  if (new TextEncoder().encode(input).byteLength > maxBytes) {
    throw ApiError.payloadTooLarge('CSV 文件过大，请分批导入');
  }
}
