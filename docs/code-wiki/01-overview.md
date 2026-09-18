# 第一章 项目整体架构与目录结构

## 1.1 项目定位

**代码错题集**是一款移动优先（`max-width: 480px`）的纯前端单页应用（SPA），帮助编程学习者记录、分类、复习刷题过程中做错的题目。核心能力包括：错题录入与管理、基于艾宾浩斯遗忘曲线的复习提醒、知识点分类、内置题库练习、AI 举一反三出题，以及在浏览器内直接运行错题代码。

项目为**零构建**的「直白式 JS（Vanilla JS）」应用：无需打包器、无框架、无 `npm` 依赖，直接通过 `<script>` 引入原生 JS 与 CDN 静态资源即可运行。

## 1.2 技术栈总览

| 分类 | 选型 |
| --- | --- |
| 语言 | 原生 HTML5 / CSS3 / JavaScript（ES6+） |
| 架构模式 | 单页应用，`display` 切换多个 `.page` 页面，全局函数式编程 |
| 数据持久化 | 浏览器 `localStorage`（错题、练习记录、AI 配置与生成的题目） |
| 代码高亮 | highlight.js（CDN，atom-one-dark 主题） |
| 代码运行 | JS：受限 `new Function` 沙箱；Python：动态加载 Pyodide（CDN v0.26.2） |
| AI 能力 | 调用任意 OpenAI 兼容 LLM 接口（DeepSeek / 智谱 / 通义 / OpenAI 等） |
| 后端 | 可选/参考性。代码引用了 `server.js` 提供的 `/api` 知识库接口，但**本仓库未包含该后端文件** |

## 1.3 目录结构

```
/workspace
├── index.html                  # 页面结构（7 个页面 + 5 个弹窗 + 底部导航）
├── app.js                      # 核心逻辑（约 2284 行，所有业务逻辑）
├── style.css                   # 全局样式（约 2112 行）
├── practice-data.js            # 内置练习题库数据（PRACTICE_QUESTIONS，40 题）
└── .trae-html-share-packages/
    └── index.html.zip           # IDE 生成的 HTML 分享打包产物（非运行所需）
```

> 注：`.trae-html-share-packages/` 是本项目经由 IDE 生成的分享包，与运行时无关，可忽略。

## 1.4 模块划分

`app.js` 内按「注释分区块」组织了若干功能模块，分工如下：

| 模块 | 起始行 | 职责 |
| --- | --- | --- |
| 全局状态与常量 | L5 | 存储 key、复习间隔、全局变量声明 |
| API 封装层 | L21 | `api*` 系列 fetch 封装 |
| 工具函数 | L84 | `$` / `showToast` / `generateId` 等 |
| 数据存储 | L120 | `loadData` / `saveData`（localStorage） |
| 复习计划计算 | L143 | `getNextReviewDate` / `getReviewStatus`（艾宾浩斯） |
| 页面导航 | L177 | `switchPage` / `updateHeader` / `refreshCurrentPage` |
| 错题列表渲染 | L228 | `renderMistakeList` 及状态辅助函数 |
| 分类页渲染 | L355 | `renderCategory` / `filterByTag` |
| 复习页渲染 | L407 | `renderReview` |
| 添加/编辑错题 | L492 | 表单逻辑与图片上传 |
| 错题详情 | L611 | `viewMistake` / `renderDetail` / 状态变更 |
| 知识库 | L756 | 从 `/api` 获取知识点（后者缺失时优雅降级） |
| 搜索 | L929 | 全局错题搜索 |
| 筛选事件 | L978 | 列表筛选器绑定 |
| 初始化与示例数据 | L985 | `init` / `addSampleData` |
| 练习模块 | L1208 | 内置题库练习与答题 |
| AI 举一反三 | L1529 | 配置、提示词、LLM 调用、生成/判题 |
| 浏览器内运行代码 | L2104 | JS 沙箱与 Pyodide Python 运行器 |

## 1.5 数据流概览

```
用户操作
  │
  ├─ 错题 CRUD ──────────► mistakes[]   ──► localStorage('code_mistake_book_v1')
  ├─ 练习答题 ──────────► practiceRecords{} ──► localStorage('code_practice_record_v1')
  ├─ AI 配置 ──────────► aiConfig          ──► localStorage('ai_config_v1')
  ├─ AI 生成的题 ─────────► aiGeneratedQuestions[] ──► localStorage('ai_generated_questions_v1')
  ├─ 知识库浏览 ─────────► fetch(/api/categories 等)   [后端缺失时降级为空]
  └─ 运行代码 ──────────► JS: new Function 沙箱 / Python: Pyodide
```