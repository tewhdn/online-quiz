import type { Router } from '../../router.ts';
import { ApiError } from '../../utils/errors.ts';
import { jsonOk } from '../../utils/response.ts';
import { readJsonBody } from '../../utils/http.ts';
import { asRecord, readBoolean, readEnum, readString } from '../../validators/common.ts';
import {
  createAnnouncement,
  deleteAnnouncement,
  findAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  writeAudit,
} from '../../repositories/content-repo.ts';
import { newId } from '../../utils/id.ts';
import { nowMs } from '../../utils/time.ts';

function parseAnnouncement(raw: unknown) {
  const body = asRecord(raw);
  return {
    title: readString(body, 'title', { required: true, min: 2, max: 100, label: '公告标题' }),
    content: readString(body, 'content', { required: true, min: 1, max: 10_000, label: '公告内容' }),
    status: readEnum(body, 'status', ['draft', 'published'] as const, { fallback: 'draft', label: '状态' }),
    pinned: readBoolean(body, 'pinned', false),
  };
}

export function registerAdminAnnouncementRoutes(router: Router): void {
  router.get('/api/v1/admin/announcements', async (ctx) => {
    const announcements = await listAnnouncements(ctx.env.DB, { includeDrafts: true, limit: 100 });
    return jsonOk(announcements);
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/announcements', async (ctx) => {
    const input = parseAnnouncement(await readJsonBody<unknown>(ctx.req, 50_000));
    const created = await createAnnouncement(ctx.env.DB, {
      id: newId('ann'),
      ...input,
      createdBy: ctx.user!.id,
      now: nowMs(),
    });
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'announcement.create',
      targetType: 'announcement',
      targetId: created.id,
      detail: { title: input.title, status: input.status },
      ipHash: ctx.ipHash ?? null,
      now: nowMs(),
    });
    return jsonOk(created, {}, 201);
  }, { auth: true, admin: true });

  router.put('/api/v1/admin/announcements/:id', async (ctx) => {
    const existing = await findAnnouncement(ctx.env.DB, ctx.params.id);
    if (!existing) throw ApiError.notFound('公告不存在');
    const input = parseAnnouncement(await readJsonBody<unknown>(ctx.req, 50_000));
    await updateAnnouncement(ctx.env.DB, ctx.params.id, input, nowMs());
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'announcement.update',
      targetType: 'announcement',
      targetId: ctx.params.id,
      detail: { title: input.title, status: input.status },
      ipHash: ctx.ipHash ?? null,
      now: nowMs(),
    });
    return jsonOk({ id: ctx.params.id, updated: true });
  }, { auth: true, admin: true });

  router.delete('/api/v1/admin/announcements/:id', async (ctx) => {
    const existing = await findAnnouncement(ctx.env.DB, ctx.params.id);
    if (!existing) throw ApiError.notFound('公告不存在');
    await deleteAnnouncement(ctx.env.DB, ctx.params.id);
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'announcement.delete',
      targetType: 'announcement',
      targetId: ctx.params.id,
      detail: { title: existing.title },
      ipHash: ctx.ipHash ?? null,
      now: nowMs(),
    });
    return jsonOk({ id: ctx.params.id, deleted: true });
  }, { auth: true, admin: true });
}
