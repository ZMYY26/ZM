# 测试脚本

不是单元测试框架，而是几个能真跑起来的场景脚本：在 jsdom 里加载真实的 `index.html` + `app.js`，
再用 `fake-indexeddb` 给每台"设备"一套独立存储。

## 准备

```bash
npm i -D jsdom fake-indexeddb
```

## 运行

```bash
node scripts/check.mjs        # 静态检查：语法 / 资源路径 / SRI / 缓存版本号（无需依赖）
node tests/storage-test.mjs   # 图片存储：旧数据迁移、并发迁移、增删改、高亮降级
node tests/sync-test.mjs      # 账号同步：双设备场景
```

## sync-test 覆盖了什么

`tests/mock-supabase.mjs` 在进程内起一个内存版 Supabase（Auth + PostgREST 子集 + Storage 子集，
用 access token 区分用户，等价于 RLS 的效果），然后：

1. 设备 A 注册 → 新增带图错题 → 同步 → 断言服务端有记录和图片对象
2. 设备 B 同账号登录 → 同步 → 拉到错题；打开详情时图片从云端取回并缓存
3. 两台设备改同一条 → 断言较新的 `updatedAt` 胜出，另一端也收敛
4. A 删除 → 断言墓碑传播到 B，云端图片对象一并删除
5. 另一个账号 → 断言看不到上面的数据
6. 本机数据属于别的账号时登录 → 断言只拉不推（不会把数据静默推进别人账号）
7. 显式确认并入 → 断言数据才会上传

## 注意

这些脚本依赖 jsdom 对 canvas / IndexedDB 的模拟，用假的 2D context 兜住绘制调用；
真实渲染效果仍需在浏览器里看。
