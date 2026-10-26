import type { Router } from '../../router.ts';
import { ApiError } from '../../utils/errors.ts';
import { fileResponse, jsonOk, paginationMeta } from '../../utils/response.ts';
import { readJsonBody } from '../../utils/http.ts';
import { readPagination, asRecord } from '../../validators/common.ts';
import { adminCreateExam, adminUpdateExam, exportExamResultsCsv } from '../../services/exam-service.ts';
import {
  findExamById,
  listExamResults,
  listExamSetQuestions,
  listExams,
  setExamStatus,
} from '../../repositories/exam-repo.ts';
import { writeAudit } from '../../repositories/content-repo.ts';
import { newId } from '../../utils/id.ts';
import { nowMs } from '../../utils/time.ts';

export function registerAdminExamRoutes(router: Router): void {
  router.get('/api/v1/admin/exams', async (ctx) => {
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listExams(ctx.env.DB, {
      includeDrafts: true,
      subject: ctx.url.searchParams.get('subject') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
      now: nowMs(),
    });
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/exams', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 50_000));
    const exam = await adminCreateExam(ctx.env.DB, ctx.user!.id, body, ctx.ipHash ?? null);
    return jsonOk(exam, {}, 201);
  }, { auth: true, admin: true, rateLimit: { key: 'admin-exam-create', limit: 20, windowSeconds: 60 } });

  router.get('/api/v1/admin/exams/:id', async (ctx) => {
    const exam = await findExamById(ctx.env.DB, ctx.params.id);
    if (!exam) throw ApiError.notFound('考试不存在');
    const setQuestions = exam.activeSetId ? await listExamSetQuestions(ctx.env.DB, exam.activeSetId) : [];
    return jsonOk({
      exam,
      questions: setQuestions.map((item) => ({
        examQuestionId: item.id,
        position: item.position,
        type: item.snapshot.type,
        score: item.score,
        stem: item.snapshot.stem,
        options: item.snapshot.options,
      })),
    });
  }, { auth: true, admin: true });

  router.put('/api/v1/admin/exams/:id', async (ctx) => {
    const body = asRecord(await readJsonBody<unknown>(ctx.req, 50_000));
    const exam = await adminUpdateExam(ctx.env.DB, ctx.user!.id, ctx.params.id, body, ctx.ipHash ?? null);
    return jsonOk(exam);
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/exams/:id/publish', async (ctx) => {
    const ok = await setExamStatus(ctx.env.DB, ctx.params.id, 'published', nowMs());
    if (!ok) throw ApiError.notFound('考试不存在');
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'exam.publish',
      targetType: 'exam',
      targetId: ctx.params.id,
      detail: {},
      ipHash: ctx.ipHash ?? null,
      now: nowMs(),
    });
    return jsonOk({ id: ctx.params.id, status: 'published' });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/exams/:id/close', async (ctx) => {
    const ok = await setExamStatus(ctx.env.DB, ctx.params.id, 'closed', nowMs());
    if (!ok) throw ApiError.notFound('考试不存在');
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'exam.close',
      targetType: 'exam',
      targetId: ctx.params.id,
      detail: {},
      ipHash: ctx.ipHash ?? null,
      now: nowMs(),
    });
    return jsonOk({ id: ctx.params.id, status: 'closed' });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/exams/:id/results', async (ctx) => {
    const exam = await findExamById(ctx.env.DB, ctx.params.id);
    if (!exam) throw ApiError.notFound('考试不存在');
    const results = await listExamResults(ctx.env.DB, exam.id);
    return jsonOk({ exam, results });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/exams/:id/results/export', async (ctx) => {
    const result = await exportExamResultsCsv(ctx.env.DB, ctx.params.id);
    return fileResponse(result.content, result.filename, 'text/csv');
  }, { auth: true, admin: true });
}
