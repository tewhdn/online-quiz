import type { Router } from '../../router.ts';
import { registerAdminUserRoutes } from './users.ts';
import { registerAdminInviteRoutes } from './invites.ts';
import { registerAdminQuestionRoutes } from './questions.ts';
import { registerAdminAiRoutes } from './ai.ts';
import { registerAdminExamRoutes } from './exams.ts';
import { registerAdminAnnouncementRoutes } from './announcements.ts';
import { registerAdminSystemRoutes } from './system.ts';

export function registerAdminRoutes(router: Router): void {
  registerAdminSystemRoutes(router);
  registerAdminUserRoutes(router);
  registerAdminInviteRoutes(router);
  registerAdminQuestionRoutes(router);
  registerAdminAiRoutes(router);
  registerAdminExamRoutes(router);
  registerAdminAnnouncementRoutes(router);
}
