import { ApiError } from '../utils/errors.ts';
import { newId } from '../utils/id.ts';
import { nowMs, secondsBetween } from '../utils/time.ts';
import { toCsv } from '../utils/csv.ts';
import { gradeAnswer, normalizeBooleanAnswer } from '../validators/question.ts';
import { validateExamInput, examTotalScore, type ExamInput } from '../validators/exam.ts';
import * as examRepo from '../repositories/exam-repo.ts';
import * as questions from '../repositories/question-repo.ts';
import { writeAudit } from '../repositories/content-repo.ts';
import type { AuthUser } from '../types/env.ts';
import type { QuestionRecord, QuestionType } from '../types/models.ts';

// ---------------------------------------------------------------------------
// 创建 / 编辑考试
// ---------------------------------------------------------------------------

interface SelectionPlan {
  picks: Array<{ question: QuestionRecord; score: number }>;
}

export async function planExamQuestions(
  db: D1Database,
  input: ExamInput,
): Promise<SelectionPlan & { shortages: string[] }> {
  const typeScore: Record<QuestionType, number> = {
    single: input.scoreSingle,
    multiple: input.scoreMultiple,
    boolean: input.scoreBoolean,
  };
  const counts: Array<{ type: QuestionType; count: number }> = (
    [
      { type: 'single', count: input.typeCounts.single },
      { type: 'multiple', count: input.typeCounts.multiple },
      { type: 'boolean', count: input.typeCounts.boolean },
    ] as Array<{ type: QuestionType; count: number }>
  ).filter((item) => item.count > 0);

  const difficultyLevels = Object.keys(input.difficultyCounts)
    .map((level) => ({ level: Number(level), weight: input.difficultyCounts[level] ?? 0 }))
    .filter((item) => item.level >= 1 && item.level <= 5 && item.weight > 0);

  const picks: Array<{ question: QuestionRecord; score: number }> = [];
  const shortages: string[] = [];
  const seen = new Set<string>();

  for (const entry of counts) {
    const allocations =
      difficultyLevels.length > 0
        ? allocateByWeights(entry.count, difficultyLevels)
        : [{ level: null as number | null, count: entry.count }];

    for (const allocation of allocations) {
      if (allocation.count <= 0) continue;
      const available = await questions.countAvailableQuestions(db, {
        type: entry.type,
        subject: input.subject || undefined,
        categoryIds: input.categoryIds.length > 0 ? input.categoryIds : undefined,
        knowledgePoints: input.knowledgePoints.length > 0 ? input.knowledgePoints : undefined,
        difficulty: allocation.level,
      });
      if (available < allocation.count) {
        shortages.push(
          `${typeLabel(entry.type)}${allocation.level ? `（难度 ${allocation.level}）` : ''}不足：需要 ${allocation.count} 道，可用 ${available} 道`,
        );
        continue;
      }
      const batch = await questions.pickRandomQuestions(db, {
        type: entry.type,
        subject: input.subject || undefined,
        categoryIds: input.categoryIds.length > 0 ? input.categoryIds : undefined,
        knowledgePoints: input.knowledgePoints.length > 0 ? input.knowledgePoints : undefined,
        difficulty: allocation.level,
        count: allocation.count,
        excludeIds: Array.from(seen),
      });
      for (const question of batch) {
        if (seen.has(question.id)) continue;
        seen.add(question.id);
        picks.push({ question, score: typeScore[entry.type] });
      }
    }
  }

  return { picks, shortages };
}

function allocateByWeights(total: number, weights: Array<{ level: number; weight: number }>): Array<{ level: number; count: number }> {
  const weightSum = weights.reduce((sum, item) => sum + item.weight, 0);
  if (weightSum <= 0) return [{ level: weights[0]?.level ?? 1, count: total }];
  const raw = weights.map((item) => ({ level: item.level, exact: (total * item.weight) / weightSum }));
  const floored = raw.map((item) => ({ level: item.level, count: Math.floor(item.exact), exact: item.exact }));
  let remainder = total - floored.reduce((sum, item) => sum + item.count, 0);
  const sorted = [...floored].sort((a, b) => (b.exact % 1) - (a.exact % 1));
  for (const item of sorted) {
    if (remainder <= 0) break;
    item.count += 1;
    remainder -= 1;
  }
  return floored.map((item) => ({ level: item.level, count: item.count }));
}

function typeLabel(type: QuestionType): string {
  return type === 'single' ? '单选题' : type === 'multiple' ? '多选题' : '判断题';
}

export async function adminCreateExam(
  db: D1Database,
  adminId: string,
  payload: unknown,
  ipHash: string | null,
): Promise<examRepo.ExamRecord> {
  const input = validateExamInput(payload);
  const totalScore = examTotalScore(input);
  const examId = newId('ex');
  const plan = await planExamQuestions(db, input);
  if (plan.picks.length !== expectedCount(input)) {
    throw ApiError.badRequest('题库中可用题目不足，考试未创建', {
      shortages: plan.shortages.length > 0 ? plan.shortages : ['可用题目不足，请放宽筛选条件或减少题目数量'],
    });
  }
  const now = nowMs();
  await examRepo.insertExam(db, {
    id: examId,
    title: input.title,
    description: input.description,
    subject: input.subject || null,
    categoryIds: input.categoryIds,
    knowledgePoints: input.knowledgePoints,
    typeCounts: input.typeCounts,
    difficultyCounts: input.difficultyCounts,
    totalQuestions: plan.picks.length,
    totalScore,
    scoreSingle: input.scoreSingle,
    scoreMultiple: input.scoreMultiple,
    scoreBoolean: input.scoreBoolean,
    durationMinutes: input.durationMinutes,
    allowEarlySubmit: input.allowEarlySubmit,
    allowReview: input.allowReview,
    startAt: input.startAt,
    endAt: input.endAt,
    allowRetake: input.allowRetake,
    status: input.status,
    createdBy: adminId,
    now,
  });
  await examRepo.createExamSet(db, {
    id: newId('es'),
    examId,
    version: 1,
    questions: plan.picks.map((pick, index) => ({
      id: newId('eq'),
      questionId: pick.question.id,
      position: index + 1,
      type: pick.question.type,
      score: pick.score,
      snapshot: pick.question,
    })),
    totalScore,
    now,
  });
  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'exam.create',
    targetType: 'exam',
    targetId: examId,
    detail: { title: input.title, questions: plan.picks.length, totalScore },
    ipHash,
    now,
  });
  const exam = await examRepo.findExamById(db, examId);
  if (!exam) throw ApiError.internal('考试创建失败');
  return exam;
}

export async function adminUpdateExam(
  db: D1Database,
  adminId: string,
  examId: string,
  payload: unknown,
  ipHash: string | null,
): Promise<examRepo.ExamRecord> {
  const existing = await examRepo.findExamById(db, examId);
  if (!existing) throw ApiError.notFound('考试不存在');
  const input = validateExamInput(payload);
  const totalScore = examTotalScore(input);
  const now = nowMs();

  const selectionChanged =
    existing.totalQuestions !== expectedCount(input) ||
    existing.subject !== (input.subject || null) ||
    JSON.stringify(existing.categoryIds) !== JSON.stringify(input.categoryIds) ||
    JSON.stringify(existing.knowledgePoints) !== JSON.stringify(input.knowledgePoints) ||
    JSON.stringify(existing.typeCounts) !== JSON.stringify(input.typeCounts) ||
    JSON.stringify(existing.difficultyCounts) !== JSON.stringify(input.difficultyCounts);

  // 先抽题校验，题目不足时不做任何写入，避免配置已改但试卷未更新
  let plan: Awaited<ReturnType<typeof planExamQuestions>> | null = null;
  if (selectionChanged) {
    plan = await planExamQuestions(db, input);
    if (plan.picks.length !== expectedCount(input)) {
      throw ApiError.badRequest('题库中可用题目不足，题目范围未变更', {
        shortages: plan.shortages.length > 0 ? plan.shortages : ['可用题目不足'],
      });
    }
  }

  await examRepo.updateExamRecord(
    db,
    examId,
    {
      title: input.title,
      description: input.description,
      subject: input.subject || null,
      categoryIds: input.categoryIds,
      knowledgePoints: input.knowledgePoints,
      typeCounts: input.typeCounts,
      difficultyCounts: input.difficultyCounts,
      totalQuestions: selectionChanged ? expectedCount(input) : existing.totalQuestions,
      totalScore,
      scoreSingle: input.scoreSingle,
      scoreMultiple: input.scoreMultiple,
      scoreBoolean: input.scoreBoolean,
      durationMinutes: input.durationMinutes,
      allowEarlySubmit: input.allowEarlySubmit,
      allowReview: input.allowReview,
      startAt: input.startAt,
      endAt: input.endAt,
      allowRetake: input.allowRetake,
      status: input.status,
    },
    now,
  );

  if (selectionChanged && plan) {
    const version = (await examRepo.maxSetVersion(db, examId)) + 1;
    await examRepo.createExamSet(db, {
      id: newId('es'),
      examId,
      version,
      questions: plan.picks.map((pick, index) => ({
        id: newId('eq'),
        questionId: pick.question.id,
        position: index + 1,
        type: pick.question.type,
        score: pick.score,
        snapshot: pick.question,
      })),
      totalScore,
      now,
    });
  } else {
    // 仅修改分值等配置时，保持题目不变，但需要同步更新新版本的分值
    const set = await examRepo.listExamSetQuestions(db, existing.activeSetId ?? '');
    if (set.length > 0) {
      const statements = set.map((item) =>
        db.prepare('UPDATE exam_questions SET score = ? WHERE id = ?').bind(
          item.type === 'single' ? input.scoreSingle : item.type === 'multiple' ? input.scoreMultiple : input.scoreBoolean,
          item.id,
        ),
      );
      for (let i = 0; i < statements.length; i += 40) {
        await db.batch(statements.slice(i, i + 40));
      }
      if (existing.activeSetId) {
        await db
          .prepare('UPDATE exam_question_sets SET total_score = ? WHERE id = ?')
          .bind(totalScore, existing.activeSetId)
          .run();
      }
    }
  }

  await writeAudit(db, {
    id: newId('log'),
    adminId,
    action: 'exam.update',
    targetType: 'exam',
    targetId: examId,
    detail: { title: input.title, selectionChanged },
    ipHash,
    now,
  });
  const updated = await examRepo.findExamById(db, examId);
  if (!updated) throw ApiError.internal('考试更新失败');
  return updated;
}

function expectedCount(input: ExamInput): number {
  return input.typeCounts.single + input.typeCounts.multiple + input.typeCounts.boolean;
}

// ---------------------------------------------------------------------------
// 学生端
// ---------------------------------------------------------------------------

export interface PaperQuestion {
  id: string;
  questionId: string;
  position: number;
  type: QuestionType;
  stem: string;
  options: Array<{ key: string; text: string }>;
  score: number;
  knowledgePoints: string[];
  userAnswer: string[];
  flagged: boolean;
  answered: boolean;
}

export interface ExamPaper {
  attempt: {
    id: string;
    examId: string;
    status: string;
    startedAt: number;
    deadlineAt: number;
    submittedAt: number | null;
    autoSubmitted: boolean;
    score: number | null;
    totalScore: number;
  };
  exam: {
    id: string;
    title: string;
    description: string;
    durationMinutes: number;
    allowEarlySubmit: boolean;
    allowReview: string;
    totalScore: number;
    startAt: number | null;
    endAt: number | null;
    allowRetake: boolean;
  };
  questions: PaperQuestion[];
  serverTime: number;
  remainingSeconds: number;
}

export async function ensureExamAvailableNow(exam: examRepo.ExamRecord, now: number): Promise<void> {
  if (exam.status !== 'published') throw ApiError.forbidden('考试尚未发布');
  if (exam.startAt && now < exam.startAt) throw ApiError.forbidden('考试尚未开放');
  if (exam.endAt && now > exam.endAt) throw ApiError.forbidden('考试已结束');
}

export async function startExamAttempt(
  db: D1Database,
  user: AuthUser,
  examId: string,
): Promise<ExamPaper> {
  const exam = await examRepo.findExamById(db, examId);
  if (!exam) throw ApiError.notFound('考试不存在');
  const now = nowMs();
  await ensureExamAvailableNow(exam, now);

  const open = await examRepo.findOpenAttempt(db, user.id, examId);
  if (open) {
    if (now >= open.deadlineAt) {
      await finalizeAttempt(db, user, open.id, true);
    } else {
      return buildPaper(db, open, exam);
    }
  }

  const submitted = await examRepo.countSubmittedAttempts(db, user.id, examId);
  if (submitted > 0 && !exam.allowRetake) throw ApiError.conflict('该考试不允许重复参加');

  if (!exam.activeSetId) throw ApiError.conflict('考试试卷尚未生成，请联系管理员');
  const setQuestions = await examRepo.listExamSetQuestions(db, exam.activeSetId);
  if (setQuestions.length === 0) throw ApiError.conflict('考试试卷为空，请联系管理员');

  const durationMs = exam.durationMinutes * 60_000;
  let deadline = now + durationMs;
  if (exam.endAt && deadline > exam.endAt) deadline = exam.endAt;
  const attemptId = newId('ea');
  await examRepo.insertAttempt(db, {
    id: attemptId,
    examId,
    setId: exam.activeSetId,
    userId: user.id,
    startedAt: now,
    deadlineAt: deadline,
    totalScore: exam.totalScore,
    now,
  });
  const attempt = await examRepo.findAttempt(db, attemptId);
  if (!attempt) throw ApiError.internal('考试创建失败');
  return buildPaper(db, attempt, exam);
}

export async function getExamPaper(db: D1Database, user: AuthUser, attemptId: string): Promise<ExamPaper> {
  const attempt = await examRepo.findAttempt(db, attemptId);
  if (!attempt || attempt.userId !== user.id) throw ApiError.notFound('考试记录不存在');
  const exam = await examRepo.findExamById(db, attempt.examId);
  if (!exam) throw ApiError.notFound('考试不存在');
  if (attempt.status !== 'in_progress') throw ApiError.conflict('考试已交卷，请查看成绩');
  if (nowMs() >= attempt.deadlineAt) {
    await finalizeAttempt(db, user, attempt.id, true);
    throw ApiError.conflict('考试时间已到，系统已自动交卷');
  }
  return buildPaper(db, attempt, exam);
}

async function buildPaper(
  db: D1Database,
  attempt: examRepo.AttemptRecord,
  exam: examRepo.ExamRecord,
): Promise<ExamPaper> {
  const [setQuestions, answers] = await Promise.all([
    examRepo.listExamSetQuestions(db, attempt.setId),
    examRepo.listAttemptAnswers(db, attempt.id),
  ]);
  const answerMap = new Map(answers.map((item) => [item.examQuestionId, item]));
  const now = nowMs();
  return {
    attempt: {
      id: attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      autoSubmitted: attempt.autoSubmitted,
      score: attempt.score,
      totalScore: attempt.totalScore,
    },
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      durationMinutes: exam.durationMinutes,
      allowEarlySubmit: exam.allowEarlySubmit,
      allowReview: exam.allowReview,
      totalScore: exam.totalScore,
      startAt: exam.startAt,
      endAt: exam.endAt,
      allowRetake: exam.allowRetake,
    },
    questions: setQuestions.map((item) => {
      const saved = answerMap.get(item.id);
      const userAnswer = saved?.userAnswer ?? [];
      return {
        id: item.id,
        questionId: item.questionId,
        position: item.position,
        type: item.snapshot.type,
        stem: item.snapshot.stem,
        options: item.snapshot.options,
        score: item.score,
        knowledgePoints: item.snapshot.knowledgePoints,
        userAnswer,
        flagged: saved?.flagged ?? false,
        answered: userAnswer.length > 0,
      };
    }),
    serverTime: now,
    remainingSeconds: Math.max(0, Math.floor((attempt.deadlineAt - now) / 1000)),
  };
}

export interface SaveAnswerOutcome {
  saved: boolean;
  autoSubmitted: boolean;
  remainingSeconds: number;
  result?: AttemptResultResponse;
}

export async function saveExamAnswer(
  db: D1Database,
  user: AuthUser,
  attemptId: string,
  examQuestionId: string,
  payload: { answer: unknown; flagged?: boolean },
): Promise<SaveAnswerOutcome> {
  const attempt = await examRepo.findAttempt(db, attemptId);
  if (!attempt || attempt.userId !== user.id) throw ApiError.notFound('考试记录不存在');
  if (attempt.status !== 'in_progress') throw ApiError.conflict('考试已交卷');

  const now = nowMs();
  if (now >= attempt.deadlineAt) {
    const result = await finalizeAttempt(db, user, attempt.id, true);
    return { saved: false, autoSubmitted: true, remainingSeconds: 0, result };
  }

  const setQuestions = await examRepo.listExamSetQuestions(db, attempt.setId);
  const target = setQuestions.find((item) => item.id === examQuestionId || item.questionId === examQuestionId);
  if (!target) throw ApiError.badRequest('题目不属于本场考试');

  const answer = normalizeAnswerForSave(target.type, payload.answer);
  if (answer.invalid) throw ApiError.badRequest('答案格式不正确');

  await examRepo.saveExamAnswer(db, {
    id: newId('ea'),
    attemptId: attempt.id,
    examQuestionId: target.id,
    questionId: target.questionId,
    userAnswer: answer.value,
    flagged: Boolean(payload.flagged),
    now,
  });

  return {
    saved: true,
    autoSubmitted: false,
    remainingSeconds: Math.max(0, Math.floor((attempt.deadlineAt - now) / 1000)),
  };
}

function normalizeAnswerForSave(type: string, value: unknown): { value: string[]; invalid: boolean } {
  if (type === 'boolean') {
    // 前端统一提交数组（如 ["true"]）；同时兼容标量 true/false、中文“正确/错误”和数字 1/0。
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      return { value: [], invalid: false };
    }
    const normalized = normalizeBooleanAnswer(value);
    if (!normalized) return { value: [], invalid: true };
    return { value: normalized, invalid: false };
  }
  if (value === undefined || value === null || value === '') return { value: [], invalid: false };
  const list = Array.isArray(value) ? value : String(value).split(/[,，|]/);
  const normalized = Array.from(
    new Set(list.map((item) => String(item).trim().toUpperCase()).filter((item) => /^[A-H]$/.test(item))),
  ).sort();
  return { value: normalized, invalid: false };
}

export interface AttemptResultResponse {
  attempt: {
    id: string;
    examId: string;
    examTitle: string;
    status: string;
    startedAt: number;
    submittedAt: number | null;
    autoSubmitted: boolean;
    score: number;
    totalScore: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    durationSeconds: number;
  };
  reviewAllowed: boolean;
  summary: {
    byType: Record<string, { total: number; correct: number; score: number; maxScore: number }>;
    knowledge: Array<{ point: string; total: number; correct: number; accuracy: number }>;
  };
  questions: Array<{
    examQuestionId: string;
    questionId: string;
    position: number;
    type: QuestionType;
    stem: string;
    options: Array<{ key: string; text: string }>;
    userAnswer: string[];
    isCorrect: boolean;
    answered: boolean;
    score: number;
    maxScore: number;
    flagged: boolean;
    correctAnswer: string[] | null;
    explanation: string | null;
  }>;
}

interface StoredResultDetail {
  byType: Record<string, { total: number; correct: number; score: number; maxScore: number }>;
  knowledge: Array<{ point: string; total: number; correct: number }>;
  questions: Array<{
    examQuestionId: string;
    questionId: string;
    position: number;
    type: QuestionType;
    stem: string;
    options: Array<{ key: string; text: string }>;
    userAnswer: string[];
    isCorrect: boolean;
    answered: boolean;
    score: number;
    maxScore: number;
    flagged: boolean;
    correctAnswer: string[];
    explanation: string;
  }>;
}

export async function submitExamAttempt(
  db: D1Database,
  user: AuthUser,
  attemptId: string,
): Promise<AttemptResultResponse> {
  const attempt = await examRepo.findAttempt(db, attemptId);
  if (!attempt || attempt.userId !== user.id) throw ApiError.notFound('考试记录不存在');
  if (attempt.status !== 'in_progress') return getAttemptResult(db, user, attemptId);
  const exam = await examRepo.findExamById(db, attempt.examId);
  if (!exam) throw ApiError.notFound('考试不存在');
  if (!exam.allowEarlySubmit && nowMs() < attempt.deadlineAt) {
    throw ApiError.forbidden('本场考试不允许提前交卷');
  }
  return finalizeAttempt(db, user, attempt.id, false);
}

async function finalizeAttempt(
  db: D1Database,
  user: AuthUser,
  attemptId: string,
  autoSubmitted: boolean,
): Promise<AttemptResultResponse> {
  const attempt = await examRepo.findAttempt(db, attemptId);
  if (!attempt || attempt.userId !== user.id) throw ApiError.notFound('考试记录不存在');
  if (attempt.status !== 'in_progress') return getAttemptResult(db, user, attemptId);

  const [setQuestions, savedAnswers] = await Promise.all([
    examRepo.listExamSetQuestions(db, attempt.setId),
    examRepo.listAttemptAnswers(db, attempt.id),
  ]);
  const answerMap = new Map(savedAnswers.map((item) => [item.examQuestionId, item]));

  const byType: StoredResultDetail['byType'] = {};
  const knowledgeMap = new Map<string, { total: number; correct: number }>();
  const resultQuestions: StoredResultDetail['questions'] = [];
  const grades: Array<{ examQuestionId: string; isCorrect: boolean; score: number }> = [];
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  for (const item of setQuestions) {
    const saved = answerMap.get(item.id);
    const userAnswer = saved?.userAnswer ?? [];
    const answered = userAnswer.length > 0;
    const isCorrect = answered && gradeAnswer(item.snapshot.type, item.snapshot.answer, userAnswer);
    const gained = isCorrect ? item.score : 0;
    if (!answered) unansweredCount += 1;
    else if (isCorrect) correctCount += 1;
    else wrongCount += 1;
    score += gained;
    if (saved) grades.push({ examQuestionId: item.id, isCorrect, score: gained });

    const typeStat = byType[item.type] ?? { total: 0, correct: 0, score: 0, maxScore: 0 };
    typeStat.total += 1;
    typeStat.maxScore += item.score;
    typeStat.score += gained;
    if (isCorrect) typeStat.correct += 1;
    byType[item.type] = typeStat;

    const points = item.snapshot.knowledgePoints.length > 0 ? item.snapshot.knowledgePoints : ['未标注知识点'];
    for (const point of points) {
      const stat = knowledgeMap.get(point) ?? { total: 0, correct: 0 };
      stat.total += 1;
      if (isCorrect) stat.correct += 1;
      knowledgeMap.set(point, stat);
    }

    resultQuestions.push({
      examQuestionId: item.id,
      questionId: item.questionId,
      position: item.position,
      type: item.snapshot.type,
      stem: item.snapshot.stem,
      options: item.snapshot.options,
      userAnswer,
      isCorrect,
      answered,
      score: gained,
      maxScore: item.score,
      flagged: saved?.flagged ?? false,
      correctAnswer: item.snapshot.answer,
      explanation: item.snapshot.explanation,
    });
  }

  if (grades.length > 0) await examRepo.finalizeAttemptGrades(db, attempt.id, grades);

  const submittedAt = nowMs();
  const durationSeconds = secondsBetween(attempt.startedAt, submittedAt);
  const detail: StoredResultDetail = {
    byType,
    knowledge: Array.from(knowledgeMap.entries()).map(([point, stat]) => ({ point, ...stat })),
    questions: resultQuestions,
  };
  const updated = await examRepo.markAttemptSubmitted(db, {
    id: attempt.id,
    score,
    correctCount,
    wrongCount,
    unansweredCount,
    durationSeconds,
    submittedAt,
    autoSubmitted,
    resultDetail: detail,
  });
  if (!updated) {
    // 并发交卷：直接返回先落库的结果，避免重复计分
    return getAttemptResult(db, user, attempt.id);
  }
  return getAttemptResult(db, user, attempt.id);
}

export async function getAttemptResult(
  db: D1Database,
  user: AuthUser,
  attemptId: string,
): Promise<AttemptResultResponse> {
  const attempt = await examRepo.findAttempt(db, attemptId);
  if (!attempt || attempt.userId !== user.id) throw ApiError.notFound('考试记录不存在');
  if (attempt.status === 'in_progress') throw ApiError.conflict('考试尚未交卷');
  const exam = await examRepo.findExamById(db, attempt.examId);
  if (!exam) throw ApiError.notFound('考试不存在');
  const detail = attempt.resultDetail ? (JSON.parse(attempt.resultDetail) as StoredResultDetail) : null;
  if (!detail) throw ApiError.internal('考试结果数据缺失');

  const reviewAllowed =
    exam.allowReview === 'after_submit' ||
    (exam.allowReview === 'after_end' && exam.endAt !== null && nowMs() >= exam.endAt);

  return {
    attempt: {
      id: attempt.id,
      examId: attempt.examId,
      examTitle: exam.title,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      autoSubmitted: attempt.autoSubmitted,
      score: attempt.score ?? 0,
      totalScore: attempt.totalScore,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      unansweredCount: attempt.unansweredCount,
      durationSeconds: attempt.durationSeconds ?? 0,
    },
    reviewAllowed,
    summary: {
      byType: detail.byType,
      knowledge: detail.knowledge.map((item) => ({
        point: item.point,
        total: item.total,
        correct: item.correct,
        accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 10000) / 100 : 0,
      })),
    },
    questions: detail.questions.map((item) => ({
      examQuestionId: item.examQuestionId,
      questionId: item.questionId,
      position: item.position,
      type: item.type,
      stem: item.stem,
      options: item.options,
      userAnswer: item.userAnswer,
      isCorrect: item.isCorrect,
      answered: item.answered,
      score: item.score,
      maxScore: item.maxScore,
      flagged: item.flagged,
      correctAnswer: reviewAllowed ? item.correctAnswer : null,
      explanation: reviewAllowed ? item.explanation : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// 管理端查询
// ---------------------------------------------------------------------------

export async function exportExamResultsCsv(
  db: D1Database,
  examId: string,
): Promise<{ content: string; filename: string; count: number }> {
  const exam = await examRepo.findExamById(db, examId);
  if (!exam) throw ApiError.notFound('考试不存在');
  const results = await examRepo.listExamResults(db, examId);
  const rows: Array<Array<string | number>> = [
    ['用户名', '得分', '总分', '正确', '错误', '未答', '用时(秒)', '交卷时间', '自动交卷'],
  ];
  for (const item of results) {
    rows.push([
      item.username,
      item.score,
      item.totalScore,
      item.correctCount,
      item.wrongCount,
      item.unansweredCount,
      item.durationSeconds ?? 0,
      item.submittedAt ? new Date(item.submittedAt).toISOString() : '',
      item.autoSubmitted ? '是' : '否',
    ]);
  }
  return {
    content: toCsv(rows),
    filename: `exam-results-${examId}.csv`,
    count: results.length,
  };
}
