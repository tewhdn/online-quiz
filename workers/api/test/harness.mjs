import assert from 'node:assert/strict';
import { createTestEnv } from '../../../scripts/node-runtime/test-env.mjs';

const workerModule = await import('../src/index.ts');
export const worker = workerModule.default;

export function buildEnv(overrides = {}) {
  return createTestEnv(overrides);
}

/**
 * 直接调用 Worker 的 fetch 入口（与生产路由完全一致），
 * 并模拟浏览器的 Cookie 与 CSRF 行为。
 */
let ipCounter = 0;

export function createClient(env) {
  const cookies = new Map();
  let csrfToken = null;
  // 每个测试客户端使用独立 IP，避免限流互相干扰（限流本身由专门用例覆盖）
  ipCounter += 1;
  const clientIp = `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;

  async function call(method, path, body, options = {}) {
    const headers = new Headers();
    headers.set('cf-connecting-ip', clientIp);
    if (body !== undefined && !(body instanceof FormData)) headers.set('content-type', 'application/json');
    if (cookies.size > 0) {
      headers.set('cookie', Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join('; '));
    }
    if (csrfToken && options.csrf !== false) headers.set('x-csrf-token', csrfToken);
    for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value);

    const init = { method, headers };
    if (body !== undefined) init.body = body instanceof FormData ? body : JSON.stringify(body);

    const response = await worker.fetch(new Request(`http://localhost${path}`, init), env, {
      waitUntil() {},
      passThroughOnException() {},
    });

    for (const rawCookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = rawCookie.split(';');
      const index = pair.indexOf('=');
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = /Max-Age=0/i.test(rawCookie);
      if (expired || value === '') cookies.delete(name);
      else cookies.set(name, value);
    }

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (data && data.ok && data.data && typeof data.data.csrfToken === 'string') csrfToken = data.data.csrfToken;

    return { status: response.status, data, headers: response.headers, text };
  }

  return {
    call,
    get: (path, options) => call('GET', path, undefined, options),
    post: (path, body, options) => call('POST', path, body, options),
    put: (path, body, options) => call('PUT', path, body, options),
    patch: (path, body, options) => call('PATCH', path, body, options),
    del: (path, options) => call('DELETE', path, undefined, options),
    get csrfToken() {
      return csrfToken;
    },
    clearCsrf() {
      csrfToken = null;
    },
    cookies,
  };
}

export function expectOk(result, message = '') {
  assert.equal(result.status >= 200 && result.status < 300, true, `${message} 期望成功，实际 ${result.status}: ${JSON.stringify(result.data)}`);
  assert.equal(result.data?.ok, true);
  return result.data.data;
}

export function expectStatus(result, status) {
  assert.equal(result.status, status, `期望 HTTP ${status}，实际 ${result.status}: ${JSON.stringify(result.data)}`);
  assert.equal(result.data?.ok, false);
  return result.data.error;
}

export const ADMIN = { username: 'admin_test', password: 'AdminPass123' };

/** 通过 bootstrap 接口创建管理员并登录，返回已认证的 client。 */
export async function setupAdmin(env, overrides = {}) {
  const client = createClient(env);
  const result = await client.post(
    '/api/v1/admin/bootstrap',
    { username: ADMIN.username, password: ADMIN.password },
    { headers: { 'x-setup-token': env.ADMIN_SETUP_TOKEN } },
  );
  expectOk(result, '初始化管理员');
  const login = await client.post('/api/v1/auth/login', ADMIN);
  expectOk(login, '管理员登录');
  if (overrides.extraAdmin) {
    // 预留扩展
  }
  return client;
}

export async function createInvite(adminClient, options = {}) {
  const result = await adminClient.post('/api/v1/admin/invites', {
    maxUses: options.maxUses ?? 1,
    expiresAt: options.expiresAt ?? null,
    note: options.note ?? 'test',
  });
  return expectOk(result, '创建邀请码').code;
}

export async function registerUser(env, inviteCode, username = `user_${Math.random().toString(36).slice(2, 8)}`, password = 'UserPass123') {
  const client = createClient(env);
  const result = await client.post('/api/v1/auth/register', {
    username,
    password,
    confirmPassword: password,
    inviteCode,
  });
  expectOk(result, '注册用户');
  return { client, username, password };
}

export async function createQuestion(adminClient, overrides = {}) {
  const payload = {
    type: 'single',
    subject: '计算机基础',
    category: '计算机网络',
    knowledge_points: ['IPv4'],
    difficulty: 2,
    stem: overrides.stem ?? `IPv4 地址长度是多少位？${Math.random().toString(36).slice(2, 8)}`,
    options: [
      { key: 'A', text: '16 位' },
      { key: 'B', text: '32 位' },
      { key: 'C', text: '64 位' },
    ],
    answer: ['B'],
    explanation: 'IPv4 地址为 32 位。',
    source: '测试题库',
    status: 'published',
    ...overrides,
  };
  const result = await adminClient.post('/api/v1/admin/questions', payload);
  return expectOk(result, '创建题目');
}

export async function createExam(adminClient, overrides = {}) {
  const result = await adminClient.post('/api/v1/admin/exams', {
    title: overrides.title ?? `测试考试-${Math.random().toString(36).slice(2, 6)}`,
    description: '用于自动化测试',
    subject: '',
    categoryIds: [],
    knowledgePoints: [],
    typeCounts: { single: 2, multiple: 0, boolean: 0 },
    difficultyCounts: {},
    scoreSingle: 2,
    scoreMultiple: 3,
    scoreBoolean: 2,
    durationMinutes: 30,
    allowEarlySubmit: true,
    allowReview: 'after_submit',
    startAt: null,
    endAt: null,
    allowRetake: false,
    status: 'published',
    ...overrides,
  });
  return expectOk(result, '创建考试');
}
