import type { Env } from '../types/env.ts';

export interface AppConfig {
  environment: string;
  isProduction: boolean;
  passwordIterations: number;
  sessionTtlMs: number;
  cookieSecure: boolean;
  tzOffset: number;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  aiEnabled: boolean;
  aiMaxQuestions: number;
  aiDailyLimit: number;
  aiMaxInputChars: number;
  aiMaxOutputTokens: number;
  aiTimeoutMs: number;
  uploadMaxBytes: number;
  adminSetupToken: string;
}

export function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function boolFromEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

export function loadConfig(env: Env): AppConfig {
  const environment = env.ENVIRONMENT ?? 'development';
  return {
    environment,
    isProduction: environment === 'production',
    passwordIterations: intFromEnv(env.PASSWORD_ITERATIONS, 100_000, 10_000, 600_000),
    sessionTtlMs: intFromEnv(env.SESSION_TTL_HOURS, 72, 1, 720) * 3_600_000,
    cookieSecure: boolFromEnv(env.COOKIE_SECURE, false),
    tzOffset: intFromEnv(env.TZ_OFFSET_MINUTES, 480, -840, 840),
    deepseekApiKey: (env.DEEPSEEK_API_KEY ?? '').trim(),
    deepseekBaseUrl: (env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, ''),
    deepseekModel: env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
    aiEnabled: boolFromEnv(env.AI_ENABLED, true),
    aiMaxQuestions: intFromEnv(env.AI_MAX_QUESTIONS_PER_REQUEST, 50, 1, 50),
    aiDailyLimit: intFromEnv(env.AI_DAILY_TASK_LIMIT, 20, 1, 500),
    aiMaxInputChars: intFromEnv(env.AI_MAX_INPUT_CHARS, 24_000, 500, 60_000),
    aiMaxOutputTokens: intFromEnv(env.AI_MAX_OUTPUT_TOKENS, 8_000, 512, 16_384),
    aiTimeoutMs: intFromEnv(env.AI_TIMEOUT_MS, 120_000, 10_000, 300_000),
    uploadMaxBytes: intFromEnv(env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024, 64 * 1024, 25 * 1024 * 1024),
    adminSetupToken: (env.ADMIN_SETUP_TOKEN ?? '').trim(),
  };
}
