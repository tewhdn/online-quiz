import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NodeD1Database } from './d1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'workers/api/migrations');

export const TEST_DEFAULTS = {
  ENVIRONMENT: 'test',
  APP_NAME: '智能答题系统',
  PASSWORD_ITERATIONS: '10000',
  SESSION_TTL_HOURS: '1',
  COOKIE_SECURE: 'false',
  TZ_OFFSET_MINUTES: '480',
  DEEPSEEK_BASE_URL: 'https://deepseek.test',
  DEEPSEEK_MODEL: 'deepseek-chat',
  DEEPSEEK_API_KEY: 'test-key',
  AI_ENABLED: 'true',
  AI_MAX_QUESTIONS_PER_REQUEST: '50',
  AI_DAILY_TASK_LIMIT: '2',
  AI_MAX_INPUT_CHARS: '24000',
  AI_MAX_OUTPUT_TOKENS: '8000',
  AI_TIMEOUT_MS: '5000',
  UPLOAD_MAX_BYTES: '10485760',
  ADMIN_SETUP_TOKEN: 'test-setup-token',
};

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

export function createDatabase(filename = ':memory:') {
  const db = new NodeD1Database(filename);
  for (const name of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    db.db.exec(sql);
  }
  return db;
}

export function createTestEnv(overrides = {}) {
  return {
    DB: createDatabase(overrides.DB_FILE ?? ':memory:'),
    ...TEST_DEFAULTS,
    ...overrides,
  };
}

export const ROOT_DIR = ROOT;
