import { newId } from '../utils/id.ts';

export type AiHelpContext = 'practice' | 'exam' | 'other';

export interface AiHelpInput {
  userId: string;
  questionId: string;
  context: AiHelpContext;
  attemptId?: string | null;
  sessionId?: string | null;
  now: number;
}

/** 记录「学生用了 AI 讲解」这件事，作为错题本/考试不计分的依据。 */
export async function recordAiHelp(db: D1Database, input: AiHelpInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_help_records (id, user_id, question_id, context, attempt_id, session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId('aih'),
      input.userId,
      input.questionId,
      input.context,
      input.attemptId ?? null,
      input.sessionId ?? null,
      input.now,
    )
    .run();
}

/** 某场考试里用过 AI 讲解的题目集合 */
export async function aiHelpQuestionIdsForAttempt(db: D1Database, attemptId: string): Promise<Set<string>> {
  const rows = await db
    .prepare('SELECT DISTINCT question_id FROM ai_help_records WHERE attempt_id = ?')
    .bind(attemptId)
    .all<{ question_id: string }>();
  return new Set((rows.results ?? []).map((row) => row.question_id));
}
