import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnv, createClient, expectOk, expectStatus, setupAdmin, createInvite, registerUser } from './harness.mjs';

function question(overrides = {}) {
  return {
    type: 'single',
    subject: '导入测试',
    category: '导入分类',
    knowledge_points: ['IPv4'],
    difficulty: 2,
    stem: `导入测试题目 ${Math.random().toString(36).slice(2, 8)}：IPv4 地址长度？`,
    options: [
      { key: 'A', text: '16 位' },
      { key: 'B', text: '32 位' },
      { key: 'C', text: '64 位' },
    ],
    answer: ['B'],
    explanation: 'IPv4 地址为 32 位。',
    source: '导入测试',
    ...overrides,
  };
}

function jsonContent(questions) {
  return JSON.stringify({ version: 1, questions });
}

async function countQuestions(admin) {
  const list = expectOk(await admin.get('/api/v1/admin/questions?pageSize=100'));
  return list.length;
}

test('JSON 导入：先预览后写入，预览不落库', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const content = jsonContent([question(), question({ type: 'boolean', options: [], answer: ['true'], stem: '判断题：计算机使用二进制？' })]);

  const preview = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content,
      mode: 'preview',
      duplicateStrategy: 'skip',
      defaultStatus: 'published',
    }),
    '导入预览',
  );
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.total, 2);
  assert.equal(preview.valid, 2);
  assert.equal(preview.invalid, 0);
  assert.equal(preview.inserted, 0);
  assert.equal(await countQuestions(admin), 0, '预览不应写入数据库');

  const committed = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content,
      mode: 'commit',
      duplicateStrategy: 'skip',
      defaultStatus: 'published',
    }),
    '导入提交',
  );
  assert.equal(committed.mode, 'commit');
  assert.equal(committed.inserted, 2);
  assert.equal(await countQuestions(admin), 2);
});

test('非法 JSON 与缺失字段：明确报错并给出行号', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);

  expectStatus(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content: '{ not valid json',
      mode: 'preview',
      duplicateStrategy: 'skip',
      defaultStatus: 'draft',
    }),
    400,
  );

  const missingStem = question();
  delete missingStem.stem;
  const missingAnswer = question({ answer: [] });
  const result = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content: jsonContent([question(), missingStem, missingAnswer]),
      mode: 'preview',
      duplicateStrategy: 'skip',
      defaultStatus: 'draft',
    }),
    '部分失败预览',
  );
  assert.equal(result.total, 3);
  assert.equal(result.valid, 1);
  assert.equal(result.invalid, 2);
  assert.ok(result.errors.length >= 2);
  const rows = result.errors.map((item) => item.row);
  assert.ok(rows.includes(2), '缺失题干应报告第 2 行');
  assert.ok(rows.includes(3), '缺失答案应报告第 3 行');
  assert.ok(result.errors.some((item) => item.message.includes('题干')));
});

test('重复处理策略：跳过 / 更新 / 全部新建', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const content = jsonContent([question({ stem: '重复策略测试题：IPv4 位数？' })]);

  expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content,
      mode: 'commit',
      duplicateStrategy: 'skip',
      defaultStatus: 'published',
    }),
  );

  const skipPreview = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content,
      mode: 'preview',
      duplicateStrategy: 'skip',
      defaultStatus: 'published',
    }),
  );
  assert.equal(skipPreview.duplicates, 1);
  assert.equal(skipPreview.valid, 1);

  const skipCommit = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content,
      mode: 'commit',
      duplicateStrategy: 'skip',
      defaultStatus: 'published',
    }),
  );
  assert.equal(skipCommit.inserted, 0);
  assert.equal(skipCommit.skipped, 1);
  assert.equal(await countQuestions(admin), 1);

  const createCommit = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content,
      mode: 'commit',
      duplicateStrategy: 'create',
      defaultStatus: 'published',
    }),
  );
  assert.equal(createCommit.inserted, 1);
  assert.equal(await countQuestions(admin), 2);

  const updateCommit = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content,
      mode: 'commit',
      duplicateStrategy: 'update',
      defaultStatus: 'published',
    }),
  );
  assert.ok(updateCommit.updated >= 1, '更新策略至少应命中一条同题');
  assert.equal(await countQuestions(admin), 2, '更新不应新增题目');
  const list = expectOk(await admin.get('/api/v1/admin/questions?q=重复策略测试题'));
  assert.ok(list.some((item) => item.version >= 2), '更新命中的题目版本号应增加');
});

test('CSV 导入：支持 option_a..option_h 与 options 列', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const csv = [
    'type,subject,category,knowledge_points,difficulty,stem,option_a,option_b,option_c,answer,explanation,source',
    'single,CSV科目,CSV分类,IP地址,2,CSV 题目一：IPv4 地址长度？,16 位,32 位,64 位,B,IPv4 为 32 位,CSV测试',
    'boolean,CSV科目,CSV分类,二进制,1,CSV 题目二：计算机使用二进制？,,,,true,判断题解析,CSV测试',
    'single,CSV科目,CSV分类,,2,CSV 题目三缺少答案,,,,,缺少答案,CSV测试',
  ].join('\n');

  const preview = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'csv',
      content: csv,
      mode: 'preview',
      duplicateStrategy: 'skip',
      defaultStatus: 'draft',
    }),
    'CSV 预览',
  );
  assert.equal(preview.format, 'csv');
  assert.equal(preview.total, 3);
  assert.equal(preview.valid, 2);
  assert.equal(preview.invalid, 1);
  assert.ok(preview.errors.some((item) => item.row === 4));

  const committed = expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'csv',
      content: csv,
      mode: 'commit',
      duplicateStrategy: 'skip',
      defaultStatus: 'draft',
    }),
    'CSV 提交',
  );
  assert.equal(committed.inserted, 2);

  const drafts = expectOk(await admin.get('/api/v1/admin/questions?status=draft'));
  assert.equal(drafts.length, 2, '默认状态为草稿，不应直接发布');
  const booleanQuestion = drafts.find((item) => item.type === 'boolean');
  assert.ok(booleanQuestion);
  assert.deepEqual(booleanQuestion.answer, ['true']);
});

test('导入不会覆盖或清空已有题库', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  expectOk(
    await admin.post('/api/v1/admin/questions', {
      ...question({ stem: '手工创建的题目：IPv6 长度？' }),
      status: 'published',
    }),
  );
  expectOk(
    await admin.post('/api/v1/admin/questions/import', {
      format: 'json',
      content: jsonContent([question({ stem: '导入新增题目：TCP 属于哪一层？' })]),
      mode: 'commit',
      duplicateStrategy: 'skip',
      defaultStatus: 'published',
    }),
  );
  assert.equal(await countQuestions(admin), 2);
});

test('普通用户不能导入题库', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code);
  expectStatus(
    await user.post('/api/v1/admin/questions/import', {
      format: 'json',
      content: jsonContent([question()]),
      mode: 'commit',
      duplicateStrategy: 'skip',
      defaultStatus: 'published',
    }),
    403,
  );
});
