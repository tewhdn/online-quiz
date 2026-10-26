import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnv, createClient, expectOk, expectStatus, setupAdmin, createInvite, registerUser, createQuestion } from './harness.mjs';

test('健康检查返回数据库状态', async () => {
  const env = buildEnv();
  const client = createClient(env);
  const result = await client.get('/api/v1/health');
  const data = expectOk(result, '健康检查');
  assert.equal(data.status, 'ok');
  assert.equal(data.db, 'ok');
});

test('完整主流程：管理员初始化 → 邀请码 → 注册 → 出题 → 答题 → 统计', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);

  const code = await createInvite(admin, { maxUses: 1 });
  assert.match(code, /^QZ-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

  const { client: user, username } = await registerUser(env, code, 'student_one');
  assert.equal(username, 'student_one');

  const me = await user.get('/api/v1/auth/me');
  assert.equal(expectOk(me).user.role, 'user');

  const question = await createQuestion(admin, { stem: 'IPv4 地址有多少位？' });
  assert.ok(question.id);

  const detail = await user.get(`/api/v1/questions/${question.id}`);
  const publicQuestion = expectOk(detail);
  assert.equal(publicQuestion.stem, 'IPv4 地址有多少位？');
  assert.equal('answer' in publicQuestion, false, '作答前不能返回正确答案');
  assert.equal('explanation' in publicQuestion, false, '作答前不能返回解析');

  const session = expectOk(
    await user.post('/api/v1/practice/sessions', { mode: 'random', count: 5 }),
    '开始练习',
  );
  assert.equal(session.total, 1);

  const answer = expectOk(
    await user.post(`/api/v1/questions/${question.id}/answer`, { answer: ['B'], sessionId: session.sessionId }),
    '提交答案',
  );
  assert.equal(answer.isCorrect, true);
  assert.deepEqual(answer.correctAnswer, ['B']);
  assert.ok(answer.explanation.length > 0);

  const stats = expectOk(await user.get('/api/v1/users/me/stats'));
  assert.equal(stats.totalAnswered, 1);
  assert.equal(stats.totalCorrect, 1);

  const finish = expectOk(await user.post(`/api/v1/practice/sessions/${session.sessionId}/submit`, {}));
  assert.equal(finish.answeredCount, 1);
});

test('未登录访问受保护接口返回 401', async () => {
  const env = buildEnv();
  const client = createClient(env);
  expectStatus(await client.get('/api/v1/users/me'), 401);
  expectStatus(await client.get('/api/v1/questions'), 401);
});

test('普通用户不能访问管理接口', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code);
  expectStatus(await user.get('/api/v1/admin/users'), 403);
  expectStatus(await user.post('/api/v1/admin/invites', { maxUses: 1 }), 403);
  expectStatus(await user.get('/api/v1/admin/dashboard'), 403);
});
