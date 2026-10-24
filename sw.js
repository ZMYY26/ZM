/* ========================================
 * Service Worker - PWA 离线支持
 *
 * 缓存策略：
 *  - 导航请求（打开页面）：network-first —— 先拿线上最新 HTML，断网才回落缓存。
 *    之前是 cache-first，发版后老用户会一直看到旧 HTML，只能靠手工改 CACHE_NAME 救。
 *  - 静态资源：stale-while-revalidate —— 立刻用缓存渲染，同时后台拉新版本写入下次。
 *  - 跨域请求：不拦截。
 * ======================================== */
const CACHE_NAME = 'code-mistake-book-v8';

// 预缓存的核心资源（版本号变了一起变，见 index.html 里的 ?v=）
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css?v=8',
    './app.js?v=8',
    './image-store.js?v=8',
    './product.js?v=8',
    './cloud-config.js?v=8',
    './account.js?v=8',
    './cloud-sync.js?v=8',
    './practice-data.js?v=8',
    './knowledge-data.js?v=8',
    './manifest.webmanifest',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/icon-maskable-512.png',
    './vendor/highlight/highlight.min.js?v=8',
    './vendor/highlight/atom-one-light.min.css?v=8'
];

// 安装：预缓存核心资源。单个资源失败不再让整次安装放弃缓存。
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        const results = await Promise.allSettled(
            CORE_ASSETS.map((url) => cache.add(url))
        );
        const failed = results
            .map((r, i) => (r.status === 'rejected' ? CORE_ASSETS[i] : null))
            .filter(Boolean);
        if (failed.length) {
            console.warn('SW 预缓存部分失败（不影响已缓存的部分）:', failed);
        }
        await self.skipWaiting();
    })());
});

// 激活：清理旧版本缓存并立即接管
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // 跨域资源（第三方 API、CDN）直接走网络，不进缓存
    if (url.origin !== self.location.origin) return;

    // 1. 导航请求：network-first，保证发版后能拿到新 HTML
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(request);
                const cache = await caches.open(CACHE_NAME);
                cache.put('./index.html', fresh.clone());
                return fresh;
            } catch (err) {
                const cached = await caches.match('./index.html');
                if (cached) return cached;
                return new Response(
                    '<!DOCTYPE html><meta charset="utf-8"><title>离线</title>' +
                    '<body style="font-family:system-ui;padding:40px;text-align:center">' +
                    '<h2>当前离线</h2><p>首次打开需要联网，之后再断网也能用。</p>',
                    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            }
        })());
        return;
    }

    // 2. 静态资源：stale-while-revalidate
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);

        const network = fetch(request).then((resp) => {
            if (resp && resp.ok && resp.type === 'basic') {
                cache.put(request, resp.clone());
            }
            return resp;
        }).catch(() => null);

        if (cached) {
            // 后台静默更新，不阻塞本次渲染
            event.waitUntil(network.then(() => undefined).catch(() => undefined));
            return cached;
        }

        const fresh = await network;
        if (fresh) return fresh;

        // 资源确实没有、也拿不到时，返回一个明确的 504 而不是让页面挂起
        return new Response('', { status: 504, statusText: '离线且无缓存' });
    })());
});
