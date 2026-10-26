import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnv,
  createClient,
  expectOk,
  expectStatus,
  setupAdmin,
  createInvite,
  registerUser,
  createQuestion,
  createExam,
} from './harness.mjs';

test('注册时提交 role 字段不会提升权限', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const client = createClient(env);
  const result = await client.post('/api/v1/auth/register', {
    username: 'role_escalation',
    password: 'Escalation123',
    confirmPassword: 'Escalation123',
    inviteCode: code,
    role: 'admin',
    isAdmin: true,
  });
  const data = expectOk(result, '注册');
  assert.equal(data.user.role, 'user');
  expectStatus(await client.get('/api/v1/admin/users'), 403);
});

test('普通用户不能调用任何管理员接口', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code);

  const endpoints = [
    ['GET', '/api/v1/admin/users'],
    ['GET', '/api/v1/admin/invites'],
    ['GET', '/api/v1/admin/questions'],
    ['GET', '/api/v1/admin/dashboard'],
    ['GET', '/api/v1/admin/logs'],
    ['GET', '/api/v1/admin/settings'],
    ['GET', '/api/v1/admin/ai/tasks'],
    ['GET', '/api/v1/admin/ai/review-questions'],
    ['GET', '/api/v1/admin/ai/settings'],
    ['GET', '/api/v1/admin/exams'],
    ['GET', '/api/v1/admin/announcements'],
  ];
  for (const [method, path] of endpoints) {
    const result = await user.call(method, path);
    assert.equal(result.status, 403, `${method} ${path} 应返回 403，实际 ${result.status}`);
  }

  const writeOps = [
    ['POST', '/api/v1/admin/invites', { maxUses: 1 }],
    ['POST', '/api/v1/admin/questions', { stem: 'x', type: 'single', subject: 'x', answer: ['A'], options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }] }],
    ['POST', '/api/v1/admin/ai/generate', { mode: 'topic', subject: 'x', topic: 'x', count: 1 }],
    ['POST', '/api/v1/admin/exams', { title: 'x' }],
    ['POST', '/api/v1/admin/users/u_abc/disable', {}],
  ];
  for (const [method, path, body] of writeOps) {
    const result = await user.call(method, path, body);
    assert.equal(result.status, 403, `${method} ${path} 应返回 403，实际 ${result.status}`);
  }
});

test('作答前题目接口不返回答案与解析', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code);
  const question = await createQuestion(admin, { stem: '作答前的答案保密测试' });

  const detail = expectOk(await user.get(`/api/v1/questions/${question.id}`));
  assert.equal('answer' in detail, false);
  assert.equal('explanation' in detail, false);
  assert.equal('contentHash' in detail, false);

  const list = expectOk(await user.get('/api/v1/questions?subject=计算机基础'));
  for (const item of list) {
    assert.equal('answer' in item, false);
    assert.equal('explanation' in item, false);
  }

  const raw = JSON.stringify(list);
  assert.equal(raw.includes('IPv4 地址为 32 位。'), false, '列表中不能泄露解析文本');
});

test('用户数据严格隔离：练习、错题、收藏、考试成绩互不可见', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin, { maxUses: 5 });
  const { client: alice } = await registerUser(env, code, 'alice_iso', 'AlicePass123');
  const { client: bob } = await registerUser(env, code, 'bob_iso', 'BobPass123');

  const question = await createQuestion(admin, { subject: '隔离测试', stem: '隔离测试题目：IPv4 位数？' });
  const session = expectOk(await alice.post('/api/v1/practice/sessions', { mode: 'subject', subject: '隔离测试', count: 5 }));
  expectOk(await alice.post(`/api/v1/questions/${question.id}/answer`, { answer: ['A'], sessionId: session.sessionId }));
  expectOk(await alice.post(`/api/v1/favorites/${question.id}`, {}));

  expectStatus(await bob.get(`/api/v1/practice/sessions/${session.sessionId}`), 404);
  expectStatus(await bob.post(`/api/v1/practice/sessions/${session.sessionId}/submit`, {}), 404);

  const bobMistakes = expectOk(await bob.get('/api/v1/mistakes'));
  assert.equal(bobMistakes.length, 0);
  const bobFavorites = expectOk(await bob.get('/api/v1/favorites'));
  assert.equal(bobFavorites.length, 0);
  const aliceMistakes = expectOk(await alice.get('/api/v1/mistakes'));
  assert.equal(aliceMistakes.length, 1);
  const aliceFavorites = expectOk(await alice.get('/api/v1/favorites'));
  assert.equal(aliceFavorites.length, 1);

  // 考试记录隔离
  await createQuestion(admin, { subject: '隔离测试', stem: '隔离测试题目二：IPv4 位数？', options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }], answer: ['B'] });
  const exam = await createExam(admin, { subject: '隔离测试', typeCounts: { single: 2, multiple: 0, boolean: 0 } });
  const paper = expectOk(await alice.post(`/api/v1/exams/${exam.id}/start`, {}), '开始考试');
  expectStatus(await bob.get(`/api/v1/exam-attempts/${paper.attempt.id}`), 404);
  expectStatus(await bob.post(`/api/v1/exam-attempts/${paper.attempt.id}/submit`, {}), 404);
});

test('不能通过修改请求参数访问他人数据或伪造角色', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'forge_user', 'ForgePass123');

  // 伪造 userId 查询参数不影响结果
  const stats = expectOk(await user.get('/api/v1/users/me/stats?userId=u_other'));
  assert.equal(stats.totalAnswered, 0);
  const me = expectOk(await user.get('/api/v1/auth/me'));
  assert.equal(me.user.username, 'forge_user');
  assert.equal(me.user.role, 'user');

  // 管理员接口中的 target id 必须是真实存在的用户，且普通用户无权调用
  expectStatus(await user.post('/api/v1/admin/users/not_exists/reset-password', {}), 403);
});

test('收藏接口拒绝未发布或不存在的题目', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code);
  expectStatus(await user.post('/api/v1/favorites/q_not_exists', {}), 404);
});

test('管理员不能禁用或删除自己', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const me = expectOk(await admin.get('/api/v1/auth/me'));
  expectStatus(await admin.post(`/api/v1/admin/users/${me.user.id}/disable`, {}), 400);
  expectStatus(await admin.post(`/api/v1/admin/users/${me.user.id}/delete`, {}), 400);
});
