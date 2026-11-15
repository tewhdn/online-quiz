import type { Router } from '../router.ts';
import { jsonOk } from '../utils/response.ts';
import { listAnnouncements } from '../repositories/content-repo.ts';
import { withEdgeCache } from '../utils/edge-cache.ts';

export function registerAnnouncementRoutes(router: Router): void {
  router.get('/api/v1/announcements', async (ctx) => {
    // 公告对所有用户一致：边缘缓存 30s，发布新公告最多延迟 30s 生效
    return withEdgeCache(ctx.req, ctx.execCtx, 30, async () => {
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
    });
  }, { auth: true });
}
