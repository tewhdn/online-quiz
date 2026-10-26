/** Crockford Base32（去掉易混淆字符），用于生成可读 ID 与邀请码。 */
export const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const textEncoder = new TextEncoder();

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** 生成带前缀的随机 ID，例如 q_01K2... */
export function newId(prefix: string): string {
  return `${prefix}_${bytesToBase32(randomBytes(16))}`;
}

/** 生成 URL 安全随机令牌（默认 32 字节 = 256 bit） */
export function randomToken(byteLength = 32): string {
  if (byteLength < 16) throw new Error('token 长度不足');
  return bytesToBase64Url(randomBytes(byteLength));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 十六进制摘要。用于会话令牌、邀请码、IP 等的不可逆存储。 */
export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? textEncoder.encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}
