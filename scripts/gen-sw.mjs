/**
 * 构建后生成 Service Worker：预缓存所有带 hash 的静态资源。
 * - 二次访问：资源全部走缓存，零网络往返
 * - 弱网/离线：仍能打开已访问过的页面
 * - 发版后：cache 名随资源 hash 变化，旧缓存自动清理
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const manifestPath = join(dist, '.vite', 'manifest.json');
if (!existsSync(manifestPath)) {
  console.warn('[gen-sw] 未找到 vite manifest，跳过 SW 生成');
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const files = new Set();
for (const entry of Object.values(manifest)) {
  if (entry.file) files.add('/' + entry.file);
  for (const css of entry.css ?? []) files.add('/' + css);
  for (const asset of entry.assets ?? []) files.add('/' + asset);
}
for (const extra of [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
]) {
  if (existsSync(join(dist, extra.replace(/^\//, '')))) files.add(extra);
}
const precache = [...files].sort();
const hash = createHash('sha1').update(precache.join('|')).digest('hex').slice(0, 8);
const version = `oq-static-${hash}`;

const sw = `/* 由 scripts/gen-sw.mjs 生成，请勿手动修改 */
const CACHE = '${version}';
const PRECACHE = ${JSON.stringify(precache, null, 0)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('oq-static-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 带 hash 的静态资源：缓存优先
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })),
    );
    return;
  }

  // 页面导航：网络优先，失败回退到缓存的入口 HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
  }
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
console.log(`[gen-sw] 已生成 dist/sw.js，缓存 ${precache.length} 个资源（${version}）`);
