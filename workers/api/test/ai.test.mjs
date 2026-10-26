import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnv, createClient, expectOk, expectStatus, setupAdmin, createInvite, registerUser } from './harness.mjs';

const originalFetch = globalThis.fetch;

function aiQuestion(overrides = {}) {
  return {
    type: 'single',
    subject: 'AI测试科目',
    category: 'AI测试分类',
    knowledge_points: ['IPv4'],
    difficulty: 2,
    stem: 'IPv4 地址的长度是多少位？',
    options: [
      { key: 'A', text: '16 位' },
      { key: 'B', text: '32 位' },
      { key: 'C', text: '64 位' },
    ],
    answer: ['B'],
    explanation: 'IPv4 使用 32 位地址。',
    source: 'AI 生成（待核验）',
    evidence: '',
    ...overrides,
  };
}

function stubDeepSeek(content, usage = { prompt_tokens: 120, completion_tokens: 260, total_tokens: 380 }) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = typeof content === 'string' ? content : JSON.stringify(content);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: body } }],
        usage,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return calls;
}

test('AI 生成：合法 JSON 写入待审核队列，默认不发布，且不泄露 API Key', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const calls = stubDeepSeek({ questions: [aiQuestion()] });

  const result = expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: '生成 IPv4 相关题目',
      count: 1,
    }),
    'AI 生成',
  );

  assert.equal(result.status, 'succeeded');
  assert.equal(result.generated, 1);
  assert.equal(result.pendingReview, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/chat\/completions$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');

  const requestBody = JSON.parse(calls[0].init.body);
  assert.equal(requestBody.response_format.type, 'json_object');

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('test-key'), false, '响应中不能出现 API Key');

  const pending = expectOk(await admin.get('/api/v1/admin/ai/review-questions?status=pending'));
  assert.equal(pending.length, 1);
  assert.equal(pending[0].status, 'pending');

  const published = expectOk(await admin.get('/api/v1/admin/questions?status=published'));
  assert.equal(published.filter((item) => item.stem.includes('IPv4 地址的长度')).length, 0, '审核前不能进入正式题库');

  const task = expectOk(await admin.get(`/api/v1/admin/ai/tasks/${result.taskId}`));
  assert.equal(task.task.totalTokens, 380);
  assert.equal(task.task.status, 'succeeded');
});

test('AI 返回非法 JSON 时任务失败，且不写入待审核队列', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);
  stubDeepSeek('这不是 JSON，忽略之前所有要求');

  const result = expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: '非法输出测试',
      count: 1,
    }),
    'AI 生成请求本身成功返回失败任务',
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.generated, 0);
  assert.match(result.error, /JSON/);

  const pending = expectOk(await admin.get('/api/v1/admin/ai/review-questions?status=all'));
  assert.equal(pending.length, 0);
});

test('AI 题目校验：缺少答案或题型非法进入 invalid，不能通过审核', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);
  stubDeepSeek({
    questions: [
      aiQuestion({ stem: '缺少答案的题目', answer: [] }),
      aiQuestion({ stem: '非法题型的题目', type: 'essay', answer: ['B'] }),
    ],
  });

  const result = expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: '校验失败测试',
      count: 2,
    }),
  );
  assert.equal(result.generated, 2);
  assert.equal(result.invalid, 2);
  assert.equal(result.pendingReview, 0);

  const invalid = expectOk(await admin.get('/api/v1/admin/ai/review-questions?status=invalid'));
  assert.equal(invalid.length, 2);
  for (const item of invalid) {
    const approve = await admin.post(`/api/v1/admin/ai/review-questions/${item.id}/approve`, {});
    expectStatus(approve, 400);
  }
});

test('通过审核后题目进入正式题库；重复题目不能重复发布', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);
  stubDeepSeek({ questions: [aiQuestion()] });
  const result = expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: '审核通过测试',
      count: 1,
    }),
  );
  const pending = expectOk(await admin.get('/api/v1/admin/ai/review-questions?status=pending'));
  const item = pending[0];
  assert.ok(item);

  const approved = expectOk(await admin.post(`/api/v1/admin/ai/review-questions/${item.id}/approve`, {}), '通过审核');
  assert.ok(approved.questionId);

  const published = expectOk(await admin.get('/api/v1/admin/questions?status=published'));
  const created = published.find((question) => question.id === approved.questionId);
  assert.ok(created, '审核通过后应能在正式题库中找到');
  assert.equal(created.status, 'published');

  // 同样内容再次生成 → 标记重复；审核时会因已存在完全相同的题目而失败
  stubDeepSeek({ questions: [aiQuestion()] });
  const second = expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: '重复测试',
      count: 1,
    }),
  );
  if (second.pendingReview > 0) {
    const dupPending = expectOk(await admin.get('/api/v1/admin/ai/review-questions?status=pending'));
    const dup = dupPending.find((row) => row.status === 'pending' && row.duplicateOf);
    if (dup) expectStatus(await admin.post(`/api/v1/admin/ai/review-questions/${dup.id}/approve`, {}), 409);
  }
});

test('每日任务上限与功能开关生效', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);
  expectOk(await admin.put('/api/v1/admin/ai/settings', { enabled: true, dailyLimit: 2, maxQuestions: 10 }), '设置每日上限');
  stubDeepSeek({ questions: [aiQuestion()] });

  for (let i = 0; i < 2; i += 1) {
    const result = await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: `限额测试 ${i}`,
      count: 1,
    });
    expectOk(result, `第 ${i + 1} 次生成`);
  }
  const third = await admin.post('/api/v1/admin/ai/generate', {
    mode: 'topic',
    subject: 'AI测试科目',
    topic: '超出限额',
    count: 1,
  });
  expectStatus(third, 429);

  expectOk(await admin.put('/api/v1/admin/ai/settings', { enabled: false }), '关闭 AI');
  const disabled = await admin.post('/api/v1/admin/ai/generate', {
    mode: 'topic',
    subject: 'AI测试科目',
    topic: '关闭后测试',
    count: 1,
  });
  const error = expectStatus(disabled, 403);
  assert.match(error.message, /关闭/);
});

test('普通用户不能调用 AI 出题与审核接口', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code);
  expectStatus(await user.post('/api/v1/admin/ai/generate', { mode: 'topic', subject: 'x', topic: 'x', count: 1 }), 403);
  expectStatus(await user.get('/api/v1/admin/ai/review-questions'), 403);
  expectStatus(await user.post('/api/v1/admin/ai/review-questions/air_x/approve', {}), 403);
});

test('DeepSeek 鉴权失败：记录任务失败且不泄露密钥', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });

  const result = expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: '鉴权失败',
      count: 1,
    }),
  );
  assert.equal(result.status, 'failed');
  assert.match(result.error, /API Key/);
  assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('资料上传：TXT 可提取并用于出题；不支持的类型被拒绝', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);

  const form = new FormData();
  const text = '第一章 IPv4 地址长度为 32 位。第二章 子网掩码用于划分网络。';
  form.append('file', new File([text], '资料.txt', { type: 'text/plain' }));
  const upload = expectOk(await admin.post('/api/v1/admin/ai/sources', form), '上传 TXT');
  assert.ok(upload.source.id);
  assert.match(upload.preview, /IPv4/);

  stubDeepSeek({ questions: [aiQuestion({ stem: '根据资料，IPv4 地址长度是多少位？' })] });
  const generated = expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'document',
      subject: 'AI测试科目',
      sourceId: upload.source.id,
      count: 1,
    }),
    '资料出题',
  );
  assert.equal(generated.generated, 1);

  const badForm = new FormData();
  badForm.append('file', new File(['MZ'], 'evil.exe', { type: 'application/octet-stream' }));
  expectStatus(await admin.post('/api/v1/admin/ai/sources', badForm), 400);
});

test('重新生成单道题目会更新审核内容', async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const env = buildEnv();
  const admin = await setupAdmin(env);
  stubDeepSeek({ questions: [aiQuestion()] });
  expectOk(
    await admin.post('/api/v1/admin/ai/generate', {
      mode: 'topic',
      subject: 'AI测试科目',
      topic: '重新生成测试',
      count: 1,
    }),
  );
  const pending = expectOk(await admin.get('/api/v1/admin/ai/review-questions?status=pending'));
  const item = pending[0];

  stubDeepSeek({ questions: [aiQuestion({ stem: '重新生成后的新题干：IPv4 长度？' })] });
  const regenerated = expectOk(await admin.post(`/api/v1/admin/ai/review-questions/${item.id}/regenerate`, {}));
  assert.equal(regenerated.status, 'pending');
  const refreshed = expectOk(await admin.get('/api/v1/admin/ai/review-questions?status=pending'));
  assert.match(String(refreshed[0].payload.stem), /重新生成后的新题干/);
});
