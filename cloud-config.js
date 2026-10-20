/* ========================================
 * 云端配置
 *
 * 填两个值就能启用账号与云端同步：
 *   1. 到 https://supabase.com 建一个项目（免费额度够个人用）
 *   2. 项目 → Settings → API，复制 Project URL 和 anon public key 填到下面
 *   3. 项目 → SQL Editor，把 supabase/schema.sql 整段执行一次
 *
 * 这两个值都是公开信息，写进前端没有问题：真正的隔离靠数据库的 RLS 策略
 * （见 supabase/schema.sql）。绝对不要在这里放 service_role key —— 那个能绕过 RLS。
 * ======================================== */
window.CLOUD_CONFIG = {
    url: '',                        // 例：https://abcdefghijkl.supabase.co
    anonKey: '',                    // 例：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    bucket: 'mistake-images'
};

/** 是否已经填过配置 */
window.cloudConfigured = function () {
    const c = window.CLOUD_CONFIG || {};
    return !!(c.url && c.anonKey && c.url.indexOf('http') === 0);
};
