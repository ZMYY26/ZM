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
| `knowledge-data.js` / `practice-data.js` | 内置知识库 / 内置题库数据 |
| `sw.js` | Service Worker（离线缓存策略） |
| `manifest.webmanifest` | PWA 清单 |
| `assets/` | 图标（`icon.jpg` 是原图，其余为脚本生成的产物） |
| `vendor/highlight/` | 本地化的 highlight.js 11.9.0 |
| `scripts/` | 开发脚本，不参与运行时 |

## 数据存储

- **元数据进 `localStorage`**：错题正文、复习状态、积分、活动日志等，共十几个 `code_*_v1` / `ai_*_v1` 键。
- **图片进 IndexedDB**（库名 `code_mistake_book`，store `images`）：记录里只存一个 `imageId`。
  localStorage 每源只有约 5MB 且按 UTF-16 计费，早先把图片 base64 直接塞进去，两张截图就写满配额，
  之后所有保存都会失败。旧版本遗留的内联图片会在启动时自动迁移进 IndexedDB。
- **云端同步只同步文字**：通过 GitHub Gist 备份 JSON，图片不上云。换设备后图片位置会显示「图片未同步到本机」。
- 删除错题会连同图片一起删除；启动时还会清理不再被引用的孤儿图片。

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
4. **自检**：`node scripts/check.mjs`（语法、引用路径、SRI、版本号一致性）。

## 已知的遗留项

- `.trae-html-share-packages/index.html.zip` 是一份旧快照，属于构建产物，应从版本库移除。
- `app.js` 仍是单体脚本，87 处内联 `onclick` 让 CSP 无法启用；后续可按 `storage / render / ai / sync` 拆分。
- AI 配置（含第三方 API Key）与 Gist 同步用的 GitHub Token 目前明文存放在 `localStorage`。
