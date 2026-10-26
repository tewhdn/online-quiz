#!/usr/bin/env node
/**
 * 本地开发服务器（Node 运行时）。
 * - 使用 node:sqlite 模拟 D1，加载真实 migrations
 * - 直接调用 Worker 的 fetch 入口（与生产路由一致）
 * - 静态托管 apps/web/dist，支持 SPA 回退
 *
 * 用途：在无法运行 workerd 的环境（如部分 ARM/Android 容器）中本地验收。
 * 标准 Cloudflare 开发仍推荐 `wrangler dev`。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeD1Database } from './node-runtime/d1.mjs';
import { applyMigrations } from './node-runtime/migrations.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'workers/api/.local/quiz.sqlite');
const DIST_DIR = path.join(ROOT, 'apps/web/dist');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const d1 = new NodeD1Database(DB_FILE);
applyMigrations(d1.db);

function readDevVars() {
  const file = path.join(ROOT, 'workers/api/.dev.vars');
  const vars = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    vars[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return vars;
}

const env = {
  DB: d1,
  ENVIRONMENT: 'development',
  APP_NAME: '智能答题系统',
  PASSWORD_ITERATIONS: process.env.PASSWORD_ITERATIONS || '100000',
  SESSION_TTL_HOURS: '72',
  COOKIE_SECURE: 'false',
  TZ_OFFSET_MINUTES: '480',
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
  DEEPSEEK_MODEL: 'deepseek-chat',
  AI_ENABLED: 'true',
  AI_MAX_QUESTIONS_PER_REQUEST: '50',
  AI_DAILY_TASK_LIMIT: '20',
  AI_MAX_INPUT_CHARS: '24000',
  AI_MAX_OUTPUT_TOKENS: '8000',
  AI_TIMEOUT_MS: '120000',
  UPLOAD_MAX_BYTES: '10485760',
  ...readDevVars(),
};

const worker = (await import('../workers/api/src/index.ts')).default;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(pathname, res) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);
  if (!filePath.startsWith(DIST_DIR)) filePath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('前端尚未构建，请先运行 npm run build');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (!url.pathname.startsWith('/api')) {
      serveStatic(url.pathname, res);
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
      else headers.set(key, value);
    }

    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });

    const response = await worker.fetch(request, env, {
      waitUntil() {},
      passThroughOnException() {},
    });

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      responseHeaders[key] = value;
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) responseHeaders['set-cookie'] = setCookies;

    res.writeHead(response.status, responseHeaders);
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error('[dev-server]', error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: { code: 'DEV_SERVER_ERROR', message: String(error?.message || error) } }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  智能答题系统 · 本地 API/站点: http://${HOST}:${PORT}`);
  console.log(`  数据库文件: ${DB_FILE}`);
  console.log(`  前端构建目录: ${DIST_DIR}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      d1.close();
      process.exit(0);
    });
  });
}
