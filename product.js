/* ========================================
 * 产品变体层 · A 版本：面试复盘（Interview Loop）
 *
 * 整个应用只有这一层是"场景相关"的：品牌、术语、导航、表单文案、示例数据、
 * AI 提示词。引擎（app.js / image-store.js / cloud-sync.js / account.js）在两个
 * 仓库里完全一致，换一个 product.js 就是另一个产品。
 *
 * B 版本（考证错因 / Weakspot）在另一个仓库，只有本文件与品牌资源不同。
 * ======================================== */
window.PRODUCT = {
    id: 'interview',
    brand: '面试复盘',
    brandEn: 'Interview Loop',
    title: '面试复盘 · Interview Loop',
    tagline: '记录每次被问倒的问题，下次面试不再栽在同一处',
    description: '把面试里被问倒的问题变成可复习的追问链：AI 拆解面试官视角的追问、按遗忘曲线安排复盘、生成能力图谱。',
    shortName: '复盘',
    themeColor: '#0071e3',
    background: '#f5f5f7',

    // ---------- 导航与页头 ----------
    nav: {
        pageHome: '今日',
        pageCategory: '知识域',
        pageKnowledge: '追问库',
        pagePractice: '模拟追问',
        pageReview: '待复盘',
        pageStats: '图谱',
    },
    status: { pending: '待复盘', tomorrow: '明日复盘', reviewing: '复盘中', mastered: '已掌握' },
    detail: { desc: '面试背景', wrong: '我当时的回答', right: '更好的回答', note: '复盘笔记' },

    titles: {
        pageHome: '今日复盘',
        pageCategory: '知识域',
        pageReview: '待复盘',
        pageEdit: '记录面试',
        pageEditExisting: '修改记录',
        pageDetail: '复盘详情',
        pageKnowledge: '追问库',
        pagePractice: '模拟追问',
        pageStats: '能力图谱',
    },

    // ---------- 表单与统计的静态文案 ----------
    fields: {
        statTotal: '记录',
        statPending: '待复盘',
        statMastered: '已掌握',
        ringLabel: '就绪度',
        fTitle: '当时被问的是什么 *',
        fLang: '技术栈 *',
        fDesc: '面试背景',
        fWrong: '我当时的回答 *',
        fRight: '更好的回答（可选）',
        fTags: '知识域标签（逗号分隔）',
        fNote: '复盘笔记',
        fSource: '公司',
    },
    placeholders: {
        inputTitle: '例如：Redis 为什么用跳表而不是红黑树',
        inputDesc: '例如：字节跳动 二面 后端，25 分钟项目 + 10 分钟八股',
        inputWrongCode: '把你当时的回答尽量原样写下来 —— AI 会从这里找被追问的点',
        inputRightCode: '查漏补缺后的标准回答，可留空让 AI 给',
        inputTags: '例如: Redis, 数据结构, 分布式',
        inputNote: '为什么没答好？下次怎么答才不漏',
    },
    allLabel: '全部技术栈',
    langOptions: [
        { v: 'java', t: 'Java' },
        { v: 'go', t: 'Go' },
        { v: 'python', t: 'Python' },
        { v: 'cpp', t: 'C++' },
        { v: 'javascript', t: 'JavaScript' },
        { v: 'rust', t: 'Rust' },
    ],
    sources: ['字节跳动', '腾讯', '阿里', '美团', '小红书', '拼多多', '其他'],
    tagSuggestions: ['算法与数据结构', '系统设计', '项目深挖', '语言基础', '数据库', '网络', '操作系统', '并发'],

    // ---------- 首页文案 ----------
    hero: {
        empty: '记录第一道面试题，开始建立复盘库',
        allMastered: '全部吃透，可以上考场了',
        some: (n, t) => `已吃透 ${n}/${t} 道，继续`,
        none: (t) => `${t} 道待复盘，先把最近那场捋一遍`,
    },
    empty: {
        title: '还没有面试记录',
        hint: '把最近一次被问倒的问题记下来，AI 会拆出面试官的追问链',
        action: '记录第一场面试',
    },
    today: {
        title: '今天要复盘',
        unit: '道',
        allDone: '今天的复盘清单清空了',
        cta: '开始模拟追问',
        ctaHint: '让 AI 扮演面试官，连着追问三层',
    },
    actions: { variant: 'AI 模拟追问', diagnosis: '面试官点评', chat: '问教练', share: '分享复盘' },

    // 开发者不吃"青铜学徒"这套，关掉积分/等级/徽章/挑战；
    // 回答是散文而不是代码，所以用换行渲染而不是 <pre>
    features: { gamification: false, answersAsProse: true },

    // ---------- 示例数据 ----------
    seed: [
        {
            id: 'seed-1',
            title: 'Redis 为什么用跳表而不是红黑树',
            lang: 'java',
            desc: '字节跳动 二面 后端，八股环节第一题',
            wrongCode: '我当时的回答：\n「跳表实现简单吧，而且插入快。」\n面试官追问：那红黑树插入也是 O(log n)，复杂度一样，为什么不用红黑树？\n我卡住了，只说了「跳表查询范围更方便」。',
            rightCode: '标准回答方向：\n1. 范围查询：跳表在找到起点后可以沿底层链表顺序扫，天然适合 ZRANGE；红黑树要靠中序遍历 + 回溯。\n2. 实现与维护成本：跳表没有旋转/染色，插入删除只需改指针，代码量和出错面小很多。\n3. 并发友好：跳表局部修改，锁的粒度小；红黑树旋转会影响较大子树。\n4. 代价：跳表内存开销更大（多层索引），因此 Redis 只在有序集合等少数场景用。',
            tags: ['Redis', '数据结构', '系统设计'],
            note: '被问倒的点不是"知不知道跳表"，而是"能不能说出取舍代价"。下次任何"为什么不用 X"都要答出 X 的代价。',
            source: '字节跳动',
            imageId: null,
            status: 'pending',
            reviewCount: 0,
            lastReviewAt: Date.now() - 2 * 86400000,
            createdAt: Date.now() - 2 * 86400000,
            updatedAt: Date.now() - 2 * 86400000,
        },
        {
            id: 'seed-2',
            title: 'MySQL 为什么用 B+ 树而不是 B 树或哈希',
            lang: 'java',
            desc: '腾讯 一面 后端',
            wrongCode: '我当时的回答：\n「B+ 树矮，IO 次数少。」\n面试官追问：B 树也矮啊，为什么 B+ 树更矮？为什么不用哈希？哈希不是 O(1) 吗？',
            rightCode: '标准回答方向：\n1. B+ 树非叶子节点只存 key，不存数据 → 同样页大小能装更多 key → 树更矮 → 磁盘 IO 更少。\n2. 叶子节点用链表相连 → 范围查询、ORDER BY 可以直接顺序扫。\n3. 哈希索引是 O(1) 等值查询，但不支持范围、排序、最左前缀，且哈希冲突与扩容代价高；InnoDB 的自适应哈希是内存层优化，不替代 B+ 树。',
            tags: ['数据库', '索引', '系统设计'],
            note: '又是"为什么不用 X"：要先把 X 的能力边界讲清楚，再说 Y 换来了什么。',
            source: '腾讯',
            imageId: null,
            status: 'pending',
            reviewCount: 1,
            lastReviewAt: Date.now() - 86400000,
            createdAt: Date.now() - 5 * 86400000,
            updatedAt: Date.now() - 86400000,
        },
        {
            id: 'seed-3',
            title: '项目的限流器怎么应对突发流量',
            lang: 'go',
            desc: '小红书 三面 业务负责人，深挖项目',
            wrongCode: '我当时的回答：\n「用了令牌桶，限流 1000 QPS。」\n追问 1：突发流量 5000 QPS 打进来会怎样？\n追问 2：桶容量怎么定的？\n追问 3：限流之后被拒的请求要不要补偿？',
            rightCode: '标准回答方向：\n1. 令牌桶允许突发，但要说明桶容量与补充速率的取值依据（依据下游 SLA 与压测结论，不是拍脑袋）。\n2. 超过容量的直接快速失败，配合降级返回缓存或排队。\n3. 关键业务用滑动窗口或漏桶平滑，避免下游被突发打穿。\n4. 要有可观测性：拒绝率、排队时长、下游错误率联动。',
            tags: ['系统设计', '项目深挖', '高并发'],
            note: '项目类问题的杀手锏是"数据 + 依据"。任何一个数字都要能说出它怎么来的。',
            source: '小红书',
            imageId: null,
            status: 'mastered',
            reviewCount: 3,
            lastReviewAt: Date.now() - 6 * 3600000,
            createdAt: Date.now() - 12 * 86400000,
            updatedAt: Date.now() - 6 * 3600000,
        },
    ],

    // ---------- AI 提示词 ----------
    ai: {
        systemVariant: '你是一位资深技术面试官，擅长从一个候选人没答好的问题出发，设计出能暴露理解边界的追问式选择题。只输出严格 JSON。',
        systemDiagnosis: '你是一位资深技术面试官，擅长点评候选人的回答：哪里答对了、哪里露怯、面试官接下来会追问什么。只输出严格 JSON。',
        systemChat: '你是候选人的面试教练，用简体中文 Markdown 回答，控制在 250 字以内，重点给出「下次怎么答」。',
        systemAutotag: '你是资深技术面试官，擅长给面试问题归纳知识域、判断考察点。只输出合法 JSON。',

        /** 模拟追问：把一道被问倒的题变成三层追问选择题 */
        variantPrompt: (x) => `# 角色
你是一位资深技术面试官。候选人曾在真实面试中栽在这个问题上，你要设计 ${x.count} 道**追问式四选一选择题**，模拟面试官继续往下挖的过程。

# 任务
基于候选人的原始回答，生成 ${x.count} 道题。题目要沿着"澄清 → 深入 → 边界"三层递进，每题只看一个追问角度，难度逐题递增。

# 原始记录
- 问题：${x.title}
- 技术栈：${x.langName}
- 知识域：${x.tags}
- 面试背景：${x.desc}
- 候选人当时的回答：
\`\`\`
${x.wrongCode}
\`\`\`
- 复盘后的标准回答：
\`\`\`
${x.rightCode}
\`\`\`
- 复盘笔记：${x.note}

# 出题原则
## 1. 追问角度（整组要覆盖多个）
- **澄清前提**：面试官先确认场景边界（数据量、一致性要求、读多写多）
- **追问取舍**：为什么不用另一种方案，代价是什么
- **边界极端输入**：空、超大、并发、网络抖动、下游超时
- **原理深挖**：不考"怎么做"，考"底层为什么成立"
- **翻车现场**：给出 4 种回答，问哪一种会被面试官判定为不懂
- **项目追问**：同一个数字/设计的依据是什么

## 2. 难度梯度
- difficulty=1：知识点本身，答不出就是硬伤
- difficulty=2：需要结合场景做取舍
- difficulty=3：综合判断、含陷阱、需要反向分析

## 3. 选项设计
- 4 个选项长度相近、句式一致，禁止"以上都对/都错"
- 干扰项必须来自候选人真实容易踩的坑（上面那段回答里的含糊点）
- 选项要有区分度：能让"背过"和"真懂"的人答出不同结果

## 4. 题干规范
- 用面试官的口吻提问（"如果你说 X，面试官会追问——"）
- 题干自包含，不需要回看原题
- 代码用三反引号包裹

# 输出格式（必须严格遵守）
只输出一个 JSON 对象，禁止解释性文字，禁止 markdown 代码块包裹：

{
  "questions": [
    {
      "type": "choice",
      "topic": "追问指向的知识点，如：跳表与红黑树的取舍",
      "difficulty": 1,
      "question": "面试官追问：……",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 0,
      "explanation": "一句话点明为什么这层追问能筛掉只会背的人",
      "mnemonic": "一句话记法，考场能默念"
    }
  ]
}

字段约束：
- 恰好 ${x.count} 道题，options 恰好 4 个字符串
- type 只能是 "choice"
- answer 是 0~3 的整数
- difficulty 是 1/2/3，整组至少覆盖 2 档
- explanation ≤ 60 字，mnemonic ≤ 30 字
- 所有字符串是纯文本，禁止嵌套 JSON`,

        /** 面试官点评：这段回答哪里露怯、下一层会追问什么 */
        diagnosisPrompt: (x) => `# 角色
你是一位资深技术面试官。下面是一段真实面试的复盘记录，请以面试官视角给出点评。

# 任务
直接给结论，禁止复述题目。要点出：候选人这段回答具体弱在哪、面试官会怎么继续追问、满分回答的结构长什么样。

# 记录
- 问题：${x.title}
- 技术栈：${x.langName}
- 知识域：${x.tags}
- 面试背景：${x.desc}
- 我的回答：
\`\`\`
${x.wrongCode}
\`\`\`
- 复盘后的更好回答：
\`\`\`
${x.rightCode}
\`\`\`

# 输出要求
只输出单个严格 JSON 对象，不要任何其他内容：

{
  "summary": "一句话概括这次回答的问题（≤25字）",
  "cause": "为什么会被判定为没答到位：是知识缺口、表达结构、还是没答到面试官的考点（2-4 句，≤120字）",
  "correctCode": "满分回答的完整文本，分点写，可直接背（纯文本，不要代码块标记）",
  "explanation": "下一次遇到同类问题，开口第一句应该说什么（≤80字）",
  "tips": ["面试官会继续追问的问题1", "追问2", "追问3"],
  "lang": "text"
}

约束：
- summary / explanation 不得照抄题目或原回答
- tips 三条，每条 ≤20 字，要像真实追问
- correctCode 用「1. 2. 3.」分点，不要嵌套 JSON
- 字符串内禁止 \\n 之外的转义`,

        autoTagPrompt: (x) => `请分析这道面试复盘记录，返回严格 JSON（不要多余文字）：
{
  "tags": ["知识域1", "知识域2", "知识域3"],
  "title": "简洁的问题标题（仅当原标题为空时返回，否则返回空字符串）",
  "reason": "一句话说明这段回答的短板",
  "category": "算法与数据结构/系统设计/项目深挖/语言基础/数据库/网络/操作系统/并发 之一"
}
已有标签（避免重复）：${(x.tags || []).join('、') || '无'}
现有标题：${x.title || '（空）'}
面试背景：${x.desc || '（无）'}
我的回答：${x.wrongCode || '（无）'}`,
    },
};
