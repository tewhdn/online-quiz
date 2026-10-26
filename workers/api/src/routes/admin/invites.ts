import type { Router } from '../../router.ts';
import { ApiError } from '../../utils/errors.ts';
import { jsonOk, paginationMeta } from '../../utils/response.ts';
import { readJsonBody } from '../../utils/http.ts';
import { readPagination, readInt, readString, asRecord } from '../../validators/common.ts';
import {
  createInvitation,
  disableInvitation,
  listInvitationUsages,
  listInvitations,
} from '../../repositories/invite-repo.ts';
import { generateInviteCode, hashInviteCode, maskInviteCode } from '../../utils/crypto.ts';
import { writeAudit } from '../../repositories/content-repo.ts';
import { newId } from '../../utils/id.ts';
import { nowMs } from '../../utils/time.ts';
import type { RequestContext } from '../../types/env.ts';

async function createOne(
  ctx: RequestContext,
  input: { maxUses: number; expiresAt: number | null; note: string },
): Promise<{ code: string; id: string }> {
  const code = generateInviteCode();
  const codeHash = await hashInviteCode(code);
  const id = newId('inv');
  const now = nowMs();
  await createInvitation(ctx.env.DB, {
    id,
    codeHash,
    codeMask: maskInviteCode(code),
    note: input.note || null,
    maxUses: input.maxUses,
    expiresAt: input.expiresAt,
    createdBy: ctx.user!.id,
    now,
  });
  return { code, id };
}

function parseOptions(raw: unknown): { maxUses: number; expiresAt: number | null; note: string } {
  const body = asRecord(raw);
  const maxUses = readInt(body, 'maxUses', { min: 1, max: 100, fallback: 1, label: '可注册次数' });
  const note = readString(body, 'note', { max: 100, label: '备注' });
  let expiresAt: number | null = null;
  const rawExpires = body.expiresAt;
  if (rawExpires !== undefined && rawExpires !== null && rawExpires !== '') {
    if (typeof rawExpires === 'number') expiresAt = rawExpires;
    else if (typeof rawExpires === 'string') {
      const parsed = Date.parse(rawExpires);
      if (!Number.isFinite(parsed)) throw ApiError.badRequest('过期时间格式不正确');
      expiresAt = parsed;
    }
    if (expiresAt !== null && expiresAt <= nowMs()) throw ApiError.badRequest('过期时间必须晚于当前时间');
  }
  return { maxUses, expiresAt, note };
}

export function registerAdminInviteRoutes(router: Router): void {
  router.get('/api/v1/admin/invites', async (ctx) => {
    const pagination = readPagination(ctx.url, 20, 100);
    const result = await listInvitations(ctx.env.DB, {
      status: ctx.url.searchParams.get('status') ?? undefined,
      offset: pagination.offset,
      pageSize: pagination.pageSize,
    });
    return jsonOk(result.items, { pagination: paginationMeta(pagination.page, pagination.pageSize, result.total) });
  }, { auth: true, admin: true });

  router.post('/api/v1/admin/invites', async (ctx) => {
    const body = await readJsonBody<unknown>(ctx.req, 5_000);
    const options = parseOptions(body);
    const created = await createOne(ctx, options);
    const now = nowMs();
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'invite.create',
      targetType: 'invitation',
      targetId: created.id,
      detail: { maxUses: options.maxUses, expiresAt: options.expiresAt },
      ipHash: ctx.ipHash ?? null,
      now,
    });
    return jsonOk(
      {
        id: created.id,
        code: created.code,
        maxUses: options.maxUses,
        expiresAt: options.expiresAt,
        notice: '邀请码只显示一次，请立即复制保存。系统只保存其哈希值。',
      },
      {},
      201,
    );
  }, { auth: true, admin: true, rateLimit: { key: 'invite-create', limit: 30, windowSeconds: 60 } });

  router.post('/api/v1/admin/invites/batch', async (ctx) => {
    const raw = await readJsonBody<unknown>(ctx.req, 10_000);
    const body = asRecord(raw);
    const count = readInt(body, 'count', { min: 1, max: 50, fallback: 5, label: '生成数量' });
    const options = parseOptions(raw);
    const codes: Array<{ id: string; code: string }> = [];
    for (let i = 0; i < count; i += 1) {
      codes.push(await createOne(ctx, options));
    }
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'invite.batch_create',
      targetType: 'invitation',
      detail: { count, maxUses: options.maxUses },
      ipHash: ctx.ipHash ?? null,
      now: nowMs(),
    });
    return jsonOk(
      {
        count: codes.length,
        codes: codes.map((item) => item.code),
        notice: '邀请码只显示一次，请立即复制保存。',
      },
      {},
      201,
    );
  }, { auth: true, admin: true, rateLimit: { key: 'invite-batch', limit: 10, windowSeconds: 60 } });

  router.post('/api/v1/admin/invites/:id/disable', async (ctx) => {
    const ok = await disableInvitation(ctx.env.DB, ctx.params.id);
    if (!ok) throw ApiError.notFound('邀请码不存在');
    await writeAudit(ctx.env.DB, {
      id: newId('log'),
      adminId: ctx.user!.id,
      action: 'invite.disable',
      targetType: 'invitation',
      targetId: ctx.params.id,
      detail: {},
      ipHash: ctx.ipHash ?? null,
      now: nowMs(),
    });
    return jsonOk({ id: ctx.params.id, status: 'disabled' });
  }, { auth: true, admin: true });

  router.get('/api/v1/admin/invites/:id/usages', async (ctx) => {
    const usages = await listInvitationUsages(ctx.env.DB, ctx.params.id);
    return jsonOk(usages);
  }, { auth: true, admin: true });
}
