import { randomBytes, bytesToBase32, bytesToBase64, base64ToBytes, sha256Hex, BASE32_ALPHABET } from './id.ts';

const encoder = new TextEncoder();

/**
 * 密码哈希：PBKDF2-HMAC-SHA256。
 *
 * 取舍说明（详见 docs/SECURITY.md）：
 * - Argon2id 需要 WASM 且有较大内存/CPU 开销，Cloudflare Workers 免费版 CPU 限制较严，
 *   不适合直接运行；WebCrypto 原生实现 PBKDF2 是当前环境下经过审查、可实际部署的方案。
 * - 迭代次数通过 PASSWORD_ITERATIONS 配置，默认 100000。若触发 Worker CPU 限制
 *   （1102 错误），可下调并在文档中记录；生产环境建议 Workers Paid + 更高迭代次数。
 * - 每个密码使用 16 字节加密安全随机盐，禁止明文/Base64/MD5/单次 SHA-256。
 */
export function defaultIterations(): number {
  return 100_000;
}

export function normalizeIterations(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultIterations();
  return Math.min(600_000, Math.max(10_000, Math.floor(parsed)));
}

export async function hashPassword(password: string, iterations = defaultIterations()): Promise<string> {
  const iterationCount = normalizeIterations(iterations);
  const salt = randomBytes(16);
  const hash = await derive(password, salt, iterationCount);
  return `pbkdf2$sha256$${iterationCount}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 1_000_000) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64ToBytes(parts[3]);
    expected = base64ToBytes(parts[4]);
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function constantTimeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  return constantTimeEqual(enc.encode(a), enc.encode(b));
}

// ---------------------------------------------------------------------------
// 邀请码
// ---------------------------------------------------------------------------

/** 归一化：大写、去掉空格与分隔符，便于用户输入时不区分大小写/格式。 */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** 生成 12 位 Crockford Base32 邀请码（60 bit 熵），格式 QZ-XXXX-XXXX-XXXX。 */
export function generateInviteCode(): string {
  const raw = bytesToBase32(randomBytes(8)).slice(0, 12).padEnd(12, '0');
  const chars = Array.from(raw, (c) => BASE32_ALPHABET[BASE32_ALPHABET.indexOf(c)] ?? '0');
  return `QZ-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export async function hashInviteCode(code: string): Promise<string> {
  return sha256Hex(`invite:${normalizeInviteCode(code)}`);
}

/** 展示用掩码，数据库泄露时无法还原原始邀请码。 */
export function maskInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  if (normalized.length < 8) return '****';
  return `QZ-****-****-${normalized.slice(-4)}`;
}

export async function hashUserAgent(ua: string | null): Promise<string | null> {
  if (!ua) return null;
  return (await sha256Hex(ua)).slice(0, 32);
}

/** 生成一次性初始密码：保证同时包含字母与数字，排除易混淆字符。 */
export function randomStringForPassword(length = 14): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits + '!@#%*';
  const out: string[] = [];
  const randomIndex = (max: number): number => {
    // 拒绝采样，避免取模偏差
    const limit = Math.floor(256 / max) * max;
    const buffer = new Uint8Array(1);
    for (;;) {
      crypto.getRandomValues(buffer);
      if (buffer[0] < limit) return buffer[0] % max;
    }
  };
  out.push(letters[randomIndex(letters.length)]);
  out.push(digits[randomIndex(digits.length)]);
  for (let i = 2; i < length; i += 1) out.push(all[randomIndex(all.length)]);
  // 洗牌
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
