import type { Router } from '../router.ts';
import { ApiError } from '../utils/errors.ts';
import { readJsonBody } from '../utils/http.ts';
import { jsonOk } from '../utils/response.ts';
import { loadConfig } from '../utils/config.ts';
import { findQuestionById } from '../repositories/question-repo.ts';
import { findAttempt, listExamSetQuestions } from '../repositories/exam-repo.ts';
import { upsertWrongQuestion } from '../repositories/practice-repo.ts';
import { recordAiHelp } from '../repositories/ai-help-repo.ts';
import { explain } from '../services/ai-explain-service.ts';
import { nowMs } from '../utils/time.ts';
import { newId } from '../utils/id.ts';

function normalizeAnswer(value: unknown): string[] | undefined {
  if (typeof value === 'string') return value.trim() ? [value.trim().toUpperCase()] : undefined;
  if (Array.isArray(value)) {
    const list = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    return list.length ? list : undefined;
  }
  return undefined;
}

export function registerAiExplainRoutes(router: Router): void {
  // 学生端「让鲸鱼娘讲讲」：返回完整讲解文本（前端本地做打字机动画）
  router.post(
    '/api/v1/ai/explain',
    async (ctx) => {
      if (!ctx.user) throw ApiError.unauthorized();
      const config = loadConfig(ctx.env);
      if (!config.aiEnabled) throw ApiError.serviceUnavailable('AI 功能当前已关闭');

      const body = await readJsonBody<{
        questionId?: unknown;
        questionText?: unknown;
        userAnswer?: unknown;
        mode?: unknown;
        followUp?: unknown;
        context?: unknown;
        attemptId?: unknown;
        sessionId?: unknown;
      }>(ctx.req, 8_000);

      const questionText = typeof body.questionText === 'string' ? body.questionText.trim().slice(0, 500) : '';
      const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
      if (!questionId && !questionText) throw ApiError.badRequest('缺少题目 ID 或问题内容');

      const mode = body.mode === 'simpler' || body.mode === 'example' ? body.mode : 'explain';
      const followUp = typeof body.followUp === 'string' ? body.followUp.trim().slice(0, 300) : undefined;

      let question = null;
      if (questionId) {
        question = await findQuestionById(ctx.env.DB, questionId);
        if (!question || question.status !== 'published') throw ApiError.notFound('题目不存在或已下架');
      }

      // 规则：问过 AI 的题自动进错题本；考试中问 AI 则本题不计分（交卷时结算）
      let assist: 'wrongbook' | 'exam_void' = 'wrongbook';
      if (question) {
        const context = body.context === 'exam' ? 'exam' : body.context === 'practice' ? 'practice' : 'other';
        let attemptId: string | null = null;
        if (context === 'exam') {
          const rawAttemptId = typeof body.attemptId === 'string' ? body.attemptId.trim() : '';
          if (!rawAttemptId) throw ApiError.badRequest('考试中询问 AI 需要提供考试记录 ID');
          const attempt = await findAttempt(ctx.env.DB, rawAttemptId);
          if (!attempt || attempt.userId !== ctx.user.id) throw ApiError.notFound('考试记录不存在');
          if (attempt.status !== 'in_progress') throw ApiError.conflict('考试已结束，不能再使用 AI 讲解');
          const setQuestions = await listExamSetQuestions(ctx.env.DB, attempt.setId);
          if (!setQuestions.some((item) => item.questionId === questionId)) {
            throw ApiError.forbidden('该题不属于当前考试');
          }
          attemptId = attempt.id;
          assist = 'exam_void';
        }
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 64) : null;
        const now = nowMs();
        await recordAiHelp(ctx.env.DB, {
          userId: ctx.user.id,
          questionId,
          context,
          attemptId,
          sessionId: sessionId || null,
          now,
        });
        await upsertWrongQuestion(ctx.env.DB, {
          id: newId('wq'),
          userId: ctx.user.id,
          questionId,
          isCorrect: false,
          now,
        });
      }

      const { text, demo } = await explain(config, {
        question: question ?? undefined,
        questionText: question ? undefined : questionText,
        userAnswer: normalizeAnswer(body.userAnswer),
        mode,
        followUp,
      });

      return jsonOk({ text, demo, assist: question ? assist : 'none' });
    },
    { auth: true, rateLimit: { key: 'ai-explain', limit: 20, windowSeconds: 60 } },
  );
}
