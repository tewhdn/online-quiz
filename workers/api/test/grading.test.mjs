import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer } from '../src/validators/question.ts';
import { buildEnv, expectOk, setupAdmin, createInvite, registerUser, createQuestion } from './harness.mjs';

test('判分单元测试：单选、多选、判断与非法输入', () => {
  assert.equal(gradeAnswer('single', ['B'], ['B']), true);
  assert.equal(gradeAnswer('single', ['B'], ['A']), false);
  assert.equal(gradeAnswer('single', ['B'], []), false);
  assert.equal(gradeAnswer('single', ['B'], ['B', 'C']), false);

  assert.equal(gradeAnswer('multiple', ['A', 'C'], ['A', 'C']), true);
  assert.equal(gradeAnswer('multiple', ['A', 'C'], ['C', 'A']), true, '多选答案顺序不影响判分');
  assert.equal(gradeAnswer('multiple', ['A', 'C'], ['A']), false, '漏选不得分');
  assert.equal(gradeAnswer('multiple', ['A', 'C'], ['A', 'B', 'C']), false, '错选不得分');
  assert.equal(gradeAnswer('multiple', ['A'], ['A']), true);

  assert.equal(gradeAnswer('boolean', ['true'], ['true']), true);
  assert.equal(gradeAnswer('boolean', ['true'], true), true, '布尔值输入也可正确处理');
  assert.equal(gradeAnswer('boolean', ['true'], ['false']), false);
  assert.equal(gradeAnswer('boolean', ['true'], []), false);

  assert.equal(gradeAnswer('single', ['B'], ['X']), false);
  assert.equal(gradeAnswer('single', ['B'], 'B'), true);
  assert.equal(gradeAnswer('single', ['B'], ['B', 'B']), true, '重复选项被去重');
});

test('服务端判分：单选、多选、判断均正确，客户端提交的 score 被忽略', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin, { maxUses: 3 });
  const { client: user } = await registerUser(env, code, 'grading_user', 'GradingPass123');

  const subject = '判分测试';
  const single = await createQuestion(admin, {
    subject,
    stem: '判分测试单选题',
    type: 'single',
    options: [{ key: 'A', text: '16 位' }, { key: 'B', text: '32 位' }, { key: 'C', text: '64 位' }],
    answer: ['B'],
    explanation: 'IPv4 为 32 位。',
  });
  const multiple = await createQuestion(admin, {
    subject,
    stem: '判分测试多选题',
    type: 'multiple',
    options: [{ key: 'A', text: '路由器' }, { key: 'B', text: '交换机' }, { key: 'C', text: '防火墙' }],
    answer: ['A', 'C'],
    explanation: '路由器和防火墙可用于不同网络隔离/转发。',
  });
  const boolean = await createQuestion(admin, {
    subject,
    stem: '判分测试判断题',
    type: 'boolean',
    options: [],
    answer: ['true'],
    explanation: '计算机使用二进制。',
  });

  const session = expectOk(await user.post('/api/v1/practice/sessions', { mode: 'subject', subject, count: 10 }));
  assert.equal(session.total, 3);

  const singleResult = expectOk(
    await user.post(`/api/v1/questions/${single.id}/answer`, { answer: ['B'], sessionId: session.sessionId, score: 100 }),
  );
  assert.equal(singleResult.isCorrect, true);
  assert.deepEqual(singleResult.correctAnswer, ['B']);
  assert.equal('score' in singleResult, false);

  const multipleResult = expectOk(
    await user.post(`/api/v1/questions/${multiple.id}/answer`, { answer: ['C', 'A'], sessionId: session.sessionId }),
  );
  assert.equal(multipleResult.isCorrect, true, '多选顺序不影响');

  const booleanResult = expectOk(
    await user.post(`/api/v1/questions/${boolean.id}/answer`, { answer: ['true'], sessionId: session.sessionId }),
  );
  assert.equal(booleanResult.isCorrect, true);

  const stats = expectOk(await user.get('/api/v1/users/me/stats'));
  assert.equal(stats.totalAnswered, 3);
  assert.equal(stats.totalCorrect, 3);
  assert.equal(stats.wrongCount, 0);
});

test('答错进入错题本，标记掌握后再次答错会重新待复习', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'mistake_user', 'MistakePass123');
  const question = await createQuestion(admin, { subject: '错题测试', stem: '错题测试题干', answer: ['B'] });

  const session = expectOk(await user.post('/api/v1/practice/sessions', { mode: 'subject', subject: '错题测试', count: 5 }));
  const result = expectOk(await user.post(`/api/v1/questions/${question.id}/answer`, { answer: ['A'], sessionId: session.sessionId }));
  assert.equal(result.isCorrect, false);

  const mistakes = expectOk(await user.get('/api/v1/mistakes?status=pending'));
  assert.equal(mistakes.length, 1);
  assert.equal(mistakes[0].wrongCount, 1);
  assert.equal(mistakes[0].mastered, false);

  expectOk(await user.post(`/api/v1/mistakes/${mistakes[0].id}/mastered`, { mastered: true }));
  const mastered = expectOk(await user.get('/api/v1/mistakes?status=mastered'));
  assert.equal(mastered.length, 1);

  // 再次答错 → 重新进入待复习（即使之前标记了掌握）
  const retry = expectOk(await user.post('/api/v1/practice/sessions', { mode: 'subject', subject: '错题测试', count: 5 }));
  expectOk(await user.post(`/api/v1/questions/${question.id}/answer`, { answer: ['A'], sessionId: retry.sessionId }));
  const pending = expectOk(await user.get('/api/v1/mistakes?status=pending'));
  assert.equal(pending.length, 1);
  assert.equal(pending[0].wrongCount, 2);
});

test('重复提交同一题：返回既有结果，不重复计数', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'duplicate_user2', 'Duplicate123');
  const question = await createQuestion(admin, { subject: '重复提交测试', stem: '重复提交题干', answer: ['B'] });

  const session = expectOk(await user.post('/api/v1/practice/sessions', { mode: 'subject', subject: '重复提交测试', count: 5 }));
  const first = expectOk(await user.post(`/api/v1/questions/${question.id}/answer`, { answer: ['B'], sessionId: session.sessionId }));
  assert.equal(first.duplicate, false);
  const second = expectOk(await user.post(`/api/v1/questions/${question.id}/answer`, { answer: ['A'], sessionId: session.sessionId }));
  assert.equal(second.duplicate, true);
  assert.equal(second.isCorrect, first.isCorrect, '重复提交不能改变判分');

  const stats = expectOk(await user.get('/api/v1/users/me/stats'));
  assert.equal(stats.totalAnswered, 1);
  assert.equal(stats.todayAnswered, 1);
});

test('随机刷题：某题型题量少时仍能补足请求数量', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'fill_user', 'FillPass123');
  const subject = '抽题补足测试';

  // 1 道单选 + 20 道多选，随机请求 10 道应补足到 10 道
  await createQuestion(admin, { subject, stem: '补足测试单选题', answer: ['B'] });
  for (let i = 0; i < 20; i += 1) {
    await createQuestion(admin, {
      subject,
      stem: `补足测试多选题 ${i}`,
      type: 'multiple',
      options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }, { key: 'C', text: '丙' }],
      answer: ['A', 'B'],
    });
  }
  const session = expectOk(await user.post('/api/v1/practice/sessions', { mode: 'random', count: 10, subject }));
  assert.equal(session.total, 10, '随机练习应补足到请求数量');
  assert.equal(session.questions.length, 10);

  const sequenced = expectOk(await user.post('/api/v1/practice/sessions', { mode: 'sequence', count: 10, subject }));
  assert.equal(sequenced.total, 10);
});
