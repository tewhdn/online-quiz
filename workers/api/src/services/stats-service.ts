import { nowMs, startOfDay } from '../utils/time.ts';
import { questionStats } from '../repositories/question-repo.ts';
import { examDashboardStats } from '../repositories/exam-repo.ts';
import { aiUsageStats, countAiTasksSince, countRunningAiTasks } from '../repositories/ai-repo.ts';
import { listAuditLogs, getSetting } from '../repositories/content-repo.ts';
import type { AppConfig } from '../utils/config.ts';

export async function adminDashboard(db: D1Database, config: AppConfig) {
  const now = nowMs();
  const dayStart = startOfDay(now, config.tzOffset);
  const weekAgo = now - 7 * 86_400_000;

  const users = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled,
              SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_week
       FROM users WHERE status != 'deleted'`,
    )
    .bind(weekAgo)
    .first<{ total: number; active: number; disabled: number; new_week: number }>();

  const activeUsers = await db
    .prepare('SELECT COUNT(DISTINCT user_id) AS c FROM answer_records WHERE created_at >= ?')
    .bind(weekAgo)
    .first<{ c: number }>();

  const questions = await questionStats(db);
  const exams = await examDashboardStats(db);
  const ai = await aiUsageStats(db, now - 30 * 86_400_000);
  const aiToday = await countAiTasksSince(db, dayStart);
  const aiRunning = await countRunningAiTasks(db, now - 5 * 60_000);

  const todayAnswers = await db
    .prepare('SELECT COUNT(*) AS c FROM answer_records WHERE created_at >= ?')
    .bind(dayStart)
    .first<{ c: number }>();
  const todayAttempts = await db
    .prepare("SELECT COUNT(*) AS c FROM exam_attempts WHERE status = 'submitted' AND submitted_at >= ?")
    .bind(dayStart)
    .first<{ c: number }>();

  const audit = await listAuditLogs(db, { offset: 0, pageSize: 8 });
  const aiEnabled = (await getSetting(db, 'ai_enabled')) === 'true';
  const siteName = (await getSetting(db, 'site_name')) ?? '智能答题系统';

  return {
    siteName,
    aiEnabled,
    users: {
      total: users?.total ?? 0,
      active: users?.active ?? 0,
      disabled: users?.disabled ?? 0,
      newThisWeek: users?.new_week ?? 0,
      activeThisWeek: activeUsers?.c ?? 0,
    },
    questions,
    exams: {
      ...exams,
      todayAttempts: todayAttempts?.c ?? 0,
    },
    ai: {
      ...ai,
      todayTasks: aiToday,
      running: aiRunning,
    },
    answers: { today: todayAnswers?.c ?? 0 },
    recentLogs: audit.items,
  };
}
