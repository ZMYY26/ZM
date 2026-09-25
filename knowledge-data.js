/* ========================================
 * 内置知识库 - 编程核心知识点
 * 覆盖：数据结构、算法、操作系统、计算机网络、数据库、语言基础
 * 字段：id / category / title / summary / tags / complexity / detail(Markdown) / codeLang / code
 * ======================================== */

const KNOWLEDGE_ITEMS = [

    // ==================== 数据结构 ====================
    { id: 'k01', category: '数据结构', title: '数组与动态数组', difficulty: 1,
      summary: '内存连续存储的线性表：随机访问 O(1)，插入删除 O(n)，扩容均摊 O(1)。',
      tags: ['数组', '线性表', 'vector', '内存分配'],
      complexity: '访问 O(1) · 插入/删除 O(n) · 扩容均摊 O(1)',
      codeLang: 'cpp',
      code: 'vector<int> v;\nv.push_back(x);      // 均摊 O(1)，容量翻倍扩容\nint a = v[i];         // O(1) 随机访问\nv.insert(v.begin()+i, x); // O(n)：需要移动后续元素',
      detail: `## 核心思想
数组是一段**连续内存**，通过「首地址 + 下标 × 元素大小」计算任意元素的地址，因此**随机访问 O(1)**。

## 关键结论
- 插入 / 删除中间元素需要移动后续元素，平均 O(n)
- 动态数组（vector / ArrayList）扩容策略：容量翻倍，n 次插入总扩容成本 O(n)，**均摊 O(1)**
- 二分查找依赖数组的随机访问，链表无法二分

## 常见错误
1. 用 sizeof(arr)/sizeof(arr[0]) 在函数参数中求长度 —— 数组退化为指针，结果恒为 1
2. 遍历时删除元素导致下标错位
3. 越界访问（i <= n），这是段错误/数组越界的高发来源

## 适用场景
按序存储、频繁随机访问、尾部增删多（如栈）。中间频繁增删应改用链表。`
    },

    { id: 'k02', category: '数据结构', title: '链表（单链表 / 双链表）', difficulty: 1,
      summary: '非连续存储的线性表：已知位置插入删除 O(1)，不支持随机访问。',
      tags: ['链表', '指针', '线性表'],
      complexity: '插入/删除 O(1)（已知位置） · 访问 O(n)',
      codeLang: 'cpp',
      code: 'struct Node { int val; Node* next; };\n// 头插法（注意先连后断）\nNode* p = new Node{x, head};\nhead = p;\n// 删除后继节点\ntmp = cur->next;\ncur->next = tmp->next;\ndelete tmp;',
      detail: `## 核心思想
链表节点存储**数据 + 指针**，靠指针串联，内存可以不连续。因此在已知节点位置时，插入/删除只需改指针，为 **O(1)**；但访问第 i 个元素必须从头走，为 O(n)。

## 关键结论
- 头插法、尾插法；单链表删除需要前驱，所以常用**虚拟头节点 dummy** 简化边界
- 双链表可以 O(1) 找到前驱
- **判断环**：快慢指针（Floyd 判圈），快指针每次 2 步、慢指针 1 步，有环必相遇

## 常见错误
1. 插入时先断后连顺序颠倒，导致丢链
2. 删除后忘记释放内存（内存泄漏）或误删 head
3. 空链表 / 单节点时没有处理边界

## 适用场景
中间频繁插入删除、长度频繁变化、无法预分配内存（如内核链表、LRU 缓存）。`
    },

    { id: 'k03', category: '数据结构', title: '栈与队列', difficulty: 1,
      summary: '栈后进先出 LIFO，队列先进先出 FIFO，都是受限的线性表。',
      tags: ['栈', '队列', 'LIFO', 'FIFO'],
      complexity: '入/出均为 O(1)',
      codeLang: 'cpp',
      code: 'stack<int> st;       // LIFO\nst.push(1); st.pop(); st.top();\nqueue<int> q;        // FIFO\nq.push(1); q.pop(); q.front();\n// 双端队列 deque：两端都可进出',
      detail: `## 核心思想
- **栈（Stack）**：后进先出 LIFO，只能在栈顶操作
- **队列（Queue）**：先进先出 FIFO，队尾进、队首出
- 双端队列 deque 两端都支持进出；单调栈/单调队列是高频优化技巧

## 典型应用
- 栈：函数调用栈、括号匹配、表达式求值、DFS（递归本质是栈）
- 队列：BFS 层序遍历、消息队列、CPU 任务调度、滑动窗口

## 常见错误
1. 空栈调用 top()/pop() —— 先判「!st.empty()」
2. 用栈实现队列（或反之）时，搬移数据不清空另一半
3. 括号匹配只计数不匹配类型，( [ ) ] 这类非法串误判为合法

## 面试高频
两个栈实现队列：入队压入 A；出队时若 B 空，把 A 全部倒入 B 再 pop。均摊 O(1)。`
    },

    { id: 'k04', category: '数据结构', title: '哈希表（散列表）', difficulty: 2,
      summary: '键值映射，平均 O(1) 增删查；解决冲突用链地址法或开放寻址。',
      tags: ['哈希表', '散列表', '哈希冲突', 'map'],
      complexity: '增删查平均 O(1) · 最坏 O(n)',
      codeLang: 'cpp',
      code: 'unordered_map<string,int> mp;\nmp["key"] = 1;              // 插入/更新\nif (mp.count("key")) { }    // 查找（避免 mp["x"] 隐式插入）\nmp.erase("key");            // 删除',
      detail: `## 核心思想
用**哈希函数**把键映射到数组下标，理想情况下一次定位，平均 O(1)。

## 冲突解决
- **链地址法**：同下标的元素挂在链表上（Java HashMap、C++ unordered_map）
- **开放寻址法**：冲突后按探测序列找下一个空位（线性探测、二次探测）

## 关键结论
- 负载因子 = 元素数 / 桶数，过大时触发 **rehash**（扩容 + 重新哈希），单次最坏 O(n)
- unordered_map 键需要哈希函数，自定义结构体要特化 hash
- map（红黑树）有序 O(log n)，unordered_map 无序 O(1)；需要顺序输出必须用 map

## 常见错误
1. 用 mp[x] 判断存在性 —— 不存在时会**隐式插入**默认值
2. 遍历容器时修改容器导致迭代器失效
3. 哈希函数质量差（如都映射到同一下标）导致退化 O(n)

## 经典应用
两数之和、字符串去重、缓存 LRU、并查集路径压缩。`
    },

    { id: 'k05', category: '数据结构', title: '二叉树与遍历', difficulty: 2,
      summary: '前中后序 + 层序遍历；递归是树的天然表达方式。',
      tags: ['二叉树', '递归', '遍历', '层序遍历'],
      complexity: '遍历 O(n) · 高度 O(log n)~O(n)',
      codeLang: 'cpp',
      code: '// 中序遍历（左-根-右）\nvoid inorder(TreeNode* r) {\n    if (!r) return;\n    inorder(r->left);\n    visit(r);\n    inorder(r->right);\n}\n// 层序遍历（BFS + 队列）',
      detail: `## 四种遍历
| 遍历 | 顺序 | 用途 |
|---|---|---|
| 前序 | 根-左-右 | 拷贝树、前缀表达式 |
| 中序 | 左-根-右 | 二叉搜索树输出有序序列 |
| 后序 | 左-右-根 | 删除树、计算树高度 |
| 层序 | 按层从左到右 | BFS、求宽度/层平均值 |

## 关键结论
- 中序 + (前序/后序) 可**唯一还原二叉树**；只有前序+后序不行
- 前序/中序/后序可用栈实现非递归版本，避免递归栈溢出
- 满二叉树第 i 层最多 2^(i-1) 个节点；完全二叉树适合用数组存储（下标计算父子：i → 2i+1 / 2i+2）

## 常见错误
1. 递归忘记判空（空节点解引用）
2. 把「叶子」条件写成 !r 而不是 !r->left && !r->right
3. 递归层数过深（链表化树）导致栈溢出

## 高频考点
二叉树最大深度、对称二叉树、翻转二叉树、最近公共祖先。`
    },

    { id: 'k06', category: '数据结构', title: '二叉搜索树与平衡树', difficulty: 3,
      summary: '左小右大的有序二叉树；退化时退化为链表，平衡树（AVL/红黑树）保证 O(log n)。',
      tags: ['二叉搜索树', 'BST', 'AVL', '红黑树', '平衡树'],
      complexity: 'BST 均摊 O(log n) · 退化最坏 O(n)',
      codeLang: 'cpp',
      code: '// 判断是否 BST：中序遍历递增\nlong prev = LONG_MIN;\nbool isValid(TreeNode* r) {\n    if (!r) return true;\n    if (!isValid(r->left)) return false;\n    if (r->val <= prev) return false;\n    prev = r->val;\n    return isValid(r->right);\n}',
      detail: `## 核心思想
**左子树所有值 < 根 < 右子树所有值**，中序遍历得到递增序列。查找/插入/删除平均 O(log n)。

## 为什么需要平衡树
按升序依次插入 BST 会退化成链表（最坏 O(n)），所以引入自平衡：
- **AVL 树**：任何子树高度差 ≤ 1，查询最快，插入删除要更多旋转
- **红黑树**：放宽平衡条件（最长路径 ≤ 2× 最短路径），插入删除更高效 —— C++ map/set 内部实现

## 常见错误
1. 只比较「r->left->val < r->val < r->right->val」判断 BST —— 忽略了左子树的**所有**节点都要小于根
2. 旋转时漏改父指针
3. 用 int 存 prev 判断单调性，遇到边界值溢出（应选 LONG_MIN 起始）

## 高频考点
验证 BST、第 K 小元素、删除节点（分 0/1/2 子节点三种情况）、AVL 旋转类型（LL/RR/LR/RL）。`
    },

    { id: 'k07', category: '数据结构', title: '图与遍历（BFS / DFS）', difficulty: 3,
      summary: '邻接表/邻接矩阵存储；BFS 求最短路径，DFS 判环/拓扑排序。',
      tags: ['图', 'BFS', 'DFS', '拓扑排序', '最短路径'],
      complexity: '邻接表遍历 O(V+E)',
      codeLang: 'cpp',
      code: 'vector<int> g[N];              // 邻接表\nvoid bfs(int s) {\n    queue<int> q; vector<bool> vis(N);\n    q.push(s); vis[s] = true;\n    while (!q.empty()) {\n        int u = q.front(); q.pop();\n        for (int v : g[u])\n            if (!vis[v]) { vis[v] = true; q.push(v); }\n    }\n}',
      detail: `## 存储方式
- **邻接矩阵** g[i][j]：O(1) 判断两点是否有边，空间 O(V²)，适合稠密图
- **邻接表** vector<int> g[]：空间 O(V+E)，遍历快，适合稀疏图（最常用）

## BFS 与 DFS
- **BFS**：队列，按层扩散。**无权图求最短路**的标准方法（第一次到达即最短）
- **DFS**：递归/栈，沿一条路走到底。用于判环、拓扑排序、连通分量、回溯

## 关键结论
- 拓扑排序（有向无环图）：入度为 0 的依次出队（BFS 版）；也可用 DFS 逆后序
- 判环：有向图用 DFS 三色标记；无向图 DFS 时遇到非父节点的已访问点即环
- 图 DFS 必须带 visited，否则成环死循环

## 常见错误
1. 邻接表遍历时未标记导致重复入队
2. 邻接矩阵把「无边」和「权值 0」混淆
3. 递归 DFS 层数过深爆栈（改迭代+显式栈）

## 高频考点
课程表（拓扑排序）、岛屿数量（连通分量）、腐烂的橘子（BFS 层数）、克隆图。`
    },

    // ==================== 算法 ====================
    { id: 'k08', category: '算法', title: '排序算法总览（快排 / 归并）', difficulty: 2,
      summary: '基于比较的排序最优 O(n log n)；快排有最坏退化，归并稳定。',
      tags: ['排序', '快速排序', '归并排序', '时间复杂度'],
      complexity: '快排平均 O(n log n) 最坏 O(n²) · 归并 O(n log n)',
      codeLang: 'cpp',
      code: '// 快速排序核心：partition（双指针）\nint part(vector<int>& a, int l, int r) {\n    int p = a[r], i = l - 1;\n    for (int j = l; j < r; j++)\n        if (a[j] < p) swap(a[++i], a[j]);\n    swap(a[i+1], a[r]);\n    return i + 1;\n}',
      detail: `## 常用排序对比
| 算法 | 平均 | 最坏 | 空间 | 稳定 |
|---|---|---|---|---|
| 冒泡/插入/选择 | O(n²) | O(n²) | O(1) | 冒泡/插入稳定，选择不稳定 |
| 希尔 | ~O(n^1.3) | O(n²) | O(1) | 不稳定 |
| 归并 | O(n log n) | O(n log n) | O(n) | **稳定** |
| 快速 | O(n log n) | O(n²) | O(log n) | 不稳定 |
| 堆 | O(n log n) | O(n log n) | O(1) | 不稳定 |

## 关键结论
- 基于比较的排序**下界是 O(n log n)**（决策树证明）
- 快排最坏情况：每次 pivot 选到极值（已有序数组若不随机化）
- 归并排序**稳定**且适合外排序（磁盘）；求逆序对是归并的经典变形
- 数据基本有序时插入排序接近 O(n)

## 常见错误
1. 快排 partition 边界写错（「<=」与「<」混淆）导致死循环
2. 归并忘记拷贝回原数组
3. 认为快排稳定或归并不需要额外空间

## 高频考点
第 K 大元素（快排划分思想 O(n)）、逆序对、手写快速/归并排序。`
    },

    { id: 'k09', category: '算法', title: '二分查找', difficulty: 2,
      summary: '有序序列上每次排除一半，O(log n)；难点全在边界条件。',
      tags: ['二分查找', '边界', '有序'],
      complexity: 'O(log n)',
      codeLang: 'cpp',
      code: '// 左闭右开 [l, r)，找第一个 >= x 的位置\nint lower(vector<int>& a, int x) {\n    int l = 0, r = a.size();\n    while (l < r) {\n        int m = l + (r - l) / 2;\n        if (a[m] >= x) r = m;\n        else l = m + 1;\n    }\n    return l;\n}',
      detail: `## 核心思想
每次取中点，排除一半搜索区间，O(log n)。**前提是有序**（或满足单调性）。

## 区间模板（推荐）
- 左闭右开 [l, r)：while (l < r)，mid 用 l + (r-l)/2
  - 找第一个 >= x（lower_bound）：a[mid] >= x 则 r = mid，否则 l = mid+1
  - 找第一个 > x（upper_bound）：a[mid] > x 则 r = mid
- 左闭右闭 [l, r]：while (l <= r)

## 常见错误
1. **mid 溢出**：用 l + (r-l)/2 而不是 (l+r)/2
2. 死循环：l = mid 与 r = mid+1 搭配不当（mid 应向上取整）
3. 边界：返回 l 后没检查是否越界或是否满足条件
4. 二分答案时验证函数单调性写反

## 经典变形
- 二分答案：求最大值中的最小（如「最小化最大和」）
- 旋转有序数组搜索（两次二分）
- 浮点二分：固定次数循环（如 100 次）代替精度判断。`
    },

    { id: 'k10', category: '算法', title: '动态规划入门', difficulty: 3,
      summary: '重叠子问题 + 最优子结构；核心是「状态定义」与「状态转移方程」。',
      tags: ['动态规划', 'DP', '状态转移', '背包'],
      complexity: '常见 O(n²) 或 O(n·m)',
      codeLang: 'cpp',
      code: '// 0-1 背包：容量 C，物品重量 w[i] 价值 v[i]\nvector<int> dp(C+1, 0);\nfor (int i = 0; i < n; i++)\n    for (int c = C; c >= w[i]; c--)   // 逆序防重复选\n        dp[c] = max(dp[c], dp[c-w[i]] + v[i]);\n// 答案 dp[C]',
      detail: `## 核心思想
把大问题拆成**重叠的子问题**，用数组记录子问题答案，避免重复计算（记忆化）。适用条件：**最优子结构** + 无后效性。

## 解题五步
1. 定义状态：dp[i] 表示什么（i 的含义）
2. 找状态转移方程：dp[i] = f(dp[...])
3. 初始化边界：dp[0]、dp[1] 等
4. 确定遍历顺序（正序/逆序，含背包的维度顺序）
5. 结果在哪：dp[n]、dp[n][m] 或 max(dp)

## 背包要点
- **0-1 背包**：每个物品一次，容量维**逆序**滚动
- **完全背包**：可无限选，容量维**正序**
- 求「恰好装满」：初始化为 -∞（除 dp[0]=0）；求「最大价值」：初始化 0

## 常见错误
1. 状态少一个维度（如买卖股票忘记录「是否持有」）
2. 遍历顺序写反（0-1 与完全背包混淆）
3. 数组越界但结果碰巧正确（测试数据弱时发现不了）

## 高频考点
爬楼梯、最长公共子序列、最长递增子序列（O(n log n) 贪心+二分）、编辑距离、打家劫舍、背包变形。`
    },

    { id: 'k11', category: '算法', title: '递归与回溯', difficulty: 2,
      summary: '递归三要素：终止条件、递推关系、返回值；回溯 = 试探 + 撤销。',
      tags: ['递归', '回溯', '剪枝', 'DFS'],
      complexity: '指数级（回溯）· 线性/对数（普通递归）',
      codeLang: 'cpp',
      code: '// 全排列回溯模板\nvoid bt(vector<int>& a, int k) {\n    if (k == a.size()) { save(a); return; }\n    for (int i = k; i < a.size(); i++) {\n        swap(a[k], a[i]);   // 选择\n        bt(a, k+1);         // 递归\n        swap(a[k], a[i]);   // 撤销（回溯）\n    }\n}',
      detail: `## 递归三要素
1. **终止条件**（base case）
2. **递推关系**（自我调用，问题规模缩小）
3. **返回值/副作用**（合并子问题结果）

## 回溯本质
DFS + 状态恢复。模板：
\`\`\`
选择 → 递归 → 撤销选择
\`\`\`
搜索树剪枝能大幅减少时间：排序优化、可行性剪枝、最优性剪枝、去重剪枝（同一层跳过相同元素）。

## 常见错误
1. 忘写终止条件 → 栈溢出
2. 回溯完不**撤销**状态（数组/visited 没恢复），结果被污染
3. 在循环里递归却共用了同一个引用对象
4. 层内去重与路径去重的条件混淆

## 高频考点
全排列/子集（含重复元素去重）、N 皇后、组合总和、岛屿问题、括号生成。`
    },

    { id: 'k12', category: '算法', title: '贪心算法', difficulty: 2,
      summary: '每步取局部最优，凭「贪心选择性质」成立；不是所有最优化都能贪心。',
      tags: ['贪心', '局部最优', '区间问题'],
      complexity: '通常 O(n log n)（排序后扫描）',
      codeLang: 'cpp',
      code: '// 活动安排：按结束时间排序，能选就选\nsort(acts, [](a,b){ return a.end < b.end; });\nint cnt = 0, last = -1;\nfor (auto& a : acts)\n    if (a.start >= last) { cnt++; last = a.end; }',
      detail: `## 核心思想
每一步做**当前看起来最好**的选择，期望全局最优。成立前提：问题具有**贪心选择性质**（局部最优能推出全局最优）和最优子结构。

## 经典贪心
- 活动安排 / 无重叠区间：按**结束时间**排序
- 找零问题（硬币面额特殊时）、哈夫曼编码、最小生成树（Prim/Kruskal）都是贪心
- 跳跃游戏：维护「最远可达位置」

## 为什么有时贪心是错的
贪心没有回溯，只看眼前。例如 0-1 背包贪心（按性价比装）会错 —— 需要 DP。硬币面额 {1,3,4} 凑 6 元贪心得 4+1+1=3 枚，最优是 3+3=2 枚。

## 常见错误
1. 排序关键字选错（比如按开始时间排序安排活动）
2. 分不清贪心与 DP，用贪心解只有 DP 能解的问题
3. 局部贪心时忘记更新全局状态

## 验证方法
能证明「交换论证/反证法」才敢用；拿不准就用 DP 对拍小数据。`
    },

    // ==================== 操作系统 ====================
    { id: 'k13', category: '操作系统', title: '进程与线程', difficulty: 2,
      summary: '进程是资源分配单位，线程是调度执行单位；线程共享进程资源。',
      tags: ['进程', '线程', '并发', '上下文切换'],
      complexity: '上下文切换：进程开销 > 线程',
      codeLang: 'cpp',
      code: '// 创建线程（C++11）\n#include <thread>\nstd::thread t([]() { do_work(); });\nt.join();      // 等待结束\n// t.detach(); // 后台运行',
      detail: `## 进程 vs 线程
| 维度 | 进程 | 线程 |
|---|---|---|
| 资源 | **独立**地址空间、文件描述符 | **共享**进程地址空间 |
| 调度 | 操作系统调度 | 是调度的实际执行单元 |
| 通信 | IPC（管道、消息队列、共享内存） | 直接读写共享变量（需同步） |
| 开销 | 创建/切换开销大 | 轻量，切换快 |
| 崩溃 | 一个进程崩溃不影响其他 | 一个线程崩溃可能拖垮进程 |

## 关键结论
- 线程独享：栈、寄存器、程序计数器；共享：堆、全局变量、文件
- 上下文切换：保存/恢复寄存器与状态，进程切换还要切页表（TLB 失效，代价高）
- 协程更轻：用户态切换，不陷入内核

## 常见错误
1. 多线程同时写共享变量不加锁（数据竞争）
2. join 与 detach 都用 / 都不用
3. 误以为多线程一定比单线程快（切换与竞争有开销）

## 高频考点
进程状态转换、僵尸进程/孤儿进程、线程安全、并发模型对比。`
    },

    { id: 'k14', category: '操作系统', title: '内存管理（分页与虚拟内存）', difficulty: 3,
      summary: '页表映射虚拟地址到物理地址；缺页中断 + 页面置换算法。',
      tags: ['分页', '虚拟内存', '页表', '缺页中断', 'LRU'],
      complexity: '地址转换由 MMU 硬件完成 + TLB 加速',
      codeLang: 'cpp',
      code: '// 页面置换 LRU 思想（哈希表 + 双向链表）\n// get: 移到链表头; put: 满则淘汰链表尾\n// 实现框架（LeetCode 146 LRU Cache）',
      detail: `## 为什么需要虚拟内存
- 每个进程拥有独立的**连续虚拟地址空间**，实际物理内存可以分散、部分驻留
- 实现进程隔离、内存共享、内存超售（比物理内存大的程序也能跑）

## 分页机制
- 虚拟地址 = 页号 + 页内偏移；页表记录 页号 → 物理页框
- **TLB**（快表）：缓存最近用过的页表项，命中则免查内存
- **多级页表**：解决页表过大问题（32 位两级，64 位四级）
- **缺页中断**：访问的页不在内存 → 陷入内核 → 换入页面

## 页面置换算法
- **OPT**（最优，不能实现，用作基准）
- **LRU**（最近最久未使用，效果最好；哈希表+双向链表 O(1)）
- **FIFO**（先进先出，有 Belady 异常：帧数增多缺页反而增多）
- Clock 算法（LRU 近似，硬件支持访问位）

## 常见错误
1. 把逻辑地址直接当物理地址
2. 混淆段式与页式（段有逻辑意义，页固定大小）
3. LRU 实现用队列而不是哈希+链表，复杂度 O(n)

## 高频考点
缺页率计算、地址翻译过程、Belady 异常、TLB 作用。`
    },

    { id: 'k15', category: '操作系统', title: '死锁', difficulty: 2,
      summary: '互斥 + 占有并等待 + 不可剥夺 + 循环等待，四条件缺一不可。',
      tags: ['死锁', '互斥', '银行家算法', '资源分配'],
      complexity: '银行家算法复杂度 O(n²·m)',
      codeLang: 'text',
      code: '// 死锁四条件（同时满足才死锁）\n// 1. 互斥      ：资源独占\n// 2. 占有并等待：持有资源 A 又申请 B\n// 3. 不可剥夺  ：只能自愿释放\n// 4. 循环等待  ：A→B→C→A 环',
      detail: `## 定义
一组进程互相等待对方持有的资源，导致所有进程都无法继续推进。

## 四个必要条件（同时成立才死锁）
1. **互斥**：资源不能共享
2. **占有并等待**：持有资源的同时申请新资源
3. **不可剥夺**：资源不能被抢占
4. **循环等待**：存在进程-资源的等待环

## 处理策略
- **预防**：破坏四个条件之一（如一次性申请所有资源、资源排序法）
- **避免**：银行家算法（分配前检查是否仍有安全序列）
- **检测与恢复**：资源分配图 + 定期检测环，出现死锁则回滚/剥夺/终止进程
- **鸵鸟策略**：假装没有（实际系统常用，重启解决）

## 常见错误
1. 认为「有循环等待就一定死锁」——四条件须同时成立
2. 银行家算法计算安全序列时忽略已分配资源
3. 加锁顺序不一致（A→B 与 B→A 混用）导致潜在死锁；一致性加锁顺序即可避免

## 高频考点
判断系统是否安全（安全序列）、银行家算法计算题、死锁四个必要条件辨析。`
    },

    // ==================== 计算机网络 ====================
    { id: 'k16', category: '计算机网络', title: 'TCP 三次握手与四次挥手', difficulty: 2,
      summary: '建立连接 3 次（双方确认收发能力），释放连接 4 次（半关闭）。',
      tags: ['TCP', '三次握手', '四次挥手', 'SYN', 'FIN'],
      complexity: '连接建立 1.5 RTT · TIME_WAIT = 2 MSL',
      codeLang: 'text',
      code: '握手:  C -> S : SYN(seq=x)\n       S -> C : SYN+ACK(seq=y, ack=x+1)\n       C -> S : ACK(ack=y+1)\n挥手:  C -> S : FIN           S -> C : ACK\n       S -> C : FIN           C -> S : ACK\n       C 进入 TIME_WAIT(2MSL)',
      detail: `## 三次握手
1. 客户端发 SYN —— 证明客户端**发送**能力
2. 服务端回 SYN+ACK —— 证明服务端收发能力
3. 客户端发 ACK —— 证明客户端**接收**能力

**为什么不是两次**：两次时服务端无法确认客户端能收到自己的 SYN；且旧 SYN 重传可能建立历史连接。**为什么不是四次**：服务端 SYN 和 ACK 可合并发送。

## 四次挥手
FIN 表示「我没数据要发了」，但对方可能还有数据，因此 ACK 和 FIN 分开发，产生 4 个报文。主动关闭方最后进入 **TIME_WAIT**（2 MSL），等待旧报文在网络中消亡，防止影响下一个相同四元组的连接。

## 常见错误
1. 混淆 ack 与 seq 的数值关系（ack = 对方 seq + 1）
2. 认为挥手一定是 4 次——双方同时关闭可能合并
3. 不知道 TIME_WAIT 过多会占端口（对应 TIME_WAIT 优化、SO_REUSEADDR）

## 高频考点
握手挥手状态转换图（LISTEN→SYN_SENT→ESTABLISHED 等）、为什么握手 3 次挥手 4 次。`
    },

    { id: 'k17', category: '计算机网络', title: 'HTTP 与 HTTPS', difficulty: 2,
      summary: '无状态请求/响应协议；HTTPS = HTTP + TLS 加密层。',
      tags: ['HTTP', 'HTTPS', 'TLS', '状态码', 'GET/POST'],
      complexity: 'HTTPS 握手约 2 RTT（TLS 1.3 降至 1 RTT）',
      codeLang: 'javascript',
      code: 'fetch("https://api.example.com/x", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({ a: 1 })\n}).then(r => r.json());',
      detail: `## 核心特征
- **无状态**：每次请求独立，状态靠 Cookie / Session / Token 维持
- 基于 TCP，默认 80 端口；HTTPS 走 TLS，443 端口

## 常见状态码
| 类别 | 含义 | 代表 |
|---|---|---|
| 2xx | 成功 | 200 OK / 201 Created / 204 No Content |
| 3xx | 重定向 | 301 永久 / 302 临时 / 304 未修改（缓存） |
| 4xx | 客户端错误 | 400 参数 / 401 未认证 / 403 无权限 / 404 不存在 |
| 5xx | 服务端错误 | 500 内部 / 502 网关 / 503 不可用 |

## GET 与 POST
- GET：参数在 URL，可缓存、可收藏，**幂等**，长度受限
- POST：数据在请求体，创建资源，不幂等
- 本质区别是语义，而不是「安全」

## HTTPS 握手（简化）
客户端 → ClientHello（随机数+支持的套件）→ 服务端 → 证书 + ServerHello → 双方协商会话密钥 → 之后对称加密通信。**证书链验证**（CA 签名）防止中间人。

## 常见错误
1. 用 GET 提交敏感数据（进日志/历史/Referer）
2. 混用 HTTP/HTTPS 资源导致浏览器拦截（mixed content）
3. 忽略 401 与 403 的区别（未认证 vs 已认证但无权限）`
    },

    { id: 'k18', category: '计算机网络', title: 'OSI 七层模型与 TCP/IP', difficulty: 1,
      summary: '分层解耦：物理 → 数据链路 → 网络 → 传输 → 会话/表示/应用。',
      tags: ['OSI', 'TCP/IP', '分层', '协议栈'],
      complexity: '概念模型，记忆口诀「物数网传会表应」',
      codeLang: 'text',
      code: '应用层:  HTTP/FTP/DNS\n传输层:  TCP/UDP (端口)\n网络层:  IP/ICMP (IP地址)\n链路层:  以太网 (MAC地址)\n物理层:  比特流',
      detail: `## 七层模型
| 层 | 功能 | 协议/设备 | 数据单位 |
|---|---|---|---|
| 应用层 | 提供用户服务 | HTTP、FTP、DNS | 报文 |
| 表示层 | 编码/加解密 | JPEG、SSL | — |
| 会话层 | 建立会话 | RPC | — |
| 传输层 | 端到端可靠性 | TCP、UDP | 报文段 |
| 网络层 | 路由寻址 | IP、ICMP、路由器 | 分组 |
| 数据链路层 | 相邻节点传输 | 以太网、交换机、MAC | 帧 |
| 物理层 | 比特传输 | 集线器、网线 | 比特 |

## TCP/IP 四层
应用层（合并会话/表示/应用）→ 传输层 → 网际层 → 网络接口层（合并数据链路+物理）。

## 常见错误
1. 把「路由器」归到数据链路层（路由器工作在网络层，按 IP 转发）
2. 交换机是二层设备（按 MAC），路由器是三层设备
3. TLS 介于传输层与应用层之间（通常画在会话/表示层）

## 高频考点
各层常见协议归类、封装/解封装过程（加头去头）、设备所属层次。`
    },

    // ==================== 数据库 ====================
    { id: 'k19', category: '数据库', title: '索引与 B+ 树', difficulty: 3,
      summary: '索引加速查询；B+ 树是关系数据库主流索引结构，叶子层形成有序链表。',
      tags: ['索引', 'B+树', '主键索引', '聚簇索引'],
      complexity: 'B+ 树查找/插入/删除 O(log n)',
      codeLang: 'sql',
      code: 'CREATE INDEX idx_name ON users(name);\n-- 最左前缀：联合索引 (a,b) 可用 a，不可单独用 b\nSELECT * FROM t WHERE a = 1 AND b = 2;  -- 走索引\nSELECT * FROM t WHERE b = 2;            -- 不走索引',
      detail: `## 为什么是 B+ 树
二叉搜索树在磁盘上太高（磁盘 IO 次数多）。B+ 树每个节点存**多路**关键字（一个节点一页），树高压缩到 3~4 层，IO 次数少。叶子节点**按顺序用链表相连**，适合范围查询。

## B+ 树 vs B 树
- B+ 树：数据只存**叶子节点**，非叶子只存键 → 一页能装更多键，树更矮；范围查询快
- B 树：数据可存任意节点，单点查询可能更快

## 关键结论
- **聚簇索引**（InnoDB 主键）：数据按主键顺序存储，叶子页即数据行
- **二级索引**：叶子存主键值，查非索引列需**回表**
- **覆盖索引**：查询列都在索引里，免回表
- **联合索引最左前缀**：(a,b,c) 支持 a / a,b / a,b,c 查询，不支持只查 b

## 常见错误
1. 索引越多越好 —— 每次写都要维护索引
2. 对低区分度列（如性别）建索引，优化器弃用
3. 在索引列上做函数运算 WHERE func(col)=x 导致索引失效
4. LIKE '%关键字' 前缀通配无法用索引

## 高频考点
为什么用 B+ 树不用红黑树/Hash、回表与覆盖索引、联合索引最左匹配。`
    },

    { id: 'k20', category: '数据库', title: '事务与隔离级别', difficulty: 3,
      summary: 'ACID 四特性；并发事务隔离级别约束脏读/不可重复读/幻读。',
      tags: ['事务', 'ACID', '隔离级别', 'MVCC', '脏读'],
      complexity: 'MVCC 提供无锁快照读',
      codeLang: 'sql',
      code: 'BEGIN;\nUPDATE accounts SET balance = balance - 100\n  WHERE id = 1 AND balance >= 100;\nUPDATE accounts SET balance = balance + 100\n  WHERE id = 2;\nCOMMIT;   -- 失败则 ROLLBACK',
      detail: `## ACID
- **原子性**：要么全做要么全不做（undo log 回滚）
- **一致性**：事务前后数据满足约束
- **隔离性**：并发事务互不干扰（锁 + MVCC）
- **持久性**：提交后不丢失（redo log）

## 并发问题与隔离级别
| 级别 | 脏读 | 不可重复读 | 幻读 |
|---|---|---|---|
| READ UNCOMMITTED | 会 | 会 | 会 |
| READ COMMITTED | 否 | 会 | 会 |
| REPEATABLE READ（MySQL 默认） | 否 | 否 | 部分解决 |
| SERIALIZABLE | 否 | 否 | 否 |

- **脏读**：读到未提交的数据
- **不可重复读**：同一事务两次读同一条数据结果不同（别人改了）
- **幻读**：同一事务两次查询行数不同（别人插了行）

## MVCC 要点（InnoDB）
每行记录带**版本链**（事务 id），读操作按 ReadView 找可见版本，不加锁实现快照读。写操作仍然加锁。

## 常见错误
1. 把不可重复读（update）和幻读（insert/delete）混为一谈
2. 忘记显式事务导致部分提交
3. 长事务持有旧 ReadView，导致 undo log 无法回收。`
    },

    { id: 'k21', category: '数据库', title: 'SQL 连接（JOIN）', difficulty: 1,
      summary: 'INNER/LEFT/RIGHT/FULL 四种连接；LEFT JOIN 保左表全部行。',
      tags: ['SQL', 'JOIN', '左连接', '笛卡尔积'],
      complexity: '多表连接注意关联条件与索引',
      codeLang: 'sql',
      code: '-- 内连接：两表都匹配\nSELECT u.name, o.total FROM users u\n  JOIN orders o ON u.id = o.user_id;\n-- 左连接：保留左表全部，右表无匹配为 NULL\nSELECT u.name, o.total FROM users u\n  LEFT JOIN orders o ON u.id = o.user_id;',
      detail: `## 四种 JOIN
| 类型 | 结果 |
|---|---|
| INNER JOIN | 两表都匹配的行 |
| LEFT JOIN | 左表全部 + 右表匹配行（右表无匹配填 NULL） |
| RIGHT JOIN | 与 LEFT 对称 |
| FULL JOIN | 并集（MySQL 用 UNION 模拟） |

## 关键结论
- 没有 ON 条件的连接是**笛卡尔积**（左表行数 × 右表行数，灾难性）
- LEFT JOIN 右表过滤条件写在 **ON** 里（保留左表行）；写在 WHERE 里会过滤掉 NULL 行，等同内连接
- 连接顺序影响性能：小表驱动大表，连接列建索引

## 常见错误
1. SELECT * 多表连接出现重名列歧义
2. LEFT JOIN 后 WHERE 过滤右表列，意外退化为内连接
3. 一对多连接导致聚合值重复计算（先聚合再连接）

## 高频考点
「找出没有订单的用户」（LEFT JOIN + IS NULL）、自连接（员工-经理）、NOT IN vs NOT EXISTS（NULL 陷阱）。`
    },

    // ==================== 语言基础 ====================
    { id: 'k22', category: '语言基础', title: '指针与引用（C / C++）', difficulty: 2,
      summary: '指针存地址可空可改，引用是别名不可空；数组作参数时退化为指针。',
      tags: ['指针', '引用', '数组退化', '内存'],
      complexity: '指针运算按元素大小步进',
      codeLang: 'cpp',
      code: 'int a = 10;\nint* p = &a;     // 指针：存地址\n*p = 20;         // 解引用修改\nint& r = a;      // 引用：别名，不可重新绑定\nr = 30;          // 等价 a = 30\n// a 现在是 30',
      detail: `## 指针 vs 引用
| 维度 | 指针 | 引用 |
|---|---|---|
| 初始化 | 可不初始化（野指针风险） | **必须**初始化 |
| 可空 | 可为 nullptr | 不可空 |
| 重新绑定 | 可指向别的对象 | 不可以 |
| 运算 | 支持 +- 运算 | 不支持 |
| 语法 | 需 * 解引用 | 直接当普通变量用 |

## 数组与指针
- 数组名是首元素地址的**常量**（不能 ++），数组作为函数参数时**退化为指针**，sizeof(arr) 变 4/8 字节 —— 在函数内无法用 sizeof 求长度，必须另行传参
- a[i] 等价于 *(a+i)：指针按**元素类型大小**步进，不是按字节

## 常见错误
1. 返回局部变量的地址/引用（悬垂引用）
2. 忘释放 new 的内存（泄漏）或二次 delete（double free）
3. 「int* p, q;」 —— 只有 p 是指针，q 是 int！
4. 函数内 sizeof 数组求长度得 1

## 高频考点
指针常量 vs 常量指针、malloc/free 与 new/delete 配对、悬垂指针与野指针。`
    },

    { id: 'k23', category: '语言基础', title: 'JavaScript 闭包与原型链', difficulty: 2,
      summary: '闭包 = 函数 + 外层词法环境；继承靠原型链，而非类。',
      tags: ['闭包', '原型链', 'this', '作用域'],
      complexity: '闭包常用于防抖节流/私有变量',
      codeLang: 'javascript',
      code: '// 闭包：计数器私有变量\nfunction makeCounter() {\n  let n = 0;                 // 被内层函数捕获\n  return () => ++n;\n}\nconst c = makeCounter();\nc(); c(); // 1, 2\n// 原型链：\nfunction Dog(name){ this.name = name; }\nDog.prototype.bark = function(){};',
      detail: `## 闭包
函数 + 其创建时的词法作用域。内层函数引用外层变量，即使外层函数已返回，变量依然存活（被闭包持有）。用途：私有变量、防抖/节流、柯里化。

**注意**：var 循环创建闭包的经典坑 —— 循环内用 var i 声明的回调全部共享同一个 i。用 let 或立即执行函数解决。

## 原型链
- 每个对象有 __proto__ 指向构造函数的 prototype
- 属性查找沿原型链向上：自身 → 原型 → Object.prototype → null
- ES6 class 只是语法糖，本质仍是原型
- instanceof 检查构造函数的 prototype 是否在对象原型链上

## this 的四种绑定
1. 默认绑定：严格模式下 undefined，非严格 window
2. 隐式绑定：obj.fn() → obj
3. 显式绑定：call / apply / bind
4. new 绑定：新对象
箭头函数**没有自己的 this**，捕获外层 this（不能用 new）。

## 常见错误
1. 把对象方法作回调时丢失 this（需 bind）
2. 循环中闭包共享 var 变量
3. 原型上直接放数据（所有实例共享同一份引用类型）`
    },

    { id: 'k24', category: '语言基础', title: 'Python 常用特性（推导式 / 装饰器）', difficulty: 2,
      summary: '推导式简洁构建容器；装饰器 = 包装函数的高阶函数。',
      tags: ['Python', '推导式', '装饰器', '可变对象'],
      complexity: '列表推导 O(n)，比显式 for 更快',
      codeLang: 'python',
      code: '# 推导式\nsquares = [x*x for x in range(10) if x % 2 == 0]\nd = {k: v for k, v in pairs}\n# 装饰器：打印函数耗时\nimport time\ndef timer(fn):\n    def wrapper(*a, **kw):\n        t = time.time(); r = fn(*a, **kw)\n        print(f"{fn.__name__}: {time.time()-t:.3f}s")\n        return r\n    return wrapper',
      detail: `## 推导式
- 列表：[expr for x in it if cond]
- 字典：{k: v for ...}；集合：{x for ...}；生成器：(x for ...)（惰性）
- 比等价的显式 for 循环更快（C 层实现），但逻辑复杂时分多行写更可读

## 装饰器
本质：timer(fn) 返回包装后的新函数。@timer 等价于 fn = timer(fn)。
- 带参数的装饰器：外层再包一层函数（三层结构）
- functools.wraps(fn) 保留原函数名与文档

## 可变默认参数坑
\`\`\`python
def f(items=[]):   # 坑！默认参数只创建一次
    items.append(1)
    return items
f(); f()  # [1, 1] —— 共享同一个列表
\`\`\`
正确写法：items=None 然后内部 items = items or []。

## is 与 ==
- is 比较**身份**（id 相同）；== 比较值
- 小整数 (-5~256) 与短字符串有缓存池，is 结果可能为 True，别依赖

## 常见错误
1. 在循环里拼接字符串用 s += x（应用 join，O(n²)→O(n)）
2. 可变默认参数共享
3. 遍历列表时修改列表（应先拷贝再删）`
    },

    { id: 'k25', category: '语言基础', title: '内存溢出与常见运行时错误', difficulty: 1,
      summary: '数组越界/空指针/资源泄漏/无限递归是编程中最高频的运行时错误。',
      tags: ['段错误', '越界', '空指针', '栈溢出', '内存泄漏'],
      complexity: '排查工具：gdb / 调试器 / 内存检测器',
      codeLang: 'cpp',
      code: '// 高频错误示范\nint a[5];\na[5] = 1;              // ❌ 越界（合法下标 0~4）\nint* p = nullptr;\n*p = 1;                // ❌ 空指针解引用\nint* q = new int[10];\n// 忘记 delete[] q → 内存泄漏',
      detail: `## 四大高频错误
1. **数组越界**：a[n]（下标从 0 到 n-1）；字符串忘留结尾空字符；循环条件 i <= n
2. **空指针/悬垂指针解引用**：nullptr、已释放内存、返回局部变量地址
3. **栈溢出**：无限递归 / 递归层数过深 / 局部大数组
4. **内存泄漏**：new 不 delete、循环里分配、异常路径中途 return 未释放

## 排查技巧
- **最小可复现**：把代码缩到最短仍出错的版本，错误往往浮出水面
- 二分注释法：注释一半代码定位哪一半有问题
- 打印/断点：输出关键变量与边界值；gdb / VS Code 调试器看调用栈
- 内存工具：Valgrind（Linux）、AddressSanitizer（-fsanitize=address）
- 防御式编程：栈容器先判空再 top/pop；数组访问前检查下标

## 常见错误
1. 用 sizeof(指针) 当数组大小 malloc
2. 未初始化变量直接读（UB 未定义行为）
3. 有符号/无符号比较导致负数变巨大正数引发越界（size_t 陷阱）

## 成长建议
把每次运行时错误都记入错题本并标注归属类目，同类错误集中复习一次，比刷十道新题更有效。`
    }
];

/* 分类列表（自动从数据聚合，保留此函数供使用） */
function getKnowledgeCategories() {
    const map = {};
    KNOWLEDGE_ITEMS.forEach(k => { map[k.category] = (map[k.category] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
}