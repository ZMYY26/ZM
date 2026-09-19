/* ========================================
 * Service Worker - PWA 离线支持
 * 缓存策略：首次访问后预缓存核心资源；运行时缓存同源资源
 * ======================================== */
const CACHE_NAME = 'code-mistake-book-v2';

// 预缓存的核心资源
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './practice-data.js',
    './manifest.webmanifest',
    './assets/icon.jpg'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
            .catch((err) => console.warn('SW 预缓存部分失败:', err))
    );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// 请求：缓存优先，回退网络，失败回退缓存或离线提示
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 仅处理同源请求；跨域 CDN（如 highlight.js）走网络
    if (url.origin !== self.location.origin) return;

    // 静态资源：缓存优先
    if (event.request.method === 'GET') {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request)
                    .then((resp) => {
                        // 只缓存成功且同源的资源
                        if (resp && resp.ok && resp.type === 'basic') {
                            const clone = resp.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                        }
                        return resp;
                    })
                    .catch(() => caches.match('./index.html'));
            })
        );
    }
});