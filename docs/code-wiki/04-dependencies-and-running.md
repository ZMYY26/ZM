# 第四章 依赖关系

## 4.1 静态资源依赖（index.html 引用）

| 依赖 | 版本 | 用途 | 引入方式 |
| --- | --- | --- | --- |
| highlight.js | 11.9.0 | 代码高亮（atom-one-dark 主题） | CDN `<link>`/`<script>` |
| —— javascript / python / cpp / java / c 语言包 | 11.9.0 | 各编程语言高亮支持 | CDN `<script>` |

CDN 地址：`https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/...`

## 4.2 运行时按需加载（动态注入）

| 依赖 | 版本 | 触发时机 | 说明 |
| --- | --- | --- | --- |
| Pyodide | v0.26.2 | 首次运行 Python 代码时 | 由 `ensurePyodide()` 动态注入 `<script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js">` |

## 4.3 外部服务（用户自行配置）

| 依赖 | 用途 | 说明 |
| --- | --- | --- |
| OpenAI 兼容 LLM API | AI 举一反三出题 | 支持 DeepSeek / 智谱 / 通义 / OpenAI 等，用户在 AI 配置弹窗填写 `baseURL` / `apiKey` / `model`，配置仅存于本机 localStorage |
| 后端 `/api` 服务 | 知识库数据 | 代码引用 `server.js` 提供静态 + `/api`（categories/knowledge），**本仓库未包含该文件**，缺失时知识库降级为空 |

## 4.4 文件间依赖

```
index.html
   ├── style.css        （L14）布局/视觉
   ├── practice-data.js （L346）PRACTICE_QUESTIONS 全局常量
   └── app.js           （L347）核心逻辑，运行时读取 PRACTICE_QUESTIONS
```

依赖方向：
- `app.js` 通过 `getAllPracticeQuestions()` 读取 `practice-data.js` 暴露的全局 `PRACTICE_QUESTIONS`（若 `typeof` 未定义则安全回退为空数组）。
- `app.js` 通过 `$(id)` 操控 `index.html` 中定义的元素 id，二者存在强约定耦合。
- 二者均无模块化导出，完全依赖 script 全局作用域共享。

## 4.5 存储键（localStorage）

| 键 | 归属 | 结构 |
| --- | --- | --- |
| `code_mistake_book_v1` | 错题 | `mistakes[]` |
| `code_practice_record_v1` | 练习记录 | `{ qid: { done, correct, lastAt, count } }` |
| `ai_config_v1` | AI 配置 | `{ baseURL, apiKey, model, count }` |
| `ai_generated_questions_v1` | AI 生成题目 | `questions[]` |

# 第五章 项目运行方式

## 5.1 启动前提

纯静态单页应用，**无需安装依赖、无需构建**，直接托管静态目录即可。唯一受限的能力是「知识库」（依赖未随仓库提供的后端 `/api` 服务）。

## 5.2 方式一：静态文件服务器（推荐）

在 `/workspace` 下任意起一个静态服务器，例如：

```bash
# Python3
python3 -m http.server 8080
```

```bash
# 或 Node.js：npx serve
npx serve .
```

然后浏览器访问 `http://localhost:8080`（`index.html`）。

## 5.3 方式二：直接打开

直接双击打开 `index.html`（`file://` 协议）。此时内置的错题增删改查、复习、练习、AI（配合 LLM 配置）等功能均可用；知识库因请求 `/api` 会失败而显示空/加载失败态，属预期降级。

## 5.4 需要联网的部分

- 代码高亮：highlight.js CDN。
- 运行 Python 代码：Pyodide CDN（首次运行 Python 时按需加载）。
- AI 举一反三：需要访问用户配置的 LLM API（需联网发送请求）。

## 5.5 数据与隐私说明

- 全部数据保存在浏览器 `localStorage`，无后端、无账号体系；清除站点数据即清空错题。
- AI API Key 仅存本机 localStorage，提示中明确「不会上传」。

## 5.6 首次体验

首次打开（`mistakes` 为空）时，`init()` 会调用 `addSampleData()` 注入 3 条示例错题（快排边界、Python 列表引用、JS 闭包），方便快速了解功能。