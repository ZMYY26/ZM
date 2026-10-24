/* ========================================
 * 云端同步引擎（离线优先）
 *
 * 原则：本地永远是可用的一等公民。所有读写照旧落 localStorage / IndexedDB，
 * 云端只是"另一个副本"，断网、没登录、同步失败都不影响使用。
 *
 * 同步模型：
 *   - 错题：逐条同步（表 mistakes），按记录各自的 updatedAt 做 last-write-wins，
 *     删除写墓碑（deleted=true），否则离线设备永远不知道这条被删过
 *   - 积分/打卡/练习/成就/AI 题库：整包同步（表 user_state），整体 LWW
 *   - 图片：按需上传；本机没有时从 Storage 按需下载并缓存进 IndexedDB
 *   - 增量游标用服务端的 synced_at，而不是客户端时间，避免设备时钟偏差漏数据
 *
 * 安全：aiConfig（第三方 API Key）和 syncConfig（GitHub Token）刻意不同步。
 * ======================================== */
(function (window) {
    'use strict';

    const NS = ((window.PRODUCT && window.PRODUCT.id) || 'app') + '::';
    const META_KEY = NS + 'code_cloud_meta_v1';
    const PUSH_DEBOUNCE_MS = 2500;
    const PULL_LIMIT = 500;
    const PUSH_BATCH = 50;

    let hooks = null;                 // 应用侧回调，见 attach()
    let meta = {
        ownerId: '',                  // 本机数据归属的账号；换了账号要显式确认才上传
        cursor: '',                   // 上次拉取到的服务端 synced_at
        synced: {},                   // { 错题id: 已上传的 updatedAt }
        uploadedImages: {},           // { imageId: true }
        lastSyncAt: 0
    };
    let status = { syncing: false, phase: '', error: '', lastSyncAt: 0 };
    let statusListeners = [];
    let pushTimer = null;

    // ---------- 元数据 ----------

    function loadMeta() {
        try {
            const raw = window.localStorage.getItem(META_KEY);
            if (raw) meta = Object.assign(meta, JSON.parse(raw));
        } catch (e) {
            console.warn('读取同步元数据失败:', e);
        }
    }

    function saveMeta() {
        try { window.localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
    }

    // ---------- 状态广播 ----------

    function setStatus(patch) {
        status = Object.assign(status, patch);
        statusListeners.forEach(function (fn) {
            try { fn(status); } catch (e) { /* ignore */ }
        });
    }

    function onStatus(fn) {
        if (typeof fn === 'function') statusListeners.push(fn);
        fn(status);
    }

    // ---------- 基础判断 ----------

    function signedIn() {
        return !!(window.account && window.account.session() && window.account.session().user.id);
    }

    function enabled() {
        return signedIn();
    }

    function currentUserId() {
        const s = window.account && window.account.session();
        return (s && s.user && s.user.id) || '';
    }

    function attach(h) {
        hooks = h;
    }

    // ---------- 拉取 ----------

    /** 增量拉取错题，按 id 合并（远端更新则覆盖本地；墓碑则删除本地） */
    async function pullMistakes() {
        let pulled = 0;
        let guard = 0;

        while (guard++ < 40) {
            const query = '/rest/v1/mistakes?select=id,payload,updated_at,deleted,synced_at'
                + (meta.cursor ? '&synced_at=gt.' + encodeURIComponent(meta.cursor) : '')
                + '&order=synced_at.asc&limit=' + PULL_LIMIT;

            const rows = await window.account.apiJson(query);
            if (!Array.isArray(rows) || rows.length === 0) break;

            mergeMistakes(rows);
            pulled += rows.length;

            const last = rows[rows.length - 1];
            if (last && last.synced_at) meta.cursor = last.synced_at;
            saveMeta();

            if (rows.length < PULL_LIMIT) break;
        }
        return pulled;
    }

    function mergeMistakes(rows) {
        const current = hooks.getMistakes() || [];
        const byId = new Map(current.map(function (m) { return [m.id, m]; }));
        let changed = false;

        // 账号里已经有真实数据了：本机那几条演示样本就该退场
        const hasRemote = rows.some(function (r) { return r && !r.deleted; });
        if (hasRemote) {
            Array.from(byId.entries()).forEach(function (entry) {
                if (entry[1] && entry[1].sample) { byId.delete(entry[0]); changed = true; }
            });
        }

        rows.forEach(function (row) {
            if (!row || !row.id) return;
            if (row.deleted) {
                if (byId.has(row.id)) { byId.delete(row.id); changed = true; }
                return;
            }
            const remote = row.payload;
            if (!remote || !remote.id) return;
            const local = byId.get(row.id);
            if (!local) {
                byId.set(row.id, remote);
                changed = true;
                return;
            }
            if ((remote.updatedAt || 0) > (local.updatedAt || 0)) {
                byId.set(row.id, remote);
                changed = true;
            }
        });

        if (changed) {
            const next = Array.from(byId.values())
                .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
            hooks.setMistakes(next);
            hooks.save();
            hooks.render();
        }
        return changed;
    }

    /** 拉取整包状态（积分 / 打卡 / 练习 / 成就 / AI 题库）
     *  用内容哈希判断"本地有没有变"，用服务端时间戳判断"远端是不是更新的"，
     *  这样应用侧不需要在每个 save 函数里埋时间戳。 */
    async function pullState() {
        const rows = await window.account.apiJson(
            '/rest/v1/user_state?select=payload,updated_at&limit=1'
        );
        const row = Array.isArray(rows) && rows[0];
        if (!row || !row.payload) return false;
        if ((row.updated_at || 0) <= (meta.stateAt || 0)) return false;

        hooks.setState(row.payload);
        meta.stateAt = row.updated_at || 0;
        meta.stateHash = hash(hooks.getState());
        saveMeta();
        hooks.render();
        return true;
    }

    /** 稳定的内容指纹，用来判断整包状态是否有本地改动 */
    function hash(value) {
        const text = JSON.stringify(value);
        let h = 5381;
        for (let i = 0; i < text.length; i++) {
            h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
        }
        return h.toString(36);
    }

    // ---------- 推送 ----------

    async function pushMistakes() {
        const list = hooks.getMistakes() || [];
        const dirty = list.filter(function (m) {
            // sample 是首屏演示数据，不属于用户资产，永远不上传
            return m && m.id && !m.sample && meta.synced[m.id] !== m.updatedAt;
        });
        if (!dirty.length) return 0;

        const uid = currentUserId();
        let pushed = 0;

        for (let i = 0; i < dirty.length; i += PUSH_BATCH) {
            const batch = dirty.slice(i, i + PUSH_BATCH);
            const body = batch.map(function (m) {
                return {
                    user_id: uid,
                    id: m.id,
                    payload: m,
                    updated_at: m.updatedAt || m.createdAt || Date.now(),
                    deleted: false
                };
            });
            await window.account.api('/rest/v1/mistakes?on_conflict=user_id,id', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                body: body
            }).then(async function (resp) {
                if (!resp.ok) throw new Error('推送错题失败: HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 120));
            });

            batch.forEach(function (m) { meta.synced[m.id] = m.updatedAt; });
            pushed += batch.length;
            saveMeta();
        }

        // 清理已经不存在的记录的同步标记
        const alive = new Set(list.map(function (m) { return m.id; }));
        Object.keys(meta.synced).forEach(function (id) {
            if (!alive.has(id)) delete meta.synced[id];
        });
        saveMeta();

        return pushed;
    }

    async function pushState() {
        const bundle = hooks.getState();
        const fingerprint = hash(bundle);
        if (fingerprint === meta.stateHash) return false;   // 本地没变化，不用推

        const uid = currentUserId();
        const at = Date.now();
        const resp = await window.account.api('/rest/v1/user_state?on_conflict=user_id', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: { user_id: uid, payload: bundle, updated_at: at }
        });
        if (!resp.ok) {
            throw new Error('推送状态失败: HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 120));
        }
        meta.stateAt = at;
        meta.stateHash = fingerprint;
        saveMeta();
        return true;
    }

    // ---------- 删除（墓碑）----------

    async function deleteRemote(id) {
        if (!enabled() || !id) return;
        try {
            const now = Date.now();
            const resp = await window.account.api('/rest/v1/mistakes?on_conflict=user_id,id', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                body: { user_id: currentUserId(), id: id, payload: null, updated_at: now, deleted: true }
            });
            if (resp.ok) {
                delete meta.synced[id];
                saveMeta();
            }
        } catch (e) {
            console.warn('删除同步失败，下次同步会重试:', e);
        }
    }

    // ---------- 图片 ----------

    function imagePath(imageId) {
        return currentUserId() + '/' + imageId + '.jpg';
    }

    /** dataURL -> Blob（不依赖 fetch('data:...')，离线和旧浏览器都稳） */
    function dataUrlToBlob(dataUrl) {
        const text = String(dataUrl);
        const comma = text.indexOf(',');
        const meta = comma >= 0 ? text.slice(0, comma) : '';
        const body = comma >= 0 ? text.slice(comma + 1) : '';
        const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
        const isBase64 = /;base64/i.test(meta);
        const binary = isBase64 ? window.atob(body) : decodeURIComponent(body);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
        return new Blob([bytes], { type: mime });
    }

    /** Blob -> dataURL（同上下载路径用） */
    async function blobToDataUrl(blob) {
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < buffer.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, buffer.subarray(i, i + CHUNK));
        }
        return 'data:' + (blob.type || 'image/jpeg') + ';base64,' + window.btoa(binary);
    }

    /** 把本机 IndexedDB 里的图片上传到 Storage（幂等，按 id 去重） */
    async function uploadImage(imageId) {
        if (!enabled() || !imageId || meta.uploadedImages[imageId]) return false;
        if (typeof window.imageStore === 'undefined') return false;

        const dataUrl = await window.imageStore.getLocal(imageId);
        if (!dataUrl) return false;

        const bucket = (window.CLOUD_CONFIG && window.CLOUD_CONFIG.bucket) || 'mistake-images';
        const blob = dataUrlToBlob(dataUrl);

        const resp = await window.account.api('/storage/v1/object/' + bucket + '/' + imagePath(imageId), {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' },
            body: blob
        });
        if (!resp.ok) {
            console.warn('图片上传失败:', resp.status);
            return false;
        }
        meta.uploadedImages[imageId] = true;
        saveMeta();
        return true;
    }

    /** 本机没有这张图时，从 Storage 取回来并缓存进 IndexedDB（给 imageStore 当兜底） */
    async function downloadImage(imageId) {
        if (!enabled() || !imageId) return null;
        const bucket = (window.CLOUD_CONFIG && window.CLOUD_CONFIG.bucket) || 'mistake-images';
        const path = bucket + '/' + imagePath(imageId);

        try {
            // 私有 bucket：先换一个带签名的短时 URL
            const signed = await window.account.apiJson('/storage/v1/object/sign/' + path, {
                method: 'POST',
                body: { expiresIn: 600 }
            });
            let url = signed && (signed.signedURL || signed.signedUrl);
            if (!url) return null;
            if (url.indexOf('http') !== 0) {
                url = (window.CLOUD_CONFIG.url) + '/storage/v1' + (url.charAt(0) === '/' ? '' : '/') + url;
            }

            const resp = await window.fetch(url);
            if (!resp.ok) return null;
            const blob = await resp.blob();
            const dataUrl = await blobToDataUrl(blob);

            if (typeof window.imageStore !== 'undefined') {
                await window.imageStore.saveAs(imageId, dataUrl);
            }
            meta.uploadedImages[imageId] = true;
            saveMeta();
            return dataUrl;
        } catch (e) {
            console.warn('图片下载失败:', e);
            return null;
        }
    }

    /** 删除云端图片对象（错题删了或换图时调用，否则存储会无限增长） */
    async function deleteRemoteImage(imageId) {
        if (!enabled() || !imageId) return false;
        const bucket = (window.CLOUD_CONFIG && window.CLOUD_CONFIG.bucket) || 'mistake-images';
        try {
            const resp = await window.account.api('/storage/v1/object/' + bucket, {
                method: 'DELETE',
                body: { prefixes: [imagePath(imageId)] }
            });
            if (!resp.ok && resp.status !== 404) {
                console.warn('删除云端图片失败:', resp.status);
                return false;
            }
            delete meta.uploadedImages[imageId];
            saveMeta();
            return true;
        } catch (e) {
            console.warn('删除云端图片失败:', e);
            return false;
        }
    }

    /** 把本地所有还没上传的图片补传一遍 */
    async function uploadPendingImages() {
        if (!enabled()) return 0;
        const list = hooks.getMistakes() || [];
        const ids = list.map(function (m) { return m && m.imageId; })
            .filter(function (id) { return id && !meta.uploadedImages[id]; });
        let done = 0;
        for (const id of ids) {
            if (await uploadImage(id)) done++;
        }
        return done;
    }

    // ---------- 主流程 ----------

    async function syncNow(reason) {
        if (!enabled()) return { skipped: true };
        if (status.syncing) return { skipped: true };
        if (!hooks) throw new Error('同步引擎尚未 attach()');

        setStatus({ syncing: true, phase: reason || 'sync', error: '' });
        let pulled = 0;
        let pushed = 0;

        try {
            // 换了账号但本机还留着上一个账号的数据：只拉不推，等用户确认
            if (meta.ownerId && meta.ownerId !== currentUserId()) {
                await pullMistakes();
                setStatus({
                    syncing: false,
                    phase: 'done',
                    error: '本机数据属于另一个账号，已仅拉取。确认要合并请点「把本机数据并入当前账号」。',
                    lastSyncAt: Date.now()
                });
                return { adopted: false, pulled: pulled };
            }

            if (!meta.ownerId) {
                meta.ownerId = currentUserId();
                saveMeta();
            }

            pulled += await pullMistakes();
            await pullState();
            pushed += await pushMistakes();
            await pushState();
            await uploadPendingImages();

            meta.lastSyncAt = Date.now();
            saveMeta();
            setStatus({ syncing: false, phase: 'done', error: '', lastSyncAt: meta.lastSyncAt });
            return { pulled: pulled, pushed: pushed };
        } catch (e) {
            console.warn('同步失败:', e);
            setStatus({ syncing: false, phase: 'error', error: e.message || String(e) });
            return { error: e.message };
        }
    }

    /** 防抖：保存后静默同步 */
    function schedule() {
        if (!enabled() || !hooks) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(function () {
            pushTimer = null;
            syncNow('auto');
        }, PUSH_DEBOUNCE_MS);
    }

    /** 显式把本机数据并入当前账号（换设备/换账号后确认用） */
    async function adoptLocalData() {
        if (!enabled()) return false;
        meta.ownerId = currentUserId();
        meta.synced = {};                    // 强制全量重推
        saveMeta();
        await syncNow('adopt');
        return true;
    }

    function start() {
        loadMeta();
        if (!window.account) return;
        // OAuth 回跳后 session.user.id 可能还是空的，补一次
        if (window.account.session() && !currentUserId()) {
            window.account.loadUser().then(function () {
                if (enabled()) syncNow('startup');
            });
        } else if (enabled()) {
            syncNow('startup');
        }

        window.addEventListener('online', function () { schedule(); });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') schedule();
        });
    }

    window.cloudSync = {
        attach: attach,
        start: start,
        syncNow: syncNow,
        schedule: schedule,
        deleteRemote: deleteRemote,
        uploadImage: uploadImage,
        downloadImage: downloadImage,
        deleteRemoteImage: deleteRemoteImage,
        uploadPendingImages: uploadPendingImages,
        adoptLocalData: adoptLocalData,
        enabled: enabled,
        onStatus: onStatus,
        meta: function () { return meta; }
    };
})(window);
