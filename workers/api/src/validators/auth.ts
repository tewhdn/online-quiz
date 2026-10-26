import { ApiError } from '../utils/errors.ts';

const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{3,24}$/u;
const WEAK_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'passw0rd', 'qwerty123',
  'abc123456', 'admin123', '11111111', '88888888', 'a1234567', 'iloveyou',
]);

export function assertUsername(value: unknown): string {
  if (typeof value !== 'string') throw ApiError.badRequest('用户名必须是字符串');
  const username = value.trim();
  if (username.length < 3 || username.length > 24) {
    throw ApiError.badRequest('用户名长度必须为 3-24 个字符');
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw ApiError.badRequest('用户名只能包含字母、数字、下划线、连字符或中文');
  }
  return username;
}

export function assertPassword(value: unknown, username?: string): string {
  if (typeof value !== 'string') throw ApiError.badRequest('密码必须是字符串');
  if (value.length < 8) throw ApiError.badRequest('密码长度至少 8 个字符');
  if (value.length > 72) throw ApiError.badRequest('密码长度不能超过 72 个字符');
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw ApiError.badRequest('密码必须同时包含字母和数字');
  }
  if (WEAK_PASSWORDS.has(value.toLowerCase())) {
    throw ApiError.badRequest('密码过于简单，请更换更复杂的密码');
  }
  if (username && value.toLowerCase().includes(username.toLowerCase())) {
    throw ApiError.badRequest('密码不能包含用户名');
  }
  return value;
}

export function assertInviteCode(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw ApiError.badRequest('请填写邀请码');
  }
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 40) {
    throw ApiError.badRequest('邀请码格式不正确');
  }
  return normalized;
}

export function assertNewPasswordPair(current: unknown, next: unknown, confirm?: unknown): void {
  if (typeof current !== 'string' || current.length === 0) {
    throw ApiError.badRequest('请输入当前密码');
  }
  assertPassword(next);
  if (confirm !== undefined && next !== confirm) {
    throw ApiError.badRequest('两次输入的新密码不一致');
  }
  if (current === next) {
    throw ApiError.badRequest('新密码不能与当前密码相同');
  }
}
