/**
 * 公共只读接口的边缘缓存（Cloudflare Cache API）。
 *
 * 只用于「所有用户看到的内容都一样」的接口（站点配置、公告、筛选项）。
 * 用户相关的数据一律不进缓存；这些接口本身仍然需要登录，缓存键是完整 URL。
 *
 * 命中缓存时省掉一次 D1 查询和函数执行，延迟从 ~300ms 降到 ~10ms（边缘命中）。
 */
export async function withEdgeCache(
  request: Request,
  execCtx: ExecutionContext | undefined,
  ttlSeconds: number,
  produce: () => Promise<Response>,
): Promise<Response> {
  // Node 本地开发运行时没有 caches 全局，降级为直连处理
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!cache || !execCtx || request.method !== 'GET') return produce();

  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    const response = new Response(hit.body, hit);
    response.headers.set('X-Edge-Cache', 'HIT');
    return response;
  }

  const fresh = await produce();
  if (fresh.status !== 200) return fresh;

  const forCache = new Response(fresh.clone().body, fresh);
  forCache.headers.set('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
  execCtx.waitUntil(cache.put(key, forCache).catch(() => undefined));

  const response = new Response(fresh.body, fresh);
  response.headers.set('X-Edge-Cache', 'MISS');
  return response;
}
