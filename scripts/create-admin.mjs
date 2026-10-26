#!/usr/bin/env node
/**
 * 初始管理员创建脚本
 *
 * 用法：
 *   # 1) 直接写入本地 SQLite（dev-server 使用的数据库文件）
 *   node scripts/create-admin.mjs --username admin --sqlite workers/api/.local/quiz.sqlite
 *
 *   # 2) 写入 Cloudflare D1（需要已登录 wrangler）
 *   node scripts/create-admin.mjs --username admin --remote --db online-quiz
 *
 *   # 3) 调用已部署 API 的初始化接口（需要 ADMIN_SETUP_TOKEN）
 *   node scripts/create-admin.mjs --username admin --api https://your-app.workers.dev --setup-token <token>
 *
 * 密码来源优先级：--password > 环境变量 ADMIN_PASSWORD > 自动生成（仅打印一次）。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, randomStringForPassword } from '../workers/api/src/utils/crypto.ts';
import { assertPassword, assertUsername } from '../workers/api/src/validators/auth.ts';
import { applyMigrations } from './node-runtime/migrations.mjs';

function parseArgs(argv) {
  const args = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const [key, inline] = item.slice(2).split('=');
      if (inline !== undefined) args.values[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args.values[key] = argv[i + 1];
        i += 1;
      } else args.flags.add(key);
    }
  }
  return args;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const args = parseArgs(process.argv.slice(2));
const username = args.values.username ?? process.env.ADMIN_USERNAME ?? 'admin';
const password = args.values.password ?? process.env.ADMIN_PASSWORD ?? randomStringForPassword(16);
const generated = !(args.values.password || process.env.ADMIN_PASSWORD);
const force = args.flags.has('force');
const dbName = args.values.db ?? 'online-quiz';
const sqlitePath = args.values.sqlite;
const apiBase = args.values.api;
const setupToken = args.values['setup-token'] ?? process.env.ADMIN_SETUP_TOKEN;
const remote = args.flags.has('remote') || (!sqlitePath && !apiBase);

let safeUsername;
let safePassword;
try {
  safeUsername = assertUsername(username);
  safePassword = assertPassword(password, safeUsername);
} catch (error) {
  fail(error instanceof Error ? error.message : '用户名或密码不符合要求');
}

const passwordHash = await hashPassword(safePassword, Number(process.env.PASSWORD_ITERATIONS) || 100000);
const now = Date.now();
const userId = `u_${Date.now().toString(32).toUpperCase()}`;

async function createViaApi() {
  if (!setupToken) fail('使用 --api 模式时必须提供 --setup-token 或环境变量 ADMIN_SETUP_TOKEN');
  const response = await fetch(`${apiBase.replace(/\/+$/, '')}/api/v1/admin/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Token': setupToken },
    body: JSON.stringify({ username: safeUsername, password: safePassword }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`初始化失败（HTTP ${response.status}）：${payload?.error?.message ?? '未知错误'}`);
  }
  return 'API';
}

function createViaSqlite() {
  mkdirSync(path.dirname(path.resolve(sqlitePath)), { recursive: true });
  const db = new DatabaseSync(sqlitePath);
  try {
    applyMigrations(db);
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND status = 'active'").get();
    if (admins.c > 0 && !force) {
      fail(`数据库中已有 ${admins.c} 个可用管理员。如确需新增，请加 --force。`);
    }
    const existing = db.prepare('SELECT id FROM users WHERE username_lower = ?').get(safeUsername.toLowerCase());
    if (existing) fail(`用户名 ${safeUsername} 已存在`);
    db.prepare(
      `INSERT INTO users (id, username, username_lower, password_hash, role, status, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', 0, ?, ?)`,
    ).run(userId, safeUsername, safeUsername.toLowerCase(), passwordHash, now, now);
    db.prepare(
      `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, detail, created_at)
       VALUES (?, ?, 'system.bootstrap_admin', 'user', ?, '{}', ?)`,
    ).run(`log_${Date.now().toString(32)}`, userId, userId, now);
    return 'SQLite';
  } finally {
    db.close();
  }
}

function createViaWrangler() {
  const dir = mkdtempSync(path.join(tmpdir(), 'quiz-admin-'));
  const file = path.join(dir, 'create-admin.sql');
  const sql = [
    `INSERT INTO users (id, username, username_lower, password_hash, role, status, must_change_password, created_at, updated_at)`,
    `VALUES (${sqlQuote(userId)}, ${sqlQuote(safeUsername)}, ${sqlQuote(safeUsername.toLowerCase())}, ${sqlQuote(passwordHash)}, 'admin', 'active', 0, ${now}, ${now});`,
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, detail, created_at)`,
    `VALUES (${sqlQuote(`log_${now}`)}, ${sqlQuote(userId)}, 'system.bootstrap_admin', 'user', ${sqlQuote(userId)}, '{}', ${now});`,
  ].join('\n');
  writeFileSync(file, sql, 'utf8');
  try {
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', dbName, '--remote', `--file=${file}`, '--yes'],
      { stdio: 'inherit', env: process.env },
    );
    if (result.status !== 0) {
      fail('wrangler 执行失败。请先运行 `npx wrangler login`，并确认数据库名称与 wrangler.toml 一致。');
    }
    return 'Cloudflare D1';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let target;
try {
  if (apiBase) target = await createViaApi();
  else if (sqlitePath) target = createViaSqlite();
  else if (remote) target = createViaWrangler();
  else fail('请指定 --sqlite <文件>、--remote 或 --api <地址> 之一');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log(`\n✔ 管理员创建成功（${target}）`);
console.log(`  用户名：${safeUsername}`);
if (generated) {
  console.log(`  初始密码：${safePassword}`);
  console.log('  ⚠ 该密码只显示这一次，请立即保存并通过安全渠道使用。');
} else {
  console.log('  密码：使用你提供的密码（未回显）');
}
if (remote || sqlitePath) {
  console.log('\n提示：可通过登录接口验证；管理员登录后请尽快修改初始密码。');
}
console.log('');
