import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { jsonOk, paginationMeta } from '../utils/response.ts';
import { readJsonBody } from '../utils/http.ts';
import { readPagination } from '../validators/common.ts';
import {
  getAttemptResult,
  getExamPaper,
  saveExamAnswer,
  startExamAttempt,
  submitExamAttempt,
} from '../services/exam-service.ts';
import { findExamById, listExams, listUserAttempts } from '../repositories/exam-repo.ts';
import { nowMs } from '../utils/time.ts';
import type { RequestContext } from '../types/env.ts';

function requiredUser(ctx: RequestContext) {
  if (!ctx.user) throw ApiError.unauthorized();
  return ctx.user;
}

export function registerExamRoutes(router: Router): void {
  router.get('/api/v1/exams', async (ctx) => {
    requiredUser(ctx);
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listExams(ctx.env.DB, {
      includeDrafts: false,
      subject: ctx.url.searchParams.get('subject') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
      now: nowMs(),
    });
    const items = result.items.map((exam) => ({
      id: exam.id,
      title: exam.title,
      description: exam.description,
      subject: exam.subject,
      totalQuestions: exam.totalQuestions,
      totalScore: exam.totalScore,
      durationMinutes: exam.durationMinutes,
      startAt: exam.startAt,
      endAt: exam.endAt,
      allowRetake: exam.allowRetake,
      allowReview: exam.allowReview,
      attemptCount: exam.attemptCount,
    }));
    return jsonOk(items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true });

  router.get('/api/v1/exams/:id', async (ctx) => {
    const user = requiredUser(ctx);
    const exam = await findExamById(ctx.env.DB, ctx.params.id);
    if (!exam || exam.status !== 'published') throw ApiError.notFound('考试不存在或未发布');
    const attempts = await listUserAttempts(ctx.env.DB, user.id, exam.id);
    const finished = attempts.filter((item) => item.status !== 'in_progress');
    const open = attempts.find((item) => item.status === 'in_progress');
    const now = nowMs();
    const beforeStart = Boolean(exam.startAt && now < exam.startAt);
    const afterEnd = Boolean(exam.endAt && now < exam.endAt ? false : exam.endAt && now > exam.endAt);
    const canStart = !beforeStart && !afterEnd && (Boolean(open) || exam.allowRetake || finished.length === 0);
    return jsonOk({
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        subject: exam.subject,
        totalQuestions: exam.totalQuestions,
        totalScore: exam.totalScore,
        scoreSingle: exam.scoreSingle,
        scoreMultiple: exam.scoreMultiple,
        scoreBoolean: exam.scoreBoolean,
        durationMinutes: exam.durationMinutes,
        allowEarlySubmit: exam.allowEarlySubmit,
        allowReview: exam.allowReview,
        startAt: exam.startAt,
        endAt: exam.endAt,
        allowRetake: exam.allowRetake,
        typeCounts: exam.typeCounts,
      },
      attempts: attempts.map((item) => ({
        id: item.id,
        status: item.status,
        startedAt: item.startedAt,
        submittedAt: item.submittedAt,
        score: item.score,
        totalScore: item.totalScore,
        autoSubmitted: item.autoSubmitted,
      })),
      openAttemptId: open?.id ?? null,
      canStart,
      blockedReason: beforeStart ? '考试尚未开放' : afterEnd ? '考试已结束' : !canStart ? '该考试不允许重复参加' : null,
      serverTime: now,
    });
  }, { auth: true });

  router.post('/api/v1/exams/:id/start', async (ctx) => {
    const user = requiredUser(ctx);
    const paper = await startExamAttempt(ctx.env.DB, user, ctx.params.id);
    return jsonOk(paper, {}, 201);
  }, { auth: true, rateLimit: { key: 'exam-start', limit: 15, windowSeconds: 60 } });

  router.get('/api/v1/exam-attempts', async (ctx) => {
    const user = requiredUser(ctx);
    const attempts = await listUserAttempts(ctx.env.DB, user.id, ctx.url.searchParams.get('examId') ?? undefined);
    return jsonOk(
      attempts.map((item) => ({
        id: item.id,
        examId: item.examId,
        examTitle: item.examTitle,
        status: item.status,
        startedAt: item.startedAt,
        submittedAt: item.submittedAt,
        score: item.score,
        totalScore: item.totalScore,
        autoSubmitted: item.autoSubmitted,
        correctCount: item.correctCount,
        wrongCount: item.wrongCount,
        unansweredCount: item.unansweredCount,
        durationSeconds: item.durationSeconds,
      })),
    );
  }, { auth: true });

  router.get('/api/v1/exam-attempts/:id', async (ctx) => {
    const user = requiredUser(ctx);
    const paper = await getExamPaper(ctx.env.DB, user, ctx.params.id);
    return jsonOk(paper);
  }, { auth: true });

  router.put('/api/v1/exam-attempts/:id/answers/:questionId', async (ctx) => {
    const user = requiredUser(ctx);
    const body = await readJsonBody<{ answer?: unknown; flagged?: unknown }>(ctx.req, 10_000);
    const outcome = await saveExamAnswer(ctx.env.DB, user, ctx.params.id, ctx.params.questionId, {
      answer: body.answer,
      flagged: Boolean(body.flagged),
    });
    return jsonOk(outcome);
  }, { auth: true, rateLimit: { key: 'exam-save', limit: 600, windowSeconds: 60 } });

  router.post('/api/v1/exam-attempts/:id/submit', async (ctx) => {
    const user = requiredUser(ctx);
    const result = await submitExamAttempt(ctx.env.DB, user, ctx.params.id);
    return jsonOk(result);
  }, { auth: true, rateLimit: { key: 'exam-submit', limit: 20, windowSeconds: 60 } });

  router.get('/api/v1/exam-attempts/:id/result', async (ctx) => {
    const user = requiredUser(ctx);
    const result = await getAttemptResult(ctx.env.DB, user, ctx.params.id);
    return jsonOk(result);
  }, { auth: true });
}
