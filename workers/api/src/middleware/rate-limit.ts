import { assertWithinRateLimit, hitRateLimit } from '../repositories/content-repo.ts';
import { nowMs } from '../utils/time.ts';
import type { Env } from '../types/env.ts';

/**
 * 分级限流：未登录按 IP，登录后按用户 + IP，避免单一维度被绕过。
 * 返回值用于测试断言。
 */
export async function enforceRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number,
  identity: string,
): Promise<void> {
  const result = await hitRateLimit(env.DB, `rl:${key}:${identity}`, limit, windowSeconds, nowMs());
  assertWithinRateLimit(result);
}
