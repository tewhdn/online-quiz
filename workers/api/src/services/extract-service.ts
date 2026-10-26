import { ApiError } from '../utils/errors.ts';

export type SourceKind = 'txt' | 'pdf' | 'docx';

export interface ExtractResult {
  kind: SourceKind;
  text: string;
  charCount: number;
  truncated: boolean;
  warnings: string[];
  pages?: number;
  likelyScanned?: boolean;
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function detectKind(name: string, mime: string): SourceKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (lower.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (lower.endsWith('.txt') || mime === 'text/plain' || mime === 'text/markdown') return 'txt';
  throw ApiError.badRequest('仅支持 TXT、PDF、DOCX 文件');
}

export async function extractText(
  file: { name: string; mime: string; bytes: Uint8Array },
  maxChars: number,
): Promise<ExtractResult> {
  const kind = detectKind(file.name, file.mime);
  let result: ExtractResult;
  if (kind === 'txt') result = extractTxt(file.bytes);
  else if (kind === 'pdf') result = await extractPdf(file.bytes);
  else result = await extractDocx(file.bytes);

  result.text = cleanupText(result.text);
  if (result.text.length > maxChars) {
    result.text = result.text.slice(0, maxChars);
    result.truncated = true;
    result.warnings.push(`正文超过 ${maxChars} 字符上限，已截断；建议分章节上传。`);
  }
  result.charCount = result.text.length;
  return result;
}

function cleanupText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// TXT
// ---------------------------------------------------------------------------

function extractTxt(bytes: Uint8Array): ExtractResult {
  const warnings: string[] = [];
  let text = '';
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = new TextDecoder('utf-8').decode(bytes.subarray(3));
  } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    } catch {
      let decoded = false;
      try {
        text = new TextDecoder('gbk').decode(bytes);
        decoded = true;
        warnings.push('文件不是 UTF-8 编码，已按 GBK 解码。');
      } catch {
        decoded = false;
      }
      if (!decoded) {
        text = new TextDecoder('utf-8').decode(bytes);
        warnings.push('文件编码无法识别，部分字符可能显示为乱码，建议另存为 UTF-8 后重新上传。');
      }
    }
  }
  if (!text.trim()) throw ApiError.badRequest('TXT 文件中没有可提取的文本');
  return { kind: 'txt', text, charCount: text.length, truncated: false, warnings };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x4000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractResult> {
  const header = decodeLatin1(bytes.subarray(0, 8));
  if (!header.startsWith('%PDF-')) throw ApiError.badRequest('文件不是有效的 PDF');
  if (decodeLatin1(bytes.subarray(0, Math.min(bytes.length, 4096))).includes('/Encrypt')) {
    throw ApiError.badRequest('该 PDF 已加密，无法提取文本，请先解除密码保护');
  }

  const raw = decodeLatin1(bytes);
  const warnings: string[] = [];
  let text = '';
  let streamCount = 0;
  let decodedCount = 0;
  const pageMatches = raw.match(/\/Type\s*\/Page[^s]/g);
  const pages = pageMatches ? pageMatches.length : undefined;

  let searchFrom = 0;
  while (true) {
    const streamIndex = raw.indexOf('stream', searchFrom);
    if (streamIndex === -1) break;
    searchFrom = streamIndex + 6;
    const headerStart = Math.max(0, streamIndex - 600);
    const dict = raw.slice(headerStart, streamIndex);
    if (!dict.includes('/FlateDecode')) continue;
    let dataStart = streamIndex + 6;
    if (raw[dataStart] === '\r') dataStart += 1;
    if (raw[dataStart] === '\n') dataStart += 1;
    const endIndex = raw.indexOf('endstream', dataStart);
    if (endIndex === -1) continue;
    const sliceEnd = endIndex - (raw[endIndex - 1] === '\n' ? 1 : 0) - (raw[endIndex - 2] === '\r' ? 1 : 0);
    const streamBytes = bytes.subarray(dataStart, sliceEnd);
    streamCount += 1;
    try {
      const inflated = await inflate(streamBytes, 'deflate', 4 * 1024 * 1024);
      decodedCount += 1;
      text += `${extractPdfContentText(decodeLatin1(inflated))}\n`;
    } catch {
      try {
        const inflated = await inflate(streamBytes, 'deflate-raw', 4 * 1024 * 1024);
        decodedCount += 1;
        text += `${extractPdfContentText(decodeLatin1(inflated))}\n`;
      } catch {
        // 单个流解码失败不影响其它流
      }
    }
    if (text.length > 2_000_000) break;
  }

  text = text.replace(/\u0000/g, '');
  const meaningful = text.replace(/\s/g, '');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const ascii = (text.match(/[A-Za-z0-9]/g) ?? []).length;
  const likelyScanned = meaningful.length < 80;

  if (likelyScanned) {
    throw ApiError.badRequest(
      '未能从该 PDF 提取到有效文本，可能是扫描版 PDF 或使用了不支持的字体编码。请先做 OCR 转换为可复制文本，或上传 TXT/DOCX 版本。',
    );
  }
  if (streamCount > 0 && decodedCount === 0) {
    throw ApiError.badRequest('该 PDF 的文本流无法解码（可能使用了对象流或加密），请转换为 TXT/DOCX 后上传');
  }
  if (cjk === 0 && ascii < meaningful.length * 0.5) {
    warnings.push('PDF 文本编码可能不完整，提取结果可能缺少部分中文，请核对预览内容。');
  }

  return {
    kind: 'pdf',
    text,
    charCount: text.length,
    truncated: false,
    warnings,
    pages,
    likelyScanned: false,
  };
}

/** 解析 PDF 内容流中的文本显示操作符（Tj / TJ / ' / "）。 */
function extractPdfContentText(content: string): string {
  let out = '';
  let i = 0;
  const length = content.length;
  let pendingSpace = false;

  const flushNewline = () => {
    if (out.length > 0 && !out.endsWith('\n')) out += '\n';
  };

  while (i < length) {
    const char = content[i];
    if (char === 'B' && content.startsWith('BT', i)) {
      flushNewline();
      i += 2;
      continue;
    }
    if (char === 'E' && content.startsWith('ET', i)) {
      flushNewline();
      i += 2;
      continue;
    }
    if (char === '(') {
      const parsed = parsePdfLiteral(content, i);
      if (parsed) {
        if (pendingSpace && out.length > 0 && !out.endsWith('\n') && !out.endsWith(' ')) out += ' ';
        pendingSpace = false;
        out += decodePdfString(parsed.value);
        i = parsed.next;
        continue;
      }
    }
    if (char === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i + 1);
      if (end !== -1) {
        const hex = content.slice(i + 1, end).replace(/\s/g, '');
        if (hex.length > 0 && /^[0-9A-Fa-f]+$/.test(hex)) {
          const bytes = new Uint8Array(hex.length / 2);
          for (let k = 0; k < bytes.length; k += 1) bytes[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
          out += decodePdfString(bytes);
          i = end + 1;
          continue;
        }
      }
    }
    if (char === 'T' && (content.startsWith('Td', i) || content.startsWith('TD', i) || content.startsWith('T*', i))) {
      flushNewline();
      pendingSpace = false;
      i += 2;
      continue;
    }
    if (char === '-' && content.startsWith('-', i)) {
      // TJ 数组中的字距调整：负数较大时视为空格
      const match = /^-\d+/.exec(content.slice(i, i + 8));
      if (match) {
        const value = Number(match[0]);
        if (value <= -150) pendingSpace = true;
        i += match[0].length;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

function parsePdfLiteral(content: string, start: number): { value: Uint8Array; next: number } | null {
  const bytes: number[] = [];
  let i = start + 1;
  let depth = 1;
  while (i < content.length) {
    const char = content[i];
    if (char === '\\') {
      const next = content[i + 1];
      const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
      if (next in escapes) {
        bytes.push(escapes[next]);
        i += 2;
        continue;
      }
      if (/[0-7]/.test(next ?? '')) {
        const octal = content.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
        if (octal) {
          bytes.push(parseInt(octal[0], 8) & 0xff);
          i += 1 + octal[0].length;
          continue;
        }
      }
      i += 1;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return { value: new Uint8Array(bytes), next: i + 1 };
    }
    bytes.push(char.charCodeAt(0) & 0xff);
    i += 1;
  }
  return null;
}

function decodePdfString(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return decodeLatin1(bytes);
  }
}

// ---------------------------------------------------------------------------
// DOCX（ZIP + word/document.xml）
// ---------------------------------------------------------------------------

async function extractDocx(bytes: Uint8Array): Promise<ExtractResult> {
  const xmlBytes = await readZipEntry(bytes, 'word/document.xml');
  if (!xmlBytes) throw ApiError.badRequest('DOCX 中未找到正文内容，文件可能已损坏');
  const xml = new TextDecoder('utf-8').decode(xmlBytes);
  const text = docxXmlToText(xml);
  if (!text.trim()) throw ApiError.badRequest('DOCX 中没有可提取的文本');
  return { kind: 'docx', text, charCount: text.length, truncated: false, warnings: [] };
}

function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tbl>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)));
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 从文件尾部查找 EOCD (0x06054b50)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw ApiError.badRequest('DOCX 文件结构不完整（未找到 ZIP 目录）');
  const entryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  let offset = cdOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > bytes.length) break;
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(bytes: Uint8Array, name: string): Promise<Uint8Array | null> {
  const entries = readZipEntries(bytes);
  const entry = entries.find((item) => item.name === name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) return null;
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflate(compressed, 'deflate-raw', 20 * 1024 * 1024);
  throw ApiError.badRequest('DOCX 使用了不支持的压缩方式');
}

// ---------------------------------------------------------------------------
// 解压（带输出上限，防止压缩炸弹）
// ---------------------------------------------------------------------------

export async function inflate(
  data: Uint8Array,
  format: 'deflate' | 'deflate-raw',
  maxBytes = 8 * 1024 * 1024,
): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as ArrayBuffer]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw ApiError.badRequest('压缩内容解压后超过限制，已中止');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
