/* ========================================
 * 图片存储 - IndexedDB
 *
 * 为什么不用 localStorage：localStorage 每源只有约 5MB，而且按 UTF-16 计费，
 * 一张 JPEG 转成 base64 大约占原文件的 1.37 倍。错题截图两张就能把配额吃满，
 * 之后每次 saveData() 都会抛 QuotaExceededError —— 用户以为记下来了，其实没落盘。
 *
 * 这里把图片放进 IndexedDB（配额是 GB 级），localStorage 里只留一个 imageId。
 *
 * 用法：
 *   const id  = await imageStore.put(dataUrl);
 *   const url = await imageStore.get(id);
 *   await imageStore.del(id);
 *   await imageStore.prune(usedIds);   // 清理不再被任何错题引用的孤儿图片
 * ======================================== */
(function (global) {
    'use strict';

    // 库名带上产品 id：否则两个变体共用同一个库，prune 会把对方的图片删掉
    const DB_NAME = 'code_mistake_book_' + (((window.PRODUCT && window.PRODUCT.id) || 'app').replace(/[^a-z0-9_]/gi, ''));
    const DB_VERSION = 1;
    const STORE = 'images';

    // 超过这个边长就等比缩小；手机截图通常 1170~1290px 宽，不会被缩放
    const MAX_SIDE = 1600;
    const JPEG_QUALITY = 0.85;

    let dbPromise = null;
    // 本地没有这张图时的兜底：由 cloud-sync 注入，负责去对象存储取
    let remoteResolver = null;

    function supported() {
        return typeof global.indexedDB !== 'undefined';
    }

    function newId() {
        return 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!supported()) {
                reject(new Error('IndexedDB 不可用'));
                return;
            }
            const req = global.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function () {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('打开 IndexedDB 失败')); };
        });
        return dbPromise;
    }

    async function putRaw(id, dataUrl) {
        const db = await openDB();
        await new Promise(function (resolve, reject) {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(dataUrl, id);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
            tx.onabort = function () { reject(tx.error || new Error('写入被中止')); };
        });
        return id;
    }

    async function put(dataUrl) {
        if (!dataUrl) throw new Error('空图片');
        return putRaw(newId(), dataUrl);
    }

    /** 用指定 id 写入（云端下载回来的图片要沿用同一个 imageId） */
    async function saveAs(id, dataUrl) {
        if (!id || !dataUrl) return null;
        return putRaw(id, dataUrl);
    }

    /** 只查本地，不触发远程兜底 */
    async function getLocal(id) {
        if (!id) return null;
        const db = await openDB();
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(id);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /**
     * 取图片：先看本地；本地没有且接了云端（已登录），就去对象存储拉一次并缓存。
     * 断网 / 未登录时行为与以前一致，返回 null。
     */
    async function get(id) {
        const local = await getLocal(id);
        if (local) return local;
        if (!id || !remoteResolver) return null;
        try {
            return await remoteResolver(id);
        } catch (e) {
            console.warn('远程图片获取失败:', e);
            return null;
        }
    }

    function setRemoteResolver(fn) {
        remoteResolver = typeof fn === 'function' ? fn : null;
    }

    async function del(id) {
        if (!id) return false;
        const db = await openDB();
        await new Promise(function (resolve, reject) {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
        return true;
    }

    async function keys() {
        const db = await openDB();
        return new Promise(function (resolve, reject) {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAllKeys();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /** 删除所有不在 usedIds 里的图片，返回清理数量 */
    async function prune(usedIds) {
        const keep = new Set(usedIds || []);
        const all = await keys();
        const dead = all.filter(function (k) { return !keep.has(k); });
        if (!dead.length) return 0;
        const db = await openDB();
        await new Promise(function (resolve, reject) {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            dead.forEach(function (k) { store.delete(k); });
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
        return dead.length;
    }

    /**
     * 等比缩小到 MAX_SIDE 以内并重编码为 JPEG（同时丢掉 EXIF，省得把定位信息带上云）。
     * 本来就够小的图片原样返回，避免无谓的画质损失。
     */
    function compress(dataUrl) {
        return new Promise(function (resolve) {
            const img = new Image();
            img.onload = function () {
                const max = Math.max(img.naturalWidth, img.naturalHeight);
                if (max <= MAX_SIDE) {
                    resolve(dataUrl);
                    return;
                }
                const scale = MAX_SIDE / max;
                const w = Math.max(1, Math.round(img.naturalWidth * scale));
                const h = Math.max(1, Math.round(img.naturalHeight * scale));
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, w, h);
                    const out = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
                    resolve(out && out.length < dataUrl.length ? out : dataUrl);
                } catch (e) {
                    resolve(dataUrl);
                }
            };
            img.onerror = function () { resolve(dataUrl); };
            img.src = dataUrl;
        });
    }

    global.imageStore = {
        supported: supported,
        put: put,
        get: get,
        getLocal: getLocal,
        saveAs: saveAs,
        del: del,
        keys: keys,
        prune: prune,
        compress: compress,
        setRemoteResolver: setRemoteResolver,
        MAX_SIDE: MAX_SIDE
    };
})(window);
