/* ========================================
 * 账号与认证层（Supabase Auth REST）
 *
 * 不引 SDK：本应用刻意保持零运行时依赖，Supabase 的 Auth / REST / Storage
 * 都是普通 HTTP 接口，直接用 fetch 就够了，顺带省掉 100KB+ 的打包体积。
 *
 * 对外暴露 window.account：
 *   account.init()                 恢复会话 + 处理 OAuth 回跳
 *   account.signUp / signIn / signInWithGitHub / signOut
 *   account.session()              当前会话 {user, accessToken, ...} 或 null
 *   account.api(path, opts)        带认证头的请求（自动刷新 token / 401 重试）
 *   account.onChange(fn)           登录状态变化回调
 * ======================================== */
(function (window) {
    'use strict';

    const NS = ((window.PRODUCT && window.PRODUCT.id) || 'app') + '::';
    const SESSION_KEY = NS + 'code_cloud_session_v1';
    const REFRESH_SKEW_MS = 60 * 1000;   // 提前一分钟续期，避免边界上刚好过期

    let session = null;
    let listeners = [];
    let refreshing = null;

    function cfg() {
        return window.CLOUD_CONFIG || {};
    }

    function configured() {
        return typeof window.cloudConfigured === 'function' && window.cloudConfigured();
    }

    function readStored() {
        try {
            const raw = window.localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (!s || !s.accessToken || !s.refreshToken) return null;
            return s;
        } catch (e) {
            return null;
        }
    }

    function persist(s) {
        try {
            if (s) window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
            else window.localStorage.removeItem(SESSION_KEY);
        } catch (e) {
            console.warn('保存登录态失败:', e);
        }
    }

    function emit() {
        listeners.forEach(function (fn) {
            try { fn(session); } catch (e) { console.warn('账号状态回调出错:', e); }
        });
    }

    function setSession(next) {
        session = next;
        persist(next);
        emit();
        return session;
    }

    /** 把 Supabase 的 token 响应整理成内部结构 */
    function normalizeToken(json) {
        if (!json || !json.access_token) return null;
        const expiresIn = Number(json.expires_in) || 3600;
        return {
            accessToken: json.access_token,
            refreshToken: json.refresh_token,
            expiresAt: Date.now() + expiresIn * 1000,
            user: {
                id: (json.user && json.user.id) || '',
                email: (json.user && json.user.email) || '',
                provider: (json.user && (json.user.app_metadata || {}).provider) || 'email'
            }
        };
    }

    async function parseError(resp) {
        let detail = '';
        try {
            const text = await resp.text();
            try {
                const json = JSON.parse(text);
                detail = json.msg || json.error_description || json.message || json.error || text;
            } catch (e) {
                detail = text;
            }
        } catch (e) { /* ignore */ }
        return detail ? detail.slice(0, 200) : ('HTTP ' + resp.status);
    }

    function authHeaders() {
        const c = cfg();
        const h = { 'apikey': c.anonKey, 'Content-Type': 'application/json' };
        if (session && session.accessToken) h['Authorization'] = 'Bearer ' + session.accessToken;
        return h;
    }

    /** 换取新 token；并发调用共享同一个请求 */
    function refreshSession() {
        if (refreshing) return refreshing;
        if (!session || !session.refreshToken) return Promise.resolve(null);

        refreshing = (async function () {
            const c = cfg();
            try {
                const resp = await window.fetch(c.url + '/auth/v1/token?grant_type=refresh_token', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ refresh_token: session.refreshToken })
                });
                if (!resp.ok) {
                    // refresh token 失效：会话作废，让用户重新登录
                    setSession(null);
                    return null;
                }
                const json = await resp.json();
                const next = normalizeToken(json);
                if (!next) { setSession(null); return null; }
                return setSession(next);
            } catch (e) {
                console.warn('续期失败:', e);
                return session;    // 网络问题不销毁会话，下次再试
            } finally {
                refreshing = null;
            }
        })();

        return refreshing;
    }

    /** 取一个可用 token，快过期就先续期 */
    async function token() {
        if (!session) return null;
        if (session.expiresAt - REFRESH_SKEW_MS <= Date.now()) {
            const next = await refreshSession();
            if (!next) return null;
        }
        return session ? session.accessToken : null;
    }

    /**
     * 带认证的请求。path 以 / 开头，拼在项目 URL 后面：
     *   account.api('/rest/v1/mistakes?...')
     *   account.api('/storage/v1/object/...')
     * opts: { method, body, headers, retry }
     */
    async function api(path, opts) {
        if (!configured()) throw new Error('尚未配置云端地址（cloud-config.js）');
        const options = opts || {};
        const c = cfg();
        const url = c.url + path;

        const send = async function () {
            const headers = Object.assign({}, options.headers || {});
            headers['apikey'] = c.anonKey;
            if (session && session.accessToken) headers['Authorization'] = 'Bearer ' + session.accessToken;
            const init = { method: options.method || 'GET', headers: headers };
            if (options.body !== undefined) {
                init.body = typeof options.body === 'string' || options.body instanceof window.Blob
                    ? options.body
                    : JSON.stringify(options.body);
                if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
            }
            return window.fetch(url, init);
        };

        let resp = await send();

        // token 过期：续期后重试一次
        if (resp.status === 401 && session && options.retry !== false) {
            const next = await refreshSession();
            if (next) {
                resp = await send();
            }
        }
        return resp;
    }

    /** 解析 JSON，失败返回 null（Supabase 部分接口 204 无内容） */
    async function apiJson(path, opts) {
        const resp = await api(path, opts);
        if (!resp.ok) throw new Error(await parseError(resp));
        if (resp.status === 204) return null;
        const text = await resp.text();
        if (!text) return null;
        try { return JSON.parse(text); } catch (e) { return null; }
    }

    // ---------- 登录方式 ----------

    async function signUp(email, password) {
        const c = cfg();
        const resp = await window.fetch(c.url + '/auth/v1/signup', {
            method: 'POST',
            headers: { 'apikey': c.anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });
        if (!resp.ok) throw new Error(await parseError(resp));
        const json = await resp.json();
        const next = normalizeToken(json);
        if (next) { setSession(next); return { needsConfirm: false, session: next }; }
        // 开了「邮箱确认」时 Supabase 只返回用户、不给会话
        return { needsConfirm: true, session: null };
    }

    async function signIn(email, password) {
        const c = cfg();
        const resp = await window.fetch(c.url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: { 'apikey': c.anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });
        if (!resp.ok) throw new Error(await parseError(resp));
        const json = await resp.json();
        const next = normalizeToken(json);
        if (!next) throw new Error('登录响应异常');
        setSession(next);
        return next;
    }

    /**
     * GitHub 登录：整页跳到 Supabase 的 authorize，回来后从 URL hash 取 token。
     * 需要先在 Supabase 控制台 → Authentication → Providers 里启用 GitHub 并填 OAuth App。
     */
    function signInWithGitHub() {
        const c = cfg();
        const redirect = window.location.origin + window.location.pathname;
        const url = c.url + '/auth/v1/authorize?provider=github&redirect_to=' + encodeURIComponent(redirect);
        window.location.assign(url);
    }

    async function signOut() {
        try {
            if (session) {
                await api('/auth/v1/logout', { method: 'POST', retry: false });
            }
        } catch (e) {
            console.warn('注销请求失败（本地会话仍会清除）:', e);
        }
        setSession(null);
    }

    /** 处理 OAuth 回跳：hash 里带 access_token=...&refresh_token=... */
    function consumeOAuthRedirect() {
        const hash = window.location.hash || '';
        if (hash.indexOf('access_token=') === -1) return false;
        const params = new URLSearchParams(hash.slice(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const expiresIn = Number(params.get('expires_in')) || 3600;
        if (!accessToken || !refreshToken) return false;

        // 清掉 hash，避免 token 留在地址栏和浏览器历史里
        try {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (e) { /* ignore */ }

        setSession({
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date.now() + expiresIn * 1000,
            user: { id: '', email: '', provider: 'github' }
        });
        return true;
    }

    /** 用访问令牌拉一次用户信息（OAuth 回跳后 user 是空的，需要补齐） */
    async function loadUser() {
        if (!session) return null;
        try {
            const me = await apiJson('/auth/v1/user');
            if (me && me.id) {
                session.user = {
                    id: me.id,
                    email: me.email || '',
                    provider: (me.app_metadata && me.app_metadata.provider) || session.user.provider
                };
                persist(session);
                emit();
            }
            return session.user;
        } catch (e) {
            console.warn('获取用户信息失败:', e);
            return session.user;
        }
    }

    function init() {
        if (!configured()) return null;
        consumeOAuthRedirect();
        session = readStored();
        if (session) emit();
        return session;
    }

    window.account = {
        init: init,
        configured: configured,
        session: function () { return session; },
        token: token,
        loadUser: loadUser,
        signUp: signUp,
        signIn: signIn,
        signInWithGitHub: signInWithGitHub,
        signOut: signOut,
        api: api,
        apiJson: apiJson,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
    };
})(window);
