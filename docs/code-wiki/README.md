# Code Wiki —— 代码错题集（Code Mistake Notebook）

> 本 wiki 面向开发者/维护者，系统说明「代码错题集」单页应用的架构、模块、关键函数、依赖与运行方式。

## 一、项目一句话介绍

一款**零构建、纯前端**的移动端错题学习 SPA：记录刷题错题 → 艾宾浩斯复习 → 分类统计 → 内置题库练习 → AI 举一反三出题 → 浏览器内运行 JS/Python 代码。

## 二、文档导航

| 章节 | 文件 | 内容 |
| --- | --- | --- |
| 01 | [01-overview.md](./01-overview.md) | 项目整体架构、技术栈、目录结构、模块划分、数据流 |
| 02 | [02-modules.md](./02-modules.md) | 各文件与页面/组件/模块职责 |
| 03 | [03-key-functions.md](./03-key-functions.md) | 数据模型 + 按模块分组的关键函数说明 |
| 04 | [04-dependencies-and-running.md](./04-dependencies-and-running.md) | 依赖关系（CDN/外部服务/存储键）与运行方式 |

## 三、仓库文件

```
/workspace
├── index.html           页面骨架
├── app.js               核心逻辑
├── style.css            样式
├── practice-data.js     内置题库数据
└── .trae-html-share-packages/   IDE 分享包（非运行所需）
```

## 四、关键结论速览

- **无构建 / 无框架**：原生 JS，`index.html` 直接落地可运行。
- **持久化**：4 个 localStorage 键（错题、练习记录、AI 配置、AI 题目）。
- **知识库依赖后端**：代码引用了 `/api`（注释为 `server.js` 提供），但**仓库未包含该文件**；缺失时知识库降级为空，其余功能不受影响。
- **代码运行**：JS 用受限沙箱，Python 动态加载 Pyodide。
- **AI**：任意 OpenAI 兼容 LLM，Key 仅存本机 localStorage。