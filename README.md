# 代码错题集

一个纯前端的编程错题本 PWA：记录错题、艾宾浩斯式复习提醒、AI 举一反三 / 诊断、练习题库、学习统计。

线上地址：https://zmyy26.github.io/ZM/ （GitHub Pages）

## 本地运行

没有构建步骤，任意静态服务器即可：

```bash
npx --yes serve .
# 或
python -m http.server 8080
```

打开 `http://localhost:8080`。

> Service Worker 只在 `https://` 或 `localhost` 下生效，直接双击 `index.html`（`file://`）不会有离线能力和安装入口。

## 目录

| 路径 | 说明 |
|---|---|
| `index.html` | 唯一的页面，五个 Tab 都是同一页里的 section |
| `app.js` | 全部逻辑（约 5.5k 行，单体脚本，按 `// ========== ` 分节） |
| `style.css` | 全部样式（含深色主题 `[data-theme="dark"]`） |
| `image-store.js` | 图片的 IndexedDB 存储层 |
| `account.js` | 账号与认证（Supabase Auth REST，不引 SDK） |
| `cloud-sync.js` | 云端同步引擎（离线优先、冲突合并、图片上下行） |
| `cloud-config.js` | 云端配置：填 Supabase 的 URL 与 anon key |
| `supabase/schema.sql` | 云端表结构、RLS 策略、私有图片 bucket |
| `knowledge-data.js` / `practice-data.js` | 内置知识库 / 内置题库数据 |
| `sw.js` | Service Worker（离线缓存策略） |
| `manifest.webmanifest` | PWA 清单 |
| `assets/` | 图标（`icon.jpg` 是原图，其余为脚本生成的产物） |
| `vendor/highlight/` | 本地化的 highlight.js 11.9.0 |
| `scripts/` | 开发脚本，不参与运行时 |
| `tests/` | 场景测试（jsdom 里跑真实页面），见 `tests/README.md` |

## 数据存储

- **元数据进 `localStorage`**：错题正文、复习状态、积分、活动日志等，共十几个 `code_*_v1` / `ai_*_v1` 键。
- **图片进 IndexedDB**（库名 `code_mistake_book`，store `images`）：记录里只存一个 `imageId`。
  localStorage 每源只有约 5MB 且按 UTF-16 计费，早先把图片 base64 直接塞进去，两张截图就写满配额，
  之后所有保存都会失败。旧版本遗留的内联图片会在启动时自动迁移进 IndexedDB。
- **云端同步只同步文字**：通过 GitHub Gist 备份 JSON，图片不上云。换设备后图片位置会显示「图片未同步到本机」。
- 删除错题会连同图片一起删除；启动时还会清理不再被引用的孤儿图片。

## 账号与云端同步

默认**关闭**：不填配置就是一个纯本地应用，行为和以前完全一致。

### 启用步骤

1. 到 [supabase.com](https://supabase.com) 建一个项目（免费额度对个人足够）
2. 项目 → Settings → API，复制 **Project URL** 和 **anon public** key，填进 `cloud-config.js`
3. 项目 → SQL Editor，把 `supabase/schema.sql` 整段执行一次（建表 + RLS + 私有图片 bucket）
4. 可选：Authentication → Providers 启用 GitHub 登录（需自己建一个 GitHub OAuth App）
5. 默认新用户要邮箱确认。个人自用可在 Authentication 里关掉 “Confirm email”，否则注册后得先去邮箱点链接

### 同步模型

| 数据 | 位置 | 冲突策略 |
|---|---|---|
| 错题（含图片引用） | `mistakes` 表，一行一条 | 按每条 `updatedAt` 做 last-write-wins |
| 积分 / 打卡 / 练习记录 / 成就 / AI 题库 | `user_state` 表，一行一用户 | 整包 LWW |
| 图片 | Storage 私有 bucket，路径 `{user_id}/{imageId}` | 上传按需；本机没有时按需下载并缓存 |

几条关键行为：

- **离线优先**：所有写入先落本地，同步是后台行为，失败不影响使用
- **删除写墓碑**：本地删掉后往云端写 `deleted=true`，否则离线设备永远不知道这条被删过
- **示例数据不上传**：首屏那几条演示记录带 `sample` 标记，既不进云端，拉到真实数据后也会自动清掉
- **换账号保护**：本机数据记着 `ownerId`。登录到不同账号时只拉不推，要显式点「把本机数据并入当前账号」
- **密钥不同步**：`aiConfig`（第三方 API Key）和 `syncConfig`（GitHub Token）永远只留在本机

### 安全边界

前端用的是 `anon` key，这是公开值，写进代码没问题；**数据隔离完全靠 `supabase/schema.sql` 里的 RLS 策略**。
绝对不要把 `service_role` key 放进前端——那个能绕过 RLS，等于把数据库对全世界开放。

### 已知限制

- 冲突判定用客户端时钟，两台设备时间差很大时结果会偏（单人自用基本无感）
- 图片按需下载：没打开过的错题，图片不会预先拉到本机
- 旧的 GitHub Gist 备份仍保留在设置里（折叠在「旧方式」下面），与账号同步互不影响

## 改代码时的几个约定

1. **改静态资源要同步版本号。** `index.html` 里的 `?v=N`、`sw.js` 的 `CACHE_NAME` 必须一起改，
   否则老用户会拿到新旧混用的缓存。`node scripts/check.mjs` 会校验两者一致。
2. **`vendor/` 里的文件带 SRI。** 替换 highlight.js 时要重新计算 `integrity`：
   ```bash
   node -e "const c=require('node:crypto'),f=require('node:fs');console.log('sha384-'+c.createHash('sha384').update(f.readFileSync('vendor/highlight/highlight.min.js')).digest('base64'))"
   ```
   忘了更新也不会崩：`highlightCode()` 会降级成纯文本渲染。
3. **图标由脚本生成**，不要手改 PNG：
   ```bash
   npm i --no-save sharp
   node scripts/make-icons.mjs   # 从 assets/icon.jpg 裁出本体，去掉水印，生成 192/512/maskable
   ```
4. **自检**：`node scripts/check.mjs`（语法、引用路径、SRI、缓存版本号、新增脚本是否进了 SW 预缓存）。
5. **新增脚本要同步加进 `sw.js` 的 `CORE_ASSETS`**，否则离线时会缺件——`check.mjs` 的第 8 项会拦住。

## 已知的遗留项

- `.trae-html-share-packages/index.html.zip` 是一份旧快照，属于构建产物，应从版本库移除。
- `app.js` 仍是单体脚本，87 处内联 `onclick` 让 CSP 无法启用；后续可按 `storage / render / ai / sync` 拆分。
- AI 配置（含第三方 API Key）与 Gist 同步用的 GitHub Token 目前明文存放在 `localStorage`（它们不会被同步到云端，但本机仍是明文）。
