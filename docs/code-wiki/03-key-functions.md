# 第三章 关键类与函数说明

`app.js` 未使用类与模块化（ESM/CommonJS），全部为**全局函数**，通过 `onclick` 内联与事件监听调用。以下按模块分组说明关键函数。行号对应 `app.js`。

> 说明：`app.js` 内不存在 ES6 class，若有「类」语义，则以「错题对象数据结构」充当数据类，见 3.0。

## 3.0 核心数据结构（数据模型）

**错题对象**（存在于全局数组 `mistakes`）：

```js
{
  id: string,             // 唯一 id（generateId 生成）
  title: string,          // 题目标题
  lang: string,           // 'javascript'|'python'|'cpp'|'java'|'c'
  desc: string,           // 题目描述
  wrongCode: string,      // 错误代码
  rightCode: string,      // 正确代码
  tags: string[],         // 考点标签
  note: string,           // 错误分析笔记
  source: string,         // 来源（计算机二级/蓝桥杯/PAT/LeetCode/OJ/课堂/其他）
  image: string|null,     // 题目图片（DataURL）
  status: 'pending'|'reviewing'|'mastered',   // 掌握状态
  reviewCount: number,    // 已复习次数
  lastReviewAt: number,   // 上次复习时间戳(ms)
  createdAt: number       // 创建时间戳(ms)
}
```

## 3.1 全局状态与常量（L5–L15）

| 名称 | 说明 |
| --- | --- |
| `STORAGE_KEY='code_mistake_book_v1'` | 错题列表的 localStorage 键 |
| `REVIEW_INTERVALS=[1,2,4,7,15,30]` | 艾宾浩斯复习间隔（天），按下标对应 reviewCount |
| `mistakes` | 全局错题数组，程序核心数据 |
| `currentPage` / `editingId` / `currentDetailId` | 当前页面 / 正在编辑的 id / 当前详情的 id |
| `uploadedImage` / `knowledgeActiveCategory` / `knowledgeSearchKeyword` | 上传图片 / 知识库激活分类 / 搜索关键词 |

## 3.2 API 封装层（L21–82）

| 函数 | 说明 |
| --- | --- |
| `api(path)` | GET 请求 `API_BASE + path`，返回 JSON；失败返回 `{success:false,data:[]}` |
| `apiPost(path, body)` | POST，返回 JSON；失败返回 `{success:false}` |
| `apiPut(path, body)` | PUT |
| `apiPatch(path, body)` | PATCH |
| `apiDelete(path)` | DELETE |

> `API_BASE`（L18）指向同源服务的 `/api`（注释称由 `server.js` 提供静态与 API）。**本仓库不含 server.js**，故知识库接口实际请求会失败并走降级分支（页面显示空/加载失败），但不影响 localStorage 支撑的核心功能。

## 3.3 工具函数（L84–118）

| 函数 | 说明 |
| --- | --- |
| `$(id)` | `document.getElementById` 简写 |
| `showToast(msg, duration=1500)` | 居中黑色 toast 提示，可自动隐藏 |
| `generateId()` | 基于时间戳 + 随机串生成唯一 id |
| `formatDate(ts)` | 时间戳格式化为 `月/日` |
| `getLangName(code)` | 语言代码 → 中文名映射 |
| `escapeHtml(text)` | 转义 HTML 特殊字符，防 XSS |

## 3.4 数据存储（L120–141）

| 函数 | 说明 |
| --- | --- |
| `loadData()` | 从 localStorage 读取 `mistakes`，失败置空 |
| `saveData()` | 将 `mistakes` 写回 localStorage；捕获 `QuotaExceededError`（存储满）并 toast 提示 |

## 3.5 复习计划计算（L143–175）

| 函数 | 说明 |
| --- | --- |
| `getNextReviewDate(mistake)` | 依据 `reviewCount` 查 `REVIEW_INTERVALS` 计算下一次复习日期（毫秒）。`mastered` 或复习次数耗尽返回 `null` |
| `getReviewStatus(mistake)` | 返回 `'pending'|'tomorrow'|'soon'|'later'|null`，用于决策距今天数范围 |

## 3.6 页面导航（L177–226）

| 函数 | 说明 |
| --- | --- |
| `switchPage(pageId)` | 切换激活的 `.page`，更新当前页、导航高亮、标题与返回按钮，并刷新内容后回顶部 |
| `updateHeader(pageId)` | 按页面设置标题文本与返回按钮显隐 |
| `refreshCurrentPage()` | 根据当前页调度对应渲染函数（首页/分类/复习/知识库/练习），并更新统计与徽标 |

## 3.7 错题列表渲染（L228–353）

| 函数 | 说明 |
| --- | --- |
| `renderMistakeList()` | 按语言/考点/状态筛选器渲染首页错题卡片列表；空则显示空状态 |
| `getStatusText(mistake, reviewStatus)` | 计算显示的状态文案 |
| `getStatusClass(mistake, reviewStatus)` | 状态对应的 CSS class（pending/reviewing/mastered） |
| `getReviewDateText(mistake)` | 生成下次复习日期文本 |
| `updateTagFilter()` | 汇总所有错题标签，重建考点筛选下拉 |
| `updateReviewBadge()` | 计算待复习数量，更新底部导航角标 |

## 3.8 分类页 / 复习页渲染（L355–491）

| 函数 | 说明 |
| --- | --- |
| `renderCategory()` | 渲染考点标签云（`tagCloud`）与按语言统计条（`langStats`） |
| `filterByTag(tag)` | 点击标签云后按标签过滤错题列表 |
| `renderReview()` | 按 `getReviewStatus` 将错题分组到 今天/明天/近期/之后，渲染复习时间线 |

## 3.9 添加 / 编辑错题（L492–610）

| 函数 | 说明 |
| --- | --- |
| `openAddForm()` | 跳转到编辑页并清空表单 |
| `openEditForm(id)` | 预填表单编辑指定错题 |
| `handleFormSubmit(event)` | 表单提交：组装错题对象（新增或更新）并 `saveData`，随后返回 |
| `handleImageUpload(event)` | 读取图片文件为 DataURL 存入 `uploadedImage` 并预览 |
| `removeImage()` | 移除已上传图片 |

## 3.10 错题详情（L611–755）

| 函数 | 说明 |
| --- | --- |
| `viewMistake(id)` | 进入详情页并调用 `renderDetail` |
| `renderDetail(m)` | 渲染详情：元信息、描述、错误/正确代码块（含「运行」按钮）、笔记、来源、操作按钮与 AI 出题按钮 |
| `markMastered(id)` / `unmarkMastered(id)` | 标记已掌握 / 取消掌握并保存 |
| `deleteMistake(id)` | 删除错题（带确认）并保存 |
| `markReviewed(id)` | 标记错题为已复习，`reviewCount` +1 并更新 `lastReviewAt` |

## 3.11 知识库（L756–927）

| 函数 | 说明 |
| --- | --- |
| `renderKnowledge()` | 并行请求 `/categories` 与 `/knowledge`（或 `/knowledge/search?q=`），渲染分类标签与知识点卡片 |
| `selectKnowledgeCategory(cat)` | 选中分类并重新渲染 |
| `handleKnowledgeSearch(event)` | 更新搜索关键词并重新渲染 |
| `viewKnowledge(id)` | 请求 `/knowledge/:id` 渲染详情弹窗，并计算「关联错题」与「同类知识点」 |
| `closeKnowledgeModal()` | 关闭知识详情弹窗 |
| `linkToMistake(title, tags)` | 用知识点预填创建错题表单 |

## 3.12 搜索（L929–976）

| 函数 | 说明 |
| --- | --- |
| `openSearch()` / `closeSearch()` | 打开/关闭搜索弹窗 |
| `handleSearch(event)` | 按关键词在标题/标签/代码中模糊匹配并渲染结果 |
| `searchSelect(id)` | 点击搜索结果跳转到对应错题详情 |

## 3.13 初始化（L985–1202）

| 函数 | 说明 |
| --- | --- |
| `init()` | 应用入口（在 `DOMContentLoaded` 时触发，L2096）：加载数据、绑定导航/返回/搜索/表单/图片/知识库/练习/AI 全部事件、绑定 ESC 关闭、切换首页、必要时写入示例数据 |
| `addSampleData()` | 首次使用（`mistakes` 为空）时填充 3 条示例错题（快排边界、列表引用、闭包变量） |
| `bindFilterEvents()` | 绑定语言/考点/状态筛选器的 change 事件 |

## 3.14 练习模块（L1208–1527）

全局状态：`practiceActiveCategory`、`practiceRecords`、`currentPracticeQuestion`、`currentPracticeSelected`、`currentPracticeAnswered`。

| 函数 | 说明 |
| --- | --- |
| `loadPracticeRecords()` / `savePracticeRecords()` | 读写练习记录（localStorage `code_practice_record_v1`） |
| `bindPracticeEvents()` | 绑定练习页分类按钮与列表点击事件 |
| `renderPractice()` | 渲染练习页统计与列表 |
| `updatePracticeStats()` | 计算已做/正确/正确率 |
| `renderPracticeList()` | 按激活分类渲染题目卡片（含难度星级、作答状态、相关题数） |
| `openPracticeQuestion(qid)` / `closePracticeModal()` | 打开/关闭答题弹窗 |
| `renderPracticeQuestion()` | 渲染题目、选项、解析与相关题 |
| `selectPracticeOption(idx)` | 选中选项 |
| `submitPracticeAnswer()` | 判分并写入 `practiceRecords`，展示对错与解析 |
| `nextPracticeQuestion()` | 按相关题→同分类→全部 的顺序推荐下一题 |
| `jumpToPracticeQuestion(qid)` | 跳转/重新打开指定题 |

## 3.15 AI 举一反三（L1529–2102）

全局状态：`aiConfig`、`aiCurrentMistake`、`aiGeneratedQuestions`、`aiAnswerState`。

| 函数 | 说明 |
| --- | --- |
| `loadAIConfig()` / `saveAIConfig()` | 读写 AI 配置（localStorage `ai_config_v1`：baseURL/apiKey/model/count） |
| `loadAIQuestions()` / `saveAIQuestion(q)` | 读写已生成的 AI 题目（`ai_generated_questions_v1`） |
| `getAllPracticeQuestions()` | 合并内置 `PRACTICE_QUESTIONS` 与本地 AI 题目 |
| `openAIModal(mistakeId)` / `closeAIModal()` | 打开/关闭 AI 出题弹窗 |
| `openAISettings()` / `closeAISettings()` / `handleSaveAISettings()` | AI 配置弹窗控制与保存（count 限制 1~6） |
| `buildAIPrompt(m)` | 依据错题构造 LLM 出题提示词（含题面、错误代码、要求等） |
| `callLLM(prompt)` | 调用 OpenAI 兼容 `/chat/completions`，返回生成的文本 |
| `parseAIQuestions(content)` | 解析 LLM 返回文本为题目数组 |
| `generateAIQuestions()` | 主流程：构造提示词 → 调 LLM → 解析 → 渲染 |
| `renderAIBody(state)` / `renderAIQuestionCard(q)` / `renderAIQuestionText(text)` | 渲染 AI 弹窗内容/题卡/带代码题干 |
| `selectAIOption(qid, idx)` / `submitAIAnswer(qid)` / `refreshAICard(qid)` | AI 题目作答交互 |
| `addAIToPractice(qid)` / `addAllAIToPractice()` | 将生成题（单题/全部）加入练习库 |
| `addAIToMistake(qid)` | 将 AI 题转为错题记录加入错题本 |

## 3.16 浏览器内运行代码（L2104–2283）

全局状态：`RUNNABLE_LANGS`（可运行语言）、`pyodidePromise`（复用 Pyodide 加载 Promise）。

| 函数 | 说明 |
| --- | --- |
| `isRunnableLang(lang)` | 判断语言是否可运行（js/javascript/python/py） |
| `getLangKey(lang)` | 归一化语言别名（js→javascript、py→python） |
| `runMistakeCode(id)` | 详情页「运行」入口：进入运行态，按语言分发到 `runJS` / `runPython`，最后 `showRunOutput` |
| `showRunOutput(outEl, result, btn)` | 将 stdout/stderr/错误态渲染进输出区 |
| `runJS(code)` | **JS 受限沙箱**：伪造 console/process，用 `new Function` 构造仅暴露白名单全局对象（Math/Date/JSON 等，禁用 fetch/eval/Function/localStorage）的隔离作用域执行代码，捕获 stdout/stderr |
| `fmtArg(a)` | 将 console 打印参数格式化 |
| `ensurePyodide()` | 复用/动态加载 Pyodide（CDN v0.26.2），失败清除 Promise 以便重试 |
| `runPython(code)` | 使用 Pyodide 重定向 stdout/stderr 并 `runPythonAsync` 执行 Python 代码 |