-- ============================================================
-- 代码错题集 · 云端存储结构（Supabase / Postgres）
--
-- 使用方式：Supabase 控制台 → SQL Editor → 整段粘贴执行。
-- 重复执行是安全的（if not exists / on conflict do nothing）。
--
-- 设计要点：
-- 1. 所有表都开 RLS，策略一律绑定 auth.uid()。前端用的是 anon key（公开值），
--    数据隔离完全靠这里的策略——策略写错就等于数据裸奔，改之前先想清楚。
-- 2. mistakes.payload 用 jsonb 存整条记录：这个应用的字段几乎每次迭代都在变，
--    固定列意味着每加一个字段都要写一次迁移；而所有筛选都在前端做，不需要服务端查询。
-- 3. updated_at 存的是客户端毫秒时间戳（和 payload.updatedAt 一致），用于增量拉取
--    和 last-write-wins 冲突判定。
-- 4. 删除用墓碑（deleted = true）而不是物理删除，否则离线设备永远不知道这条被删过。
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 错题：一行一条，按用户隔离 ----------
create table if not exists public.mistakes (
    user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
    id          text        not null,                 -- 前端生成的 id（m_xxx）
    payload     jsonb,                                -- 整条错题记录；墓碑时为 null
    updated_at  bigint      not null default 0,       -- 客户端毫秒时间戳
    deleted     boolean     not null default false,   -- 墓碑标记
    synced_at   timestamptz not null default now(),
    primary key (user_id, id)
);

create index if not exists mistakes_user_updated_idx
    on public.mistakes (user_id, updated_at);

alter table public.mistakes enable row level security;

drop policy if exists "mistakes owner full access" on public.mistakes;
create policy "mistakes owner full access" on public.mistakes
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ---------- 用户状态：一行一个用户，整包覆盖（积分 / 打卡 / 练习记录 / 成就 / AI 题库）----------
-- 这些小体量、低冲突的数据没必要做成逐条同步，整体 LWW 足够；
-- 主体数据（错题）走上面那张表，逐条合并。
create table if not exists public.user_state (
    user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
    payload    jsonb       not null default '{}'::jsonb,
    updated_at bigint      not null default 0,
    synced_at  timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "user_state owner full access" on public.user_state;
create policy "user_state owner full access" on public.user_state
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ---------- 图片：私有 bucket，路径 {user_id}/{imageId}.jpg ----------
insert into storage.buckets (id, name, public)
values ('mistake-images', 'mistake-images', false)
on conflict (id) do nothing;

drop policy if exists "images owner read" on storage.objects;
create policy "images owner read" on storage.objects
    for select to authenticated
    using (bucket_id = 'mistake-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images owner insert" on storage.objects;
create policy "images owner insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'mistake-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images owner update" on storage.objects;
create policy "images owner update" on storage.objects
    for update to authenticated
    using (bucket_id = 'mistake-images' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'mistake-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "images owner delete" on storage.objects;
create policy "images owner delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'mistake-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 自检：确认策略已生效 ----------
-- 期望看到 mistakes / user_state 各 1 条，storage.objects 4 条
-- select tablename, policyname from pg_policies
--  where schemaname in ('public', 'storage') and tablename in ('mistakes', 'user_state', 'objects')
--  order by tablename, policyname;
