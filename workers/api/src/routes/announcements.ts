import type { Router } from '../router.ts';
import { jsonOk } from '../utils/response.ts';
import { listAnnouncements } from '../repositories/content-repo.ts';

export function registerAnnouncementRoutes(router: Router): void {
  router.get('/api/v1/announcements', async (ctx) => {
    const announcements = await listAnnouncements(ctx.env.DB, { includeDrafts: false, limit: 10 });
    return jsonOk(
      announcements.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        pinned: item.pinned,
        publishedAt: item.publishedAt ?? item.createdAt,
      })),
    );
  }, { auth: true });
}
