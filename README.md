# 面试复盘 · Interview Loop

把面试里被问倒的问题，变成下一次不会再错的一页纸。

- 记录：面试中被问倒的问题 + 你当时的回答（原话最好）+ 复盘后的标准答案
- 追问：AI 站在面试官视角，生成三层追问（澄清 → 深入 → 边界），逼出理解边界
- 复盘：按遗忘曲线安排复习，面试前只补真正薄弱的地方
- 图谱：能力雷达 + 知识域分布，看清"下一次该准备什么"

线上地址：https://zmyy26.github.io/ZM/

## 本地运行

没有构建步骤，任意静态服务器即可：

```bash
npx --yes serve .
```

> Service Worker 只在 `https://` 或 `localhost` 下生效。

## 两个版本共用一套引擎

这个仓库是 **A 版本（面试复盘）**。同一套引擎的 B 版本（考证错因 / Weakspot）在另一个仓库。

差异**只在 `product.js`**：品牌、导航、术语、表单文案、示例数据、AI 提示词都在这里；
`app.js` / `image-store.js` / `cloud-sync.js` / `account.js` 两边完全一致。
换一个 `product.js`，就是另一个垂直场景的产品。

```
product.js          ← 唯一的场景差异层（品牌 / 术语 / 种子数据 / 提示词）
app.js              ← 编辑器、复习调度、统计、分享卡片
image-store.js      ← 图片 IndexedDB
account.js          ← 账号（Supabase Auth REST，零 SDK）
cloud-sync.js       ← 云端同步（离线优先、LWW、墓碑）
supabase/schema.sql ← 云端表结构与 RLS
tests/              ← jsdom 场景测试 + 内存版 Supabase
```

## 目录

| 路径 | 说明 |
|---|---|
| `product.js` | 产品变体层，改这里就能换场景 |
| `app.js` | 全部业务逻辑（单体脚本） |
| `style.css` | 全部样式（含深色主题） |
| `image-store.js` | 图片的 IndexedDB 存储层 |
| `account.js` | 账号与认证 |
| `cloud-sync.js` | 云端同步引擎 |
| `cloud-config.js` | 填 Supabase 的 URL 与 anon key 即可启用账号 |
| `supabase/schema.sql` | 云端表结构、RLS、私有图片 bucket |
| `vendor/highlight/` | 本地化的 highlight.js |
| `scripts/` `tests/` | 自检脚本与场景测试 |

## 账号与云端同步（可选）

不填配置就是纯本地应用。要启用：

1. [supabase.com](https://supabase.com) 建项目（免费额度够个人用）
2. Settings → API 复制 URL 和 anon key，填进 `cloud-config.js`
3. SQL Editor 执行 `supabase/schema.sql`
4. 个人自用可在 Authentication 里关掉 "Confirm email"

`anon` key 是公开值，数据隔离靠 `schema.sql` 里的 RLS 策略；不要把 `service_role` key 放前端。

同步语义：记录逐条同步（按 `updatedAt` 做 LWW）、删除写墓碑、积分等整包同步、
图片按需上下行、示例数据（`sample: true`）永不入云。

## 改代码时的约定

1. **改静态资源要同步版本号**：`index.html` 的 `?v=N` 与 `sw.js` 的 `CACHE_NAME` 必须一致。
2. **`vendor/` 带 SRI**：`integrity` 是按文件字节算的哈希，所以 `.gitattributes` 里把
   `vendor/**` 标成了 `-text` —— 否则 Git 在 Windows 上把 LF 转成 CRLF，哈希就变了，
   浏览器会直接拒绝加载脚本（这个坑已经踩过一次）。
3. **自检**：`node scripts/check.mjs`（语法 / 路径 / SRI / 版本号 / 离线清单）。
4. **测试**：`npm i -D jsdom fake-indexeddb` 后 `node tests/sync-test.mjs`。

## 已知遗留

- `app.js` 仍是单体脚本，内联 `onclick` 让 CSP 无法启用
- 桌面端还没做响应式（固定 480px 列宽）
- 详情页悬浮的 + 按钮会遮挡内容
