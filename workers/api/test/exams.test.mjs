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

async function seedExamQuestions(admin, subject, count = 3) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const question = await createQuestion(admin, {
      subject,
      stem: `${subject} 第 ${i + 1} 题：IPv4 地址长度是多少位？`,
      options: [
        { key: 'A', text: '16 位' },
        { key: 'B', text: '32 位' },
        { key: 'C', text: '64 位' },
      ],
      answer: ['B'],
      explanation: 'IPv4 地址为 32 位。',
    });
    ids.push(question.id);
  }
  return ids;
}

test('创建考试：题目不足时明确报错，不静默生成', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  await seedExamQuestions(admin, '考试不足', 2);

  const result = await admin.post('/api/v1/admin/exams', {
    title: '题目不足的考试',
    description: '',
    subject: '考试不足',
    categoryIds: [],
    knowledgePoints: [],
    typeCounts: { single: 5, multiple: 0, boolean: 0 },
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
  });
  const error = expectStatus(result, 400);
  assert.match(error.message, /不足/);
  assert.ok(Array.isArray(error.details.shortages) && error.details.shortages.length > 0);
  const exams = expectOk(await admin.get('/api/v1/admin/exams'));
  assert.equal(exams.length, 0, '失败时不应创建考试');
});

test('考试全流程：生成试卷、作答、服务端判分、成绩分析、快照保留', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const questionIds = await seedExamQuestions(admin, '考试流程', 3);
  const exam = await createExam(admin, { subject: '考试流程', typeCounts: { single: 3, multiple: 0, boolean: 0 } });
  assert.equal(exam.totalQuestions, 3);
  assert.equal(exam.totalScore, 6);

  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'exam_user', 'ExamPass123');

  const paper = expectOk(await user.post(`/api/v1/exams/${exam.id}/start`, {}), '开始考试');
  assert.equal(paper.questions.length, 3);
  const rawPaper = JSON.stringify(paper);
  assert.equal(rawPaper.includes('"answer"'), false, '试卷不能包含答案字段');
  assert.equal(rawPaper.includes('IPv4 地址为 32 位。'), false, '试卷不能包含解析');

  // 答对 2 题，答错 1 题
  const first = paper.questions[0];
  const second = paper.questions[1];
  const third = paper.questions[2];
  expectOk(await user.put(`/api/v1/exam-attempts/${paper.attempt.id}/answers/${first.id}`, { answer: ['B'] }));
  expectOk(await user.put(`/api/v1/exam-attempts/${paper.attempt.id}/answers/${second.id}`, { answer: ['B'] }));
  expectOk(await user.put(`/api/v1/exam-attempts/${paper.attempt.id}/answers/${third.id}`, { answer: ['A'], flagged: true }));

  const result = expectOk(await user.post(`/api/v1/exam-attempts/${paper.attempt.id}/submit`, { score: 999 }), '交卷');
  assert.equal(result.attempt.score, 4, '服务端按每题 2 分判分，忽略客户端提交的 score');
  assert.equal(result.attempt.correctCount, 2);
  assert.equal(result.attempt.wrongCount, 1);
  assert.equal(result.attempt.unansweredCount, 0);
  assert.equal(result.reviewAllowed, true);
  assert.ok(result.summary.byType.single);
  assert.equal(result.summary.byType.single.maxScore, 6);
  assert.ok(Array.isArray(result.summary.knowledge));

  // 重复交卷：返回同一结果，不重复计分
  const again = expectOk(await user.post(`/api/v1/exam-attempts/${paper.attempt.id}/submit`, {}));
  assert.equal(again.attempt.score, 4);
  const attempts = expectOk(await user.get('/api/v1/exam-attempts'));
  assert.equal(attempts.length, 1);

  // 历史快照：管理员修改原题后，历史成绩与题目内容不变
  const adminQuestion = expectOk(await admin.get(`/api/v1/admin/questions/${questionIds[0]}`));
  expectOk(
    await admin.put(`/api/v1/admin/questions/${questionIds[0]}`, {
      ...adminQuestion,
      stem: '【已修改】IPv4 地址长度是多少位？',
      explanation: '【已修改】解析',
      status: 'published',
    }),
    '修改原题',
  );
  const resultAfterEdit = expectOk(await user.get(`/api/v1/exam-attempts/${paper.attempt.id}/result`));
  assert.equal(resultAfterEdit.attempt.score, 4, '历史成绩不受原题修改影响');
  for (const item of resultAfterEdit.questions) {
    assert.equal(item.stem.includes('【已修改】'), false, '历史快照应保留修改前题干');
    assert.equal(item.explanation?.includes('【已修改】') ?? false, false);
  }

  // 不允许重复参加
  const retry = await user.post(`/api/v1/exams/${exam.id}/start`, {});
  expectStatus(retry, 409);
});

test('考试到时：服务端拒绝继续保存答案并自动交卷', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  await seedExamQuestions(admin, '超时考试', 2);
  const exam = await createExam(admin, { subject: '超时考试', typeCounts: { single: 2, multiple: 0, boolean: 0 }, durationMinutes: 1 });
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'timeout_user', 'TimeoutPass123');
  const paper = expectOk(await user.post(`/api/v1/exams/${exam.id}/start`, {}));

  // 模拟时间已过：直接把 deadline 改到过去
  await env.DB.prepare('UPDATE exam_attempts SET deadline_at = ? WHERE id = ?').run(Date.now() - 1000, paper.attempt.id);

  const save = expectOk(
    await user.put(`/api/v1/exam-attempts/${paper.attempt.id}/answers/${paper.questions[0].id}`, { answer: ['B'] }),
    '超时保存答案',
  );
  assert.equal(save.saved, false);
  assert.equal(save.autoSubmitted, true);
  assert.ok(save.result, '超时保存应返回自动交卷成绩');

  const result = expectOk(await user.get(`/api/v1/exam-attempts/${paper.attempt.id}/result`));
  assert.equal(result.attempt.autoSubmitted, true);
  assert.equal(result.attempt.status, 'submitted');

  const further = await user.put(`/api/v1/exam-attempts/${paper.attempt.id}/answers/${paper.questions[1].id}`, { answer: ['B'] });
  expectStatus(further, 409);
});

test('考试题目分值、题型统计与未答统计正确（含多选与判断）', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  await createQuestion(admin, { subject: '混合考试', stem: '混合考试单选题', type: 'single', answer: ['B'] });
  await createQuestion(admin, {
    subject: '混合考试',
    stem: '混合考试多选题',
    type: 'multiple',
    options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }, { key: 'C', text: '丙' }],
    answer: ['A', 'C'],
  });
  await createQuestion(admin, { subject: '混合考试', stem: '混合考试判断题', type: 'boolean', options: [], answer: ['true'] });

  const exam = await createExam(admin, {
    subject: '混合考试',
    typeCounts: { single: 1, multiple: 1, boolean: 1 },
    scoreSingle: 2,
    scoreMultiple: 3,
    scoreBoolean: 2,
  });
  assert.equal(exam.totalScore, 7);

  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'mixed_user', 'MixedPass123');
  const paper = expectOk(await user.post(`/api/v1/exams/${exam.id}/start`, {}));
  const single = paper.questions.find((item) => item.type === 'single');
  const multiple = paper.questions.find((item) => item.type === 'multiple');
  const boolean = paper.questions.find((item) => item.type === 'boolean');

  expectOk(await user.put(`/api/v1/exam-attempts/${paper.attempt.id}/answers/${single.id}`, { answer: ['B'] }));
  expectOk(await user.put(`/api/v1/exam-attempts/${paper.attempt.id}/answers/${multiple.id}`, { answer: ['C', 'A'] }));
  // 判断题故意不答
  const result = expectOk(await user.post(`/api/v1/exam-attempts/${paper.attempt.id}/submit`, {}));

  assert.equal(result.attempt.score, 5);
  assert.equal(result.attempt.correctCount, 2);
  assert.equal(result.attempt.unansweredCount, 1);
  assert.equal(result.summary.byType.multiple.score, 3);
  assert.equal(result.summary.byType.boolean.score, 0);
  assert.ok(boolean);
});

test('编辑考试时题目不足不会留下半更新状态', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  await seedExamQuestions(admin, '编辑不足', 3);
  const exam = await createExam(admin, { subject: '编辑不足', typeCounts: { single: 3, multiple: 0, boolean: 0 } });

  const update = await admin.put(`/api/v1/admin/exams/${exam.id}`, {
    title: '编辑后题目过多',
    description: '',
    subject: '编辑不足',
    categoryIds: [],
    knowledgePoints: [],
    typeCounts: { single: 10, multiple: 0, boolean: 0 },
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
  });
  expectStatus(update, 400);

  const detail = expectOk(await admin.get(`/api/v1/admin/exams/${exam.id}`));
  assert.equal(detail.exam.title, exam.title, '失败时标题不应被修改');
  assert.equal(detail.exam.totalQuestions, 3);
  assert.equal(detail.questions.length, 3, '原试卷不应被破坏');
});
