/* ========================================
 * 代码错题集小程序 - 核心逻辑
 * ======================================== */

// ========== 全局状态 ==========
const STORAGE_KEY = 'code_mistake_book_v1';
const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30]; // 艾宾浩斯复习间隔（天）

let mistakes = [];
let currentPage = 'pageHome';
let editingId = null;
let currentDetailId = null;
let uploadedImage = null;
let knowledgeActiveCategory = '';
let knowledgeSearchKeyword = '';

// 后端 API 地址（同源，由 server.js 提供静态文件 + API）
const API_BASE = window.location.protocol + '//' + window.location.hostname + ':' + (window.location.port || '3000') + '/api';

// 封装 fetch 请求
async function api(path) {
    try {
        const resp = await fetch(API_BASE + path);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return await resp.json();
    } catch (e) {
        console.error('API请求失败:', e);
        return { success: false, data: [] };
    }
}

async function apiPost(path, body) {
    try {
        const resp = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await resp.json();
    } catch (e) {
        console.error('API请求失败:', e);
        return { success: false };
    }
}

async function apiPut(path, body) {
    try {
        const resp = await fetch(API_BASE + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await resp.json();
    } catch (e) {
        console.error('API请求失败:', e);
        return { success: false };
    }
}

async function apiPatch(path, body) {
    try {
        const resp = await fetch(API_BASE + path, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await resp.json();
    } catch (e) {
        console.error('API请求失败:', e);
        return { success: false };
    }
}

async function apiDelete(path) {
    try {
        const resp = await fetch(API_BASE + path, { method: 'DELETE' });
        return await resp.json();
    } catch (e) {
        console.error('API请求失败:', e);
        return { success: false };
    }
}

// ========== 工具函数 ==========
function $(id) { return document.getElementById(id); }

function showToast(msg, duration = 1500) {
    const toast = $('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getLangName(code) {
    const map = {
        javascript: 'JavaScript',
        python: 'Python',
        cpp: 'C++',
        java: 'Java',
        c: 'C语言'
    };
    return map[code] || code;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// ========== 轻量 Markdown 渲染 ==========
// 支持：标题、加粗、斜体、行内代码、代码块、有序/无序列表、链接、换行、分隔线
function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(String(text));

    // 提取代码块，避免内部被其它规则污染
    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (m, code) => {
        codeBlocks.push(code.trim());
        return '\u0000CODE' + (codeBlocks.length - 1) + '\u0000';
    });

    // 标题
    html = html.replace(/^###\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#\s+(.+)$/gm, '<h4>$1</h4>');

    // 表格：连续 | 行，第二行为分隔行 |---|
    html = html.replace(/(?:^\|.+\|\s*$\n?)+/gm, (block) => {
        const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length >= 2 && /^\|[\s:|-]+\|$/.test(lines[1])) {
            const headCells = lines[0].split('|').slice(1, -1).map(c => c.trim());
            const head = '<tr>' + headCells.map(c => `<th>${c}</th>`).join('') + '</tr>';
            const bodyRows = lines.slice(2).map(l => {
                const cs = l.split('|').slice(1, -1).map(c => c.trim());
                return '<tr>' + cs.map(c => `<td>${c}</td>`).join('') + '</tr>';
            }).join('');
            return `<table><thead>${head}</thead><tbody>${bodyRows}</tbody></table>\n`;
        }
        return block;
    });

    // 分隔线
    html = html.replace(/^-{3,}$/gm, '<hr>');
    html = html.replace(/^\*{3,}$/gm, '<hr>');

    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 加粗
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 链接 [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 无序列表
    html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, '<li>$2</li>');
    // 有序列表
    html = html.replace(/^(\s*)\d+\.\s+(.+)$/gm, '<li>$2</li>');

    // 段落换行
    html = html.split('\n').map(line => {
        const t = line.trim();
        if (!t) return '';
        const isLi = t.startsWith('<li>') || t.startsWith('<h4>') || t.startsWith('<h5>') || t.startsWith('<h6>') || t.startsWith('<hr>') || t.startsWith('<table>');
        return isLi ? t : `<p>${t}</p>`;
    }).join('');

    // 恢复代码块
    html = html.replace(/\u0000CODE(\d+)\u0000/g, (m, i) => `<pre><code>${codeBlocks[+i].replace(/</g, '&lt;')}</code></pre>`);

    return html;
}

// ========== PWA：注册 Service Worker 实现离线支持 ==========
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        // 仅 HTTPS 或 localhost 生效
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('Service Worker 注册失败:', err);
        });
    }
}

// ========== 数据存储 ==========
function loadData() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        mistakes = data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('加载数据失败:', e);
        mistakes = [];
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mistakes));
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            showToast('存储空间已满，请删除一些图片或错题');
        } else {
            console.error('保存数据失败:', e);
        }
    }
    // 云端自动同步（若已开启并配置）
    maybeAutoSync();
}

// ========== 复习计划计算 ==========
function getNextReviewDate(mistake) {
    const now = Date.now();

    // 已掌握的不再需要复习
    if (mistake.status === 'mastered') return null;

    const lastReview = mistake.lastReviewAt || mistake.createdAt;
    const reviewCount = mistake.reviewCount || 0;

    if (reviewCount >= REVIEW_INTERVALS.length) {
        return null; // 所有复习周期已完成
    }

    const intervalDays = REVIEW_INTERVALS[reviewCount];
    const nextDate = new Date(lastReview + intervalDays * 24 * 60 * 60 * 1000);
    nextDate.setHours(0, 0, 0, 0);
    return nextDate.getTime();
}

function getReviewStatus(mistake) {
    const nextReview = getNextReviewDate(mistake);
    if (!nextReview) return null;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const today = now.getTime();

    if (nextReview <= today) return 'pending'; // 今天或已过期
    if (nextReview <= today + 24 * 60 * 60 * 1000) return 'tomorrow';
    if (nextReview <= today + 3 * 24 * 60 * 60 * 1000) return 'soon';
    return 'later';
}

// ========== 页面导航 ==========
function switchPage(pageId) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // 显示目标页面
    const page = $(pageId);
    if (page) page.classList.add('active');

    currentPage = pageId;

    // 更新导航栏
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });

    // 更新标题和返回按钮
    updateHeader(pageId);

    // 刷新页面数据
    refreshCurrentPage();

    // 滚动到顶部
    window.scrollTo(0, 0);
}

function updateHeader(pageId) {
    const titles = {
        pageHome: '代码错题集',
        pageCategory: '分类浏览',
        pageReview: '复习计划',
        pageEdit: editingId ? '编辑错题' : '添加错题',
        pageDetail: '错题详情',
        pageKnowledge: '知识库',
        pagePractice: '错题练习',
        pageStats: '学习统计'
    };

    $('pageTitle').textContent = titles[pageId] || '代码错题集';
    $('backBtn').style.display = (pageId === 'pageEdit' || pageId === 'pageDetail') ? 'inline-flex' : 'none';
}

function refreshCurrentPage() {
    switch (currentPage) {
        case 'pageHome': renderMistakeList(); renderStreak(); renderPoints(); renderChallengeCard(); break;
        case 'pageCategory': renderCategory(); break;
        case 'pageReview': renderReview(); break;
        case 'pageKnowledge': renderKnowledge(); break;
        case 'pagePractice': renderPractice(); break;
        case 'pageStats': renderStats(); renderAchievements(); break;
    }
    checkAchievements(false);
}

// ========== 渲染错题列表 ==========
function renderMistakeList() {
    const list = $('mistakeList');
    const langFilter = $('filterLang').value;
    const tagFilter = $('filterTag').value;
    const statusFilter = $('filterStatus').value;

    let filtered = mistakes.filter(m => {
        if (langFilter && m.lang !== langFilter) return false;
        if (statusFilter && m.status !== statusFilter) return false;
        if (tagFilter) {
            const tags = (m.tags || []).map(t => t.toLowerCase());
            if (!tags.includes(tagFilter.toLowerCase())) return false;
        }
        return true;
    });

    // 按创建时间倒序
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    // 统计
    $('totalCount').textContent = mistakes.length;

    const pending = mistakes.filter(m => getReviewStatus(m) === 'pending' && m.status !== 'mastered');
    $('reviewCount').textContent = pending.length;

    const mastered = mistakes.filter(m => m.status === 'mastered');
    $('masteredCount').textContent = mastered.length;

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><span class="ico" data-ico="pencil-line"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span></div>
                <p class="empty-text">${mistakes.length === 0 ? '还没有错题记录' : '没有找到匹配的错题'}</p>
                <p class="empty-hint">${mistakes.length === 0 ? '点击下方 + 按钮添加你的第一道错题' : '试试调整筛选条件'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = filtered.map(m => {
        const status = getReviewStatus(m);
        const statusClass = m.status === 'mastered' ? 'mastered' : (status === 'pending' ? 'reviewing' : '');
        const statusText = getStatusText(m, status);
        const preview = escapeHtml((m.wrongCode || '').split('\n').slice(0, 1).join('').substring(0, 60));

        return `
            <div class="mistake-card ${statusClass}" onclick="viewMistake('${m.id}')">
                <div class="card-header">
                    <span class="lang-badge">${getLangName(m.lang)}</span>
                    ${m.source ? `<span class="card-source">${escapeHtml(m.source)}</span>` : ''}
                    <span class="card-status ${getStatusClass(m, status)}">${statusText}</span>
                </div>
                <div class="card-title">${escapeHtml(m.title)}</div>
                <div class="card-preview">${preview || '无代码预览'}</div>
                ${m.tags && m.tags.length > 0 ? `
                    <div class="card-tags">
                        ${m.tags.slice(0, 4).map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="card-footer">
                    <span><span class="ico" data-ico="calendar"><svg viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg></span> ${formatDate(m.createdAt)}</span>
                    ${getReviewDateText(m)}
                </div>
            </div>
        `;
    }).join('');

    // 更新标签筛选下拉
    updateTagFilter();
    updateReviewBadge();
}

function getStatusText(mistake, reviewStatus) {
    if (mistake.status === 'mastered') return '已掌握';
    if (reviewStatus === 'pending') return '待复习';
    if (reviewStatus === 'tomorrow') return '明日复习';
    return '复习中';
}

function getStatusClass(mistake, reviewStatus) {
    if (mistake.status === 'mastered') return 'status-mastered';
    if (reviewStatus === 'pending') return 'status-pending';
    return 'status-reviewing';
}

function getReviewDateText(mistake) {
    if (mistake.status === 'mastered') return '<span style="color:#34c759"><span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span> 已掌握</span>';

    const nextReview = getNextReviewDate(mistake);
    if (!nextReview) return '<span><span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span> 复习完成</span>';

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const today = now.getTime();
    const diffDays = Math.ceil((nextReview - today) / (24 * 60 * 60 * 1000));

    if (diffDays <= 0) return '<span style="color:#ff3b30"><span class="ico" data-ico="flame"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span> 今天复习</span>';
    if (diffDays === 1) return '<span style="color:#ff9500">⏰ 明天复习</span>';
    return `<span><span class="ico" data-ico="calendar"><svg viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg></span> ${diffDays}天后复习</span>`;
}

function updateTagFilter() {
    const tagSelect = $('filterTag');
    const allTags = new Set();
    mistakes.forEach(m => (m.tags || []).forEach(t => allTags.add(t)));

    const currentValue = tagSelect.value;
    tagSelect.innerHTML = '<option value="">全部考点</option>' +
        Array.from(allTags).sort().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    tagSelect.value = currentValue;
}

function updateReviewBadge() {
    const pending = mistakes.filter(m => {
        const status = getReviewStatus(m);
        return (status === 'pending' || status === 'tomorrow') && m.status !== 'mastered';
    });
    const badge = $('reviewBadge');
    if (pending.length > 0) {
        badge.style.display = 'flex';
        badge.textContent = pending.length > 99 ? '99+' : pending.length;
    } else {
        badge.style.display = 'none';
    }
}

// ========== 渲染分类页 ==========
function renderCategory() {
    // 标签统计
    const tagCounts = {};
    mistakes.forEach(m => {
        (m.tags || []).forEach(t => {
            tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
    });

    const tagCloud = $('tagCloud');
    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    if (sortedTags.length === 0) {
        tagCloud.innerHTML = '<div class="empty-state"><p class="empty-text">暂无考点标签</p><p class="empty-hint">添加错题时记录考点吧</p></div>';
    } else {
        tagCloud.innerHTML = sortedTags.map(([tag, count]) => `
            <span class="tag-item" onclick="filterByTag('${escapeHtml(tag)}')">
                ${escapeHtml(tag)}
                <span class="tag-count">${count}</span>
            </span>
        `).join('');
    }

    // 语言统计
    const langCounts = {};
    mistakes.forEach(m => {
        langCounts[m.lang] = (langCounts[m.lang] || 0) + 1;
    });

    const langStats = $('langStats');
    const maxCount = Math.max(1, ...Object.values(langCounts));
    const langOrder = ['javascript', 'python', 'cpp', 'java', 'c'];

    const langHtml = langOrder
        .filter(l => langCounts[l])
        .map(l => `
            <div class="lang-stat-item">
                <span class="lang-name">${getLangName(l)}</span>
                <div class="lang-bar"><div class="lang-bar-fill" style="width:${(langCounts[l] / maxCount * 100)}%"></div></div>
                <span class="lang-count">${langCounts[l]}</span>
            </div>
        `).join('');

    langStats.innerHTML = langHtml || '<div class="empty-state" style="padding:20px"><p class="empty-text">暂无数据</p></div>';
}

function filterByTag(tag) {
    $('filterTag').value = tag;
    switchPage('pageHome');
}

// ========== A1 遗忘预测器 ==========
// 风险模型：艾宾浩斯间隔 + 逾期惩罚 + 顽固题加权
function getForgottenRisk(m) {
    if (!m || m.status === 'mastered') return null;
    const last = m.lastReviewAt || m.createdAt || Date.now();
    const rc = m.reviewCount || 0;
    const intervalDays = REVIEW_INTERVALS[Math.min(rc, REVIEW_INTERVALS.length - 1)];
    const due = last + intervalDays * 86400000;
    const overdue = Date.now() - due;               // >0 表示已到期未复习

    if (overdue <= 0) {
        return { score: -1, level: 'none', overdueDays: 0, intervalDays, reason: '未到期' };
    }

    const overdueDays = Math.floor(overdue / 86400000);
    // 基础分：逾期天数（封顶 5 分）
    let score = Math.min(5, overdueDays + 1);
    // 顽固题：已复习多轮仍未掌握
    if (rc >= 4) score += 2;
    // 长期未攻克：创建超 30 天仍未掌握
    if (m.createdAt && Date.now() - m.createdAt > 30 * 86400000) score += 1;

    let level = 'low';
    if (score >= 6) level = 'high';
    else if (score >= 3) level = 'mid';

    const reasons = [];
    reasons.push(overdueDays >= 1 ? `逾期 ${overdueDays} 天` : '今日到期');
    if (rc >= 4) reasons.push(`已复习 ${rc} 轮`);
    return { score, level, overdueDays, intervalDays, reason: reasons.join(' · '), due };
}

// 「今日务必修」清单：按遗忘风险排序，取风险最高的前 6 题
function renderForgottenList() {
    const el = $('forgottenList');
    if (!el) return;

    const list = mistakes
        .map(m => ({ m, risk: getForgottenRisk(m) }))
        .filter(x => x.risk && x.risk.level !== 'none')
        .sort((a, b) => b.risk.score - a.risk.score)
        .slice(0, 6);

    const levelNames = { high: ['高危', 'high'], mid: ['中危', 'mid'], low: ['低危', 'low'] };

    if (!list.length) {
        el.innerHTML = `
            <div class="forgotten-card">
                <div class="forgotten-card-head">
                    <span><span class="ico" data-ico="target"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> 今日务必修 · 遗忘预测</span>
                </div>
                <div class="forgotten-empty"><span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 没有逾期错题，暂无遗忘风险，继续保持！</div>
            </div>
        `;
        return;
    }

    el.innerHTML = `
        <div class="forgotten-card">
            <div class="forgotten-card-head">
                <span><span class="ico" data-ico="target"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> 今日务必修 · 遗忘预测</span>
                <span class="forgotten-count">${list.length} 道风险题</span>
            </div>
            ${list.map(({ m, risk }) => {
                const [name, cls] = levelNames[risk.level];
                return `
                <div class="forgotten-item" onclick="viewMistake('${m.id}')">
                    <span class="risk-badge risk-${cls}">${name}</span>
                    <span class="forgotten-item-title">${escapeHtml(m.title)}</span>
                    <span class="forgotten-item-reason">${escapeHtml(risk.reason)}</span>
                </div>`;
            }).join('')}
        </div>
    `;
}

// ========== 渲染复习页 ==========
function renderReview() {
    // 遗忘预测清单（置顶）
    renderForgottenList();

    // 按复习日期分组
    const reviewGroups = {};

    mistakes.forEach(m => {
        if (m.status === 'mastered') return;
        const nextReview = getNextReviewDate(m);
        if (!nextReview) return;

        const date = new Date(nextReview);
        date.setHours(0, 0, 0, 0);
        const dateStr = date.toISOString().split('T')[0];

        if (!reviewGroups[dateStr]) {
            reviewGroups[dateStr] = { date: date.getTime(), items: [] };
        }
        reviewGroups[dateStr].items.push(m);
    });

    // 按日期排序
    const sortedGroups = Object.values(reviewGroups).sort((a, b) => a.date - b.date);

    const timeline = $('reviewTimeline');

    if (sortedGroups.length === 0) {
        timeline.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><span class="ico" data-ico="sparkles"><svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg></span></div>
                <p class="empty-text">太棒了！今日无需复习</p>
                <p class="empty-hint">坚持打卡，错题越来越少</p>
            </div>
        `;
        return;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const today = now.getTime();
    const tomorrow = today + 24 * 60 * 60 * 1000;

    timeline.innerHTML = sortedGroups.map(group => {
        const daysDiff = Math.round((group.date - today) / (24 * 60 * 60 * 1000));
        let dateLabel = '';
        let badgeClass = '';
        let badgeText = '';

        if (daysDiff <= 0) {
            dateLabel = '今天';
            badgeClass = 'today';
            badgeText = daysDiff < 0 ? `已过期 ${-daysDiff} 天` : `需复习 ${group.items.length} 题`;
        } else if (daysDiff === 1) {
            dateLabel = '明天';
            badgeClass = 'tomorrow';
            badgeText = `${group.items.length} 题`;
        } else if (daysDiff <= 3) {
            dateLabel = `${daysDiff} 天后`;
            badgeClass = 'soon';
            badgeText = `${group.items.length} 题`;
        } else {
            dateLabel = new Date(group.date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
            badgeClass = 'later';
            badgeText = `${group.items.length} 题`;
        }

        const reviewItems = group.items.map(m => `
            <div class="review-item" onclick="viewMistake('${m.id}')">
                <span class="review-check">${m.reviewCheck ? '<span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>' : ''}</span>
                <span class="review-item-title">${escapeHtml(m.title)}</span>
                <span class="lang-badge">${getLangName(m.lang)}</span>
            </div>
        `).join('');

        return `
            <div class="review-group">
                <div class="review-group-header">
                    <span class="review-date">${dateLabel}</span>
                    <span class="review-date-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="review-items">${reviewItems}</div>
            </div>
        `;
    }).join('');
}

// ========== 添加/编辑错题 ==========
function openAddForm() {
    editingId = null;
    uploadedImage = null;

    $('mistakeForm').reset();
    $('imagePreview').innerHTML = '';
    $('pageTitle').textContent = '添加错题';

    switchPage('pageEdit');
}

function openEditForm(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    editingId = id;
    uploadedImage = m.image || null;

    $('inputTitle').value = m.title;
    $('inputLang').value = m.lang;
    $('inputDesc').value = m.desc || '';
    $('inputWrongCode').value = m.wrongCode;
    $('inputRightCode').value = m.rightCode || '';
    $('inputTags').value = (m.tags || []).join(', ');
    $('inputNote').value = m.note || '';
    $('inputSource').value = m.source || '其他';

    // 图片预览
    const preview = $('imagePreview');
    if (m.image) {
        preview.innerHTML = `
            <img src="${m.image}" alt="题目图片">
            <button type="button" class="image-remove" onclick="removeImage()"><span class="ico" data-ico="x"><svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span></button>
        `;
    } else {
        preview.innerHTML = '';
    }

    $('pageTitle').textContent = '编辑错题';
    switchPage('pageEdit');
}

function removeImage() {
    uploadedImage = null;
    $('inputImage').value = '';
    $('imagePreview').innerHTML = '';
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 检查文件大小（限制 2MB，因为 localStorage 有配额）
    if (file.size > 2 * 1024 * 1024) {
        showToast('图片太大了，请压缩后再上传');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedImage = e.target.result;

        $('imagePreview').innerHTML = `
            <img src="${uploadedImage}" alt="题目图片">
            <button type="button" class="image-remove" onclick="removeImage()"><span class="ico" data-ico="x"><svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span></button>
        `;
    };
    reader.readAsDataURL(file);
}

function handleFormSubmit(event) {
    event.preventDefault();

    const title = $('inputTitle').value.trim();
    const lang = $('inputLang').value;
    const desc = $('inputDesc').value.trim();
    const wrongCode = $('inputWrongCode').value.trim();
    const rightCode = $('inputRightCode').value.trim();
    const tagsStr = $('inputTags').value.trim();
    const note = $('inputNote').value.trim();
    const source = $('inputSource').value;

    if (!title) { showToast('请输入题目标题'); return; }
    if (!wrongCode) { showToast('请填写错误代码'); return; }

    const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

    if (editingId) {
        // 编辑
        const idx = mistakes.findIndex(m => m.id === editingId);
        if (idx >= 0) {
            mistakes[idx] = {
                ...mistakes[idx],
                title, lang, desc, wrongCode, rightCode, tags, note, source,
                image: uploadedImage,
                updatedAt: Date.now()
            };
            showToast('修改成功');
        }
    } else {
        // 新增
        mistakes.push({
            id: generateId(),
            title, lang, desc, wrongCode, rightCode, tags, note, source,
            image: uploadedImage,
            status: 'pending',
            reviewCount: 0,
            lastReviewAt: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        logActivity(); // 记录学习活动（统计热力图）
        addPoints(10, '记录新错题');
        checkAchievements(true);
        showToast('添加成功');
    }

    saveData();
    switchPage('pageHome');
}

// ========== 查看错题详情 ==========
function viewMistake(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    currentDetailId = id;
    renderDetail(m);
    switchPage('pageDetail');
}

function renderDetail(m) {
    const container = $('detailContainer');

    // 代码高亮
    const wrongCodeHtml = m.wrongCode ? hljs.highlight(m.wrongCode, { language: m.lang }).value : '';
    const rightCodeHtml = m.rightCode ? hljs.highlight(m.rightCode, { language: m.lang }).value : '';

    const nextReview = getNextReviewDate(m);
    const nextReviewText = nextReview ? formatDate(nextReview) : '复习完成 <span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>';
    const risk = getForgottenRisk(m);
    const riskTag = risk && risk.level !== 'none'
        ? `<span class="meta-tag risk-inline risk-${risk.level}" title="遗忘风险：${escapeHtml(risk.reason)}">遗忘风险 ${risk.level === 'high' ? '高危' : risk.level === 'mid' ? '中危' : '低危'}</span>`
        : '';

    container.innerHTML = `
        <div class="detail-header">
            <div class="detail-meta" style="margin-bottom:10px">
                <span class="lang-badge" style="font-size:13px;padding:5px 12px">${getLangName(m.lang)}</span>
                ${m.source ? `<span class="meta-tag">${escapeHtml(m.source)}</span>` : ''}
                <span class="meta-tag">创建于 ${formatDate(m.createdAt)}</span>
                <span class="meta-tag">下次复习: ${nextReviewText}</span>
                ${riskTag}
            </div>
            <div class="detail-title">${escapeHtml(m.title)}</div>
            ${m.tags && m.tags.length > 0 ? `
                <div class="detail-meta">
                    ${m.tags.map(t => `<span class="meta-tag">#${escapeHtml(t)}</span>`).join('')}
                </div>
            ` : ''}
        </div>

        ${m.desc ? `
            <div class="detail-section">
                <div class="detail-section-title">题目描述</div>
                <div class="detail-desc">${escapeHtml(m.desc)}</div>
            </div>
        ` : ''}

        ${m.image ? `
            <div class="detail-section">
                <div class="detail-section-title">题目图片</div>
                <div class="detail-image">
                    <img src="${m.image}" alt="题目图片">
                </div>
            </div>
        ` : ''}

        ${m.wrongCode ? `
            <div class="detail-section">
                <div class="detail-section-title"><span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 错误代码</div>
                <div class="code-block">
                    <div class="code-block-header wrong">错误代码</div>
                    <pre><code class="hljs language-${m.lang}">${wrongCodeHtml}</code></pre>
                </div>
            </div>
        ` : ''}

        ${m.rightCode ? `
            <div class="detail-section">
                <div class="detail-section-title"><span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 正确代码</div>
                <div class="code-block">
                    <div class="code-block-header right">
                        <span>正确实现</span>
                        ${isRunnableLang(m.lang) ? `<button class="run-btn" id="runBtn-${m.id}" onclick="runMistakeCode('${m.id}')">▶ 运行</button>` : ''}
                    </div>
                    <pre><code class="hljs language-${m.lang}">${rightCodeHtml}</code></pre>
                </div>
                ${isRunnableLang(m.lang) ? `<div class="code-output" id="output-${m.id}" style="display:none"></div>` : ''}
            </div>
        ` : ''}

        ${m.note ? `
            <div class="detail-section">
                <div class="detail-section-title"><span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> 错误分析</div>
                <div class="detail-note markdown-body">${renderMarkdown(m.note)}</div>
            </div>
        ` : ''}

        <button class="ai-gen-btn" onclick="openAIModal('${m.id}')"><span class="ico" data-ico="bot"><svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></span> AI 举一反三</button>
        <button class="ai-gen-btn" style="background:#0071e3" onclick="openAIDiagnosis('${m.id}')"><span class="ico" data-ico="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span> AI 诊断</button>
        <button class="ai-gen-btn" style="background:#0071e3" onclick="openAIChat('${m.id}')"><span class="ico" data-ico="message-circle"><svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg></span> AI 对话</button>
        <button class="ai-gen-btn" style="background:#0071e3" onclick="openShareModal('${m.id}')"><span class="ico" data-ico="upload"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg></span> 分享</button>
        <div class="detail-footer">
            ${m.status !== 'mastered' ? `
                <button class="action-btn success" onclick="markMastered('${m.id}')"><span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span> 已掌握</button>
            ` : `
                <button class="action-btn warning" onclick="unmarkMastered('${m.id}')">↩ 重新复习</button>
            `}
            <button class="action-btn primary" onclick="openEditForm('${m.id}')"><span class="ico" data-ico="pencil"><svg viewBox="0 0 24 24"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg></span> 编辑</button>
            <button class="action-btn danger" onclick="deleteMistake('${m.id}')"><span class="ico" data-ico="trash-2"><svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></span> 删除</button>
        </div>
    `;
}

// ========== 错题分享卡片 ==========
function shareMistakeCard(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    // 检查是否支持 Web Share（移动端优先分享）
    const shareData = {
        title: m.title || '我的错题',
        text: `【错题分享】${m.title}\n语言：${getLangName(m.lang)}\n考点：${(m.tags || []).join('、') || '综合'}\n\n${(m.wrongCode || '').slice(0, 200)}`
    };
    if (navigator.share && window.matchMedia('(max-width:768px)').matches) {
        navigator.share(shareData).then(() => {}).catch(() => {});
        return;
    }
    // 桌面端生成并下载图片分享卡片
    generateShareCard(m);
}

function generateShareCard(m) {
    const W = 720, H = 920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const holder = $('shareCanvasHolder');
    holder.innerHTML = '';
    holder.appendChild(canvas);

    // 背景
    ctx.fillStyle = '#1d1d1f';
    ctx.fillRect(0, 0, W, H);

    // 顶部标题
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('<span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 代码错题集', 40, 56);

    // 语言徽章
    ctx.fillStyle = '#86868b';
    ctx.beginPath();
    ctx.roundRect(40, 84, 130, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(getLangName(m.lang), 105, 106);

    // 题目标题
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    wrapText(ctx, m.title || '未命名', 40, 160, W - 80, 44, 60);

    const tags = (m.tags || []).slice(0, 4);
    let tagX = 40;
    tags.forEach(t => {
        const w = ctx.measureText('#' + t).width + 24;
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.roundRect(tagX, 210, w, 30, 15);
        ctx.fill();
        ctx.fillStyle = '#e0e8f0';
        ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('#' + t, tagX + w / 2, 230);
        tagX += w + 10;
    });

    // 主体白卡片
    const cardTop = 280;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(40, cardTop, W - 80, H - cardTop - 120, 20);
    ctx.fill();

    // 内容区标题（截断显示）
    let y = cardTop + 45;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 18px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 错误代码', 70, y);
    y += 28;
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '15px Menlo,Consolas,monospace';
    y = drawCodeBlock(ctx, m.wrongCode, 70, y, W - 140, '#faf2f1');

    const manualY = y + 14;
    ctx.fillStyle = '#34c759';
    ctx.font = 'bold 18px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 正确代码', 70, manualY);
    y = manualY + 28;
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '15px Menlo,Consolas,monospace';
    drawCodeBlock(ctx, m.rightCode || '（未记录）', 70, y, W - 140, '#f0f7f2');

    // 底部
    ctx.fillStyle = '#86868b';
    ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('记录易错点，让每次错误都成为进步', W / 2, H - 62);

    // 生成图片并下载或分享
    canvas.toBlob(blob => {
        if (!blob) { showToast('生成图片失败'); return; }
        const fileName = '错题分享_' + (m.title || '错题').slice(0, 12) + '.png';
        const url = URL.createObjectURL(blob);
        if (navigator.share && window.matchMedia('(max-width:768px)').matches) {
            const file = new File([blob], fileName, { type: 'image/png' });
            navigator.share({ files: [file], title: m.title }).then(() => {
                URL.revokeObjectURL(url);
            }).catch(() => { URL.revokeObjectURL(url); });
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast('<span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span> 分享卡片已生成');
        }
    }, 'image/png');
}

function drawCodeBlock(ctx, code, x, startY, maxW, bgColor) {
    const lines = String(code || '').split('\n');
    const fontSize = 15, lineH = 22;
    const shown = lines.slice(0, 9);    // 最多显示 9 行
    const h = shown.length * lineH + 24;
    if (h > 0) {
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(x - 8, startY - 20, maxW + 16, h, 10);
        ctx.fill();
    }
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '14px Menlo,Consolas,monospace';
    shown.forEach((line, i) => {
        const clipped = line.length > 52 ? line.slice(0, 52) + '…' : line;
        ctx.fillText(clipped, x, startY + i * lineH);
    });
    return startY + h + 8;
}

function wrapText(ctx, text, x, y, maxW, lineHeight, maxLines) {
    const chars = String(text).split('');
    let line = '';
    let count = 0;
    for (let i = 0; i < chars.length; i++) {
        const test = line + chars[i];
        if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line, x, y);
            line = chars[i];
            y += lineHeight;
            count++;
            if (count >= maxLines - 1) { ctx.fillText(line + '…', x, y); return; }
        } else {
            line = test;
        }
    }
    if (line) ctx.fillText(line, x, y);
}

function markMastered(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    m.status = 'mastered';
    m.lastReviewAt = Date.now();
    m.reviewCount = REVIEW_INTERVALS.length;
    m.updatedAt = Date.now();
    logActivity();
    addPoints(50, '掌握一道错题');
    checkAchievements(true);

    saveData();
    showToast('<span class="ico" data-ico="sparkles"><svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg></span> 恭喜！已标记为掌握');
    renderDetail(m);
    updateReviewBadge();
}

function unmarkMastered(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    m.status = 'pending';
    m.reviewCount = 0;
    m.lastReviewAt = Date.now();
    m.updatedAt = Date.now();
    logActivity();

    saveData();
    showToast('好的，继续复习！');
    renderDetail(m);
    updateReviewBadge();
}

function deleteMistake(id) {
    if (!confirm('确定要删除这道错题吗？此操作不可恢复。')) return;

    mistakes = mistakes.filter(m => m.id !== id);
    saveData();
    showToast('已删除');
    switchPage('pageHome');
}

function markReviewed(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    m.lastReviewAt = Date.now();
    m.reviewCount = (m.reviewCount || 0) + 1;
    m.reviewCheck = true;
    m.updatedAt = Date.now();
    logActivity();
    addPoints(5, '完成一次复习');

    saveData();
    showToast('复习完成！');
}

// ========== 知识库（内置知识数据 knowledge-data.js）==========
function getAllKnowledgeItems() {
    return (typeof KNOWLEDGE_ITEMS !== 'undefined') ? KNOWLEDGE_ITEMS : [];
}

function renderKnowledge() {
    const searchInput = $('knowledgeSearch');
    if (searchInput) searchInput.value = knowledgeSearchKeyword;

    const listEl = $('knowledgeList');
    const all = getAllKnowledgeItems();

    if (all.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon"><span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span></div><p class="empty-text">知识库数据加载失败</p><p class="empty-hint">请刷新页面重试</p></div>';
        return;
    }

    // 分类统计
    const catMap = {};
    all.forEach(k => { catMap[k.category] = (catMap[k.category] || 0) + 1; });
    const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    // 渲染分类标签
    const catContainer = $('knowledgeCategories');
    catContainer.innerHTML = `
        <div class="knowledge-cat-tab ${knowledgeActiveCategory === '' ? 'active' : ''}" onclick="selectKnowledgeCategory('')">
            全部<span class="knowledge-cat-count">${all.length}</span>
        </div>
        ${cats.map(([cat, count]) => `
            <div class="knowledge-cat-tab ${knowledgeActiveCategory === cat ? 'active' : ''}" onclick="selectKnowledgeCategory('${escapeHtml(cat)}')">
                ${escapeHtml(cat)}<span class="knowledge-cat-count">${count}</span>
            </div>
        `).join('')}
    `;

    // 搜索：多关键词 + 同义词 + 相关性排序
    const kw = knowledgeSearchKeyword.trim().toLowerCase();
    let items = all;
    if (knowledgeActiveCategory) {
        items = items.filter(k => k.category === knowledgeActiveCategory);
    }
    let searchVariants = [];
    if (kw) {
        const { groups, variants } = expandSearchTokens(kw);
        searchVariants = variants;
        items = items
            .map(item => ({ item, score: knowledgeItemScore(item, groups) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(x => x.item);
    }

    // 搜索结果计数提示（仅搜索时显示）
    let infoEl = $('knowledgeSearchInfo');
    if (kw) {
        if (!infoEl) {
            infoEl = document.createElement('p');
            infoEl.id = 'knowledgeSearchInfo';
            infoEl.className = 'knowledge-search-info';
            $('knowledgeCategories').after(infoEl);
        }
        infoEl.textContent = `<span class="ico" data-ico="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span> 「${knowledgeSearchKeyword.trim()}」 命中 ${items.length} 个知识点`;
        infoEl.style.display = '';
    } else if (infoEl) {
        infoEl.style.display = 'none';
    }

    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><span class="ico" data-ico="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span></div>
                <p class="empty-text">未找到相关知识点</p>
                <p class="empty-hint">试试搜索其他关键词，如"排序"、"TCP"、"索引"、"递归"，或输入拼音缩写如 "dp"、"bst"、"lru"</p>
            </div>
        `;
        return;
    }

    const hl = (text) => kw ? knowledgeHighlight(text, searchVariants) : escapeHtml(text);
    listEl.innerHTML = items.map(item => `
        <div class="knowledge-card" onclick="viewKnowledge('${item.id}')">
            <div class="knowledge-card-head">
                <span class="knowledge-card-category">${escapeHtml(item.category)}</span>
                ${item.difficulty ? `<span class="knowledge-card-diff">${'<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(item.difficulty)}</span>` : ''}
            </div>
            <div class="knowledge-card-title">${hl(item.title)}</div>
            <div class="knowledge-card-summary">${hl(item.summary)}</div>
            <div class="knowledge-card-tags">
                ${(item.tags || []).slice(0, 4).map(t => `<span class="knowledge-card-tag">${hl(t)}</span>`).join('')}
            </div>
            ${item.complexity ? `<div class="knowledge-card-complexity">⏱ ${escapeHtml(item.complexity)}</div>` : ''}
        </div>
    `).join('');
}

/* ========== 知识库搜索优化 ==========
 * 1. 多关键词：空格分词，全部命中才返回（AND）
 * 2. 同义词：快排→快速排序、dp→动态规划、bst→二叉搜索树 等
 * 3. 相关性排序：标题(10) > 标签(8) > 摘要(5) > 正文(2)
 * 4. 结果高亮：命中词用 <mark> 标出
 * =========================================== */
const KNOWLEDGE_ALIASES = {
    '快排': ['快速排序'], '归并': ['归并排序'],
    '二分': ['二分查找'], '动规': ['动态规划'],
    'dp': ['动态规划'],
    '哈希': ['散列', '散列表', 'hash'], '散列': ['哈希', 'hash'], 'hash': ['哈希', '散列'],
    'bst': ['二叉搜索树'], '搜索树': ['二叉搜索树'],
    'b+树': ['索引'], '索引': ['b+树'],
    'tcp': ['传输控制协议'], 'http': ['https'], 'https': ['http'],
    'lru': ['缓存'], '缓存': ['lru'],
    'sql': ['数据库'], '数据库': ['sql'],
    'join': ['连接', 'join'], '连接': ['join'],
    'avl': ['平衡树'], '红黑树': ['平衡树'], '平衡树': ['avl', '红黑树'],
    'io': ['磁盘'], '磁盘': ['io'],
    '指针': ['引用', '地址'], '引用': ['指针'],
    '越界': ['数组越界'], '空指针': ['nullptr'], '七层': ['osi'], 'osi': ['七层']
};

function expandSearchTokens(kw) {
    const rawTokens = kw.split(/\s+/).map(t => t.trim()).filter(Boolean);
    // 每个原始 token 一组（含同义词扩展），组内 OR、组间 AND
    const groups = rawTokens.map(t => {
        const g = new Set([t]);
        (KNOWLEDGE_ALIASES[t] || []).forEach(a => g.add(a));
        return [...g];
    });
    return { rawTokens, groups, variants: [...new Set(groups.flat())] };
}

// 英文/缩写词用词边界匹配，避免 dp 误命中 udp、io 误命中 ratio 等
function knowledgeFieldMatch(text, v) {
    const s = String(text || '').toLowerCase();
    if (/^[a-z0-9+#.]+$/.test(v)) {
        return new RegExp('\\b' + escapeRegExp(v) + '\\b').test(s);
    }
    return s.includes(v);
}

function knowledgeItemScore(item, groups) {
    // 每个 token 组取组内最佳命中字段权重；所有组都须命中（AND 语义）
    let score = 0;
    for (const g of groups) {
        let best = 0;
        for (const v of g) {
            if (knowledgeFieldMatch(item.title, v)) best = Math.max(best, 10);
            else if (knowledgeFieldMatch((item.tags || []).join(' '), v)) best = Math.max(best, 8);
            else if (knowledgeFieldMatch(item.summary, v)) best = Math.max(best, 5);
            else if (knowledgeFieldMatch(item.detail, v)) best = Math.max(best, 2);
        }
        if (!best) return 0;
        score += best;
    }
    return score;
}

function knowledgeHighlight(text, variants) {
    const html = escapeHtml(text || '');
    if (!variants.length || !text) return html;
    // 长词优先 + 单遍替换，避免嵌套 <mark>
    const sorted = [...variants].sort((a, b) => b.length - a.length);
    const re = new RegExp(sorted.map(escapeRegExp).join('|'), 'gi');
    return html.replace(re, m => '<mark>' + m + '</mark>');
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectKnowledgeCategory(cat) {
    knowledgeActiveCategory = cat;
    knowledgeSearchKeyword = '';
    renderKnowledge();
}

let knowledgeSearchTimer = null;
function handleKnowledgeSearch(event) {
    knowledgeSearchKeyword = event.target.value.trim();
    // 防抖 200ms，避免每个按键都全量重算
    if (knowledgeSearchTimer) clearTimeout(knowledgeSearchTimer);
    knowledgeSearchTimer = setTimeout(() => renderKnowledge(), 200);
}

function viewKnowledge(id) {
    const item = getAllKnowledgeItems().find(k => k.id === id);

    const detail = $('knowledgeDetail');
    if (!item) {
        detail.innerHTML = '<div class="empty-state"><p class="empty-text">知识点不存在</p></div>';
        return;
    }
    $('knowledgeModal').style.display = 'block';
    $('knowledgeModalTitle').textContent = item.title;

    // 找到关联错题（标签匹配）
    const relatedMistakes = mistakes.filter(m => {
        if (!m.tags || !m.tags.length) return false;
        return (item.tags || []).some(t => m.tags.includes(t));
    });

    // 同分类相关知识点
    const related = getAllKnowledgeItems()
        .filter(k => k.category === item.category && k.id !== item.id)
        .slice(0, 5);

    // 代码高亮
    const codeHtml = item.code
        ? hljs.highlight(item.code, { language: item.codeLang || 'plaintext' }).value
        : '';

    detail.innerHTML = `
        <div class="kd-header">
            <span class="kd-category">${escapeHtml(item.category)}</span>
            ${item.difficulty ? `<span class="kd-diff">难度 ${'<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(item.difficulty)}</span>` : ''}
        </div>
        <div class="kd-title">${escapeHtml(item.title)}</div>
        ${item.tags && item.tags.length > 0 ? `
            <div class="kd-tags">
                ${item.tags.map(t => `<span class="kd-tag">#${escapeHtml(t)}</span>`).join('')}
            </div>
        ` : ''}

        <div class="kd-section">
            <div class="kd-section-title"><span class="ico" data-ico="book"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span> 概述</div>
            <div class="kd-summary">${escapeHtml(item.summary)}</div>
        </div>

        ${item.detail ? `
            <div class="kd-section">
                <div class="kd-section-title"><span class="ico" data-ico="pencil-line"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span> 详细说明</div>
                <div class="kd-detail markdown-body">${renderMarkdown(item.detail)}</div>
            </div>
        ` : ''}

        ${item.code ? `
            <div class="kd-section">
                <div class="kd-section-title"><span class="ico" data-ico="laptop"><svg viewBox="0 0 24 24"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg></span> 示例代码</div>
                <div class="code-block">
                    <div class="code-block-header"><span>${escapeHtml(item.codeLang || 'code')}</span></div>
                    <pre><code class="hljs language-${escapeHtml(item.codeLang || 'plaintext')}">${codeHtml}</code></pre>
                </div>
            </div>
        ` : ''}

        ${item.complexity ? `
            <div class="kd-section">
                <div class="kd-section-title">⏱ 复杂度</div>
                <div class="kd-complexity">${escapeHtml(item.complexity)}</div>
            </div>
        ` : ''}

        ${relatedMistakes.length > 0 ? `
            <div class="kd-section">
                <div class="kd-section-title"><span class="ico" data-ico="link"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span> 关联错题 (${relatedMistakes.length})</div>
                <div class="kd-related-items">
                    ${relatedMistakes.map(m => `
                        <div class="kd-related-item" onclick="closeKnowledgeModal(); viewMistake('${m.id}')">
                            <strong>${escapeHtml(m.title)}</strong>
                            <span style="color:var(--text-secondary);font-size:12px;margin-left:6px">${getLangName(m.lang)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <button class="kd-link-btn" onclick="linkToMistake('${escapeHtml(item.title)}', ${JSON.stringify(item.tags || []).replace(/"/g, '&quot;')})">
            <span class="ico" data-ico="pencil-line"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span> 用此知识点创建错题
        </button>

        ${related.length > 0 ? `
            <div class="kd-related">
                <div class="kd-related-title"><span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 同类知识点</div>
                <div class="kd-related-items">
                    ${related.map(r => `
                        <div class="kd-related-item" onclick="viewKnowledge('${r.id}')">
                            ${escapeHtml(r.title)}
                            <span style="color:var(--text-secondary);font-size:12px;float:right">→</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;

    $('knowledgeModal').scrollTop = 0;
    const modalContent = $('knowledgeModal').querySelector('.knowledge-modal-content');
    if (modalContent) modalContent.scrollTop = 0;
}

function closeKnowledgeModal() {
    $('knowledgeModal').style.display = 'none';
}

function linkToMistake(title, tags) {
    closeKnowledgeModal();
    openAddForm();
    $('inputTitle').value = '【' + title + '】相关错题';
    $('inputTags').value = Array.isArray(tags) ? tags.join(', ') : tags;
}

// ========== 搜索 ==========
function openSearch() {
    $('searchModal').style.display = 'block';
    setTimeout(() => $('searchInput').focus(), 100);
}

function closeSearch() {
    $('searchModal').style.display = 'none';
    $('searchInput').value = '';
    $('searchResults').innerHTML = '';
}

function handleSearch(event) {
    const keyword = event.target.value.trim().toLowerCase();
    const results = $('searchResults');

    if (!keyword) {
        results.innerHTML = '';
        return;
    }

    const matched = mistakes.filter(m => {
        return (
            m.title.toLowerCase().includes(keyword) ||
            (m.wrongCode && m.wrongCode.toLowerCase().includes(keyword)) ||
            (m.rightCode && m.rightCode.toLowerCase().includes(keyword)) ||
            (m.note && m.note.toLowerCase().includes(keyword)) ||
            (m.tags && m.tags.some(t => t.toLowerCase().includes(keyword)))
        );
    });

    if (matched.length === 0) {
        results.innerHTML = '<div class="empty-state"><p class="empty-text">没有找到相关错题</p></div>';
        return;
    }

    results.innerHTML = matched.map(m => `
        <div class="search-item" onclick="searchSelect('${m.id}')">
            <div class="search-item-title">${escapeHtml(m.title)}</div>
            <div class="search-item-preview">${escapeHtml((m.wrongCode || '').split('\n')[0].substring(0, 60))}</div>
        </div>
    `).join('');
}

function searchSelect(id) {
    closeSearch();
    viewMistake(id);
}

// ========== 筛选事件 ==========
function bindFilterEvents() {
    $('filterLang').addEventListener('change', renderMistakeList);
    $('filterTag').addEventListener('change', renderMistakeList);
    $('filterStatus').addEventListener('change', renderMistakeList);
}

// ========== 初始化 ==========
function init() {
    // 加载数据
    loadData();
    loadPracticeRecords();
    loadActivityLog();
    loadPoints();
    logActivity();          // 每次打开 App 即打卡

    // 加载主题与各功能配置
    loadTheme();
    loadRemindConfig();
    loadAchievements();
    loadChallengeStats();
    loadSyncConfig();
    checkAchievements(false);

    // 绑定导航
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchPage(item.dataset.page));
    });

    // 主题切换
    $('themeToggleBtn').addEventListener('click', toggleTheme);

    // 复习提醒时间修改
    $('reminderTime').addEventListener('change', (e) => {
        remindConfig.time = e.target.value || '20:00';
        saveRemindConfig();
        renderReminderUI();
    });

    // OCR 录入入口
    $('ocrEntryBtn').addEventListener('click', openOcrModal);

    // AI 智能打标
    $('aiTagBtn').addEventListener('click', aiAutoTag);

    // 挑战 / 分享 / OCR / 云同步弹窗事件
    $('closeChallengeModal').addEventListener('click', closeChallengeModal);
    $('challengeModal').addEventListener('click', (e) => {
        if (e.target.id === 'challengeModal') closeChallengeModal();
    });
    $('closeShareModal').addEventListener('click', closeShareModal);
    $('shareModal').addEventListener('click', (e) => {
        if (e.target.id === 'shareModal') closeShareModal();
    });
    $('closeOcrModal').addEventListener('click', closeOcrModal);
    $('ocrModal').addEventListener('click', (e) => {
        if (e.target.id === 'ocrModal') closeOcrModal();
    });
    $('closeSyncModal').addEventListener('click', closeSyncModal);
    $('syncModal').addEventListener('click', (e) => {
        if (e.target.id === 'syncModal') closeSyncModal();
    });
    $('closeWeeklyModal').addEventListener('click', closeWeeklyModal);
    $('weeklyModal').addEventListener('click', (e) => {
        if (e.target.id === 'weeklyModal') closeWeeklyModal();
    });

    // 返回按钮
    $('backBtn').addEventListener('click', () => {
        if (currentPage === 'pageDetail') {
            switchPage('pageHome');
        } else if (currentPage === 'pageEdit') {
            if (editingId) {
                viewMistake(editingId);
            } else {
                switchPage('pageHome');
            }
        }
    });

    // 悬浮添加按钮
    $('fabAdd').addEventListener('click', openAddForm);

    // 搜索按钮
    $('searchBtn').addEventListener('click', openSearch);
    $('closeSearch').addEventListener('click', closeSearch);

    // 搜索输入
    $('searchInput').addEventListener('input', handleSearch);

    // 表单提交
    $('mistakeForm').addEventListener('submit', handleFormSubmit);

    // 图片上传
    $('uploadBtn').addEventListener('click', () => $('inputImage').click());
    $('inputImage').addEventListener('change', handleImageUpload);

    // 知识库搜索
    $('knowledgeSearch').addEventListener('input', handleKnowledgeSearch);
    $('closeKnowledgeModal').addEventListener('click', closeKnowledgeModal);
    $('knowledgeModal').addEventListener('click', (e) => {
        if (e.target.id === 'knowledgeModal') closeKnowledgeModal();
    });

    // 练习模块
    bindPracticeEvents();

    // 加载 AI 配置
    loadAIConfig();

    // 注册 Service Worker（PWA 离线支持）
    registerServiceWorker();

    // AI 举一反三弹窗事件
    $('closeAIModal').addEventListener('click', closeAIModal);
    $('aiModal').addEventListener('click', (e) => {
        if (e.target.id === 'aiModal') closeAIModal();
    });
    $('openAISettingsBtn').addEventListener('click', openAISettings);
    $('closeAISettings').addEventListener('click', closeAISettings);
    $('cancelAISettings').addEventListener('click', closeAISettings);
    $('saveAISettings').addEventListener('click', handleSaveAISettings);
    $('aiSettingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'aiSettingsModal') closeAISettings();
    });

    // AI 编程伙伴对话弹窗事件
    $('closeChatModal').addEventListener('click', closeAIChat);
    $('chatModal').addEventListener('click', (e) => {
        if (e.target.id === 'chatModal') closeAIChat();
    });
    $('chatSendBtn').addEventListener('click', sendChatMessage);
    $('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    // 筛选
    bindFilterEvents();

    // 点击搜索遮罩关闭
    $('searchModal').addEventListener('click', (e) => {
        if (e.target.id === 'searchModal') closeSearch();
    });

    // ESC 关闭搜索
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if ($('searchModal').style.display !== 'none') {
                closeSearch();
            }
            if ($('knowledgeModal').style.display !== 'none') {
                closeKnowledgeModal();
            }
            if ($('practiceModal').style.display !== 'none') {
                closePracticeModal();
            }
            if ($('aiModal').style.display !== 'none') {
                closeAIModal();
            }
            if ($('chatModal').style.display !== 'none') {
                closeAIChat();
            }
            if ($('aiSettingsModal').style.display !== 'none') {
                closeAISettings();
            }
            if ($('challengeModal').style.display !== 'none') {
                closeChallengeModal();
            }
            if ($('shareModal').style.display !== 'none') {
                closeShareModal();
            }
            if ($('ocrModal').style.display !== 'none') {
                closeOcrModal();
            }
            if ($('syncModal').style.display !== 'none') {
                closeSyncModal();
            }
            if ($('weeklyModal').style.display !== 'none') {
                closeWeeklyModal();
            }
        }
    });

    // 首次加载页面
    switchPage('pageHome');
    updateTagFilter();
    renderReminderUI();
    renderChallengeCard();
    checkDailyReminder();

    // 检查是否有示例数据（首次使用时添加一些）
    if (mistakes.length === 0) {
        addSampleData();
    }

    // 启动头部 Shape Waves 动画背景
    initShapeWaves();
}

// 示例数据
function addSampleData() {
    mistakes = [
        {
            id: generateId(),
            title: '快速排序边界条件处理错误',
            lang: 'cpp',
            desc: '实现快速排序时，对 left 和 right 边界的处理不当导致程序崩溃。',
            wrongCode: `void quickSort(int arr[], int left, int right) {
    if (left >= right) return;
    int pivot = arr[left];
    int i = left, j = right;
    while (i < j) {
        while (i < j && arr[j] >= pivot) j--;
        arr[i] = arr[j];
        while (i < j && arr[i] <= pivot) i++;
        arr[j] = arr[i];
    }
    arr[i] = pivot;
    quickSort(arr, left, i);  // 错误：应该是 i - 1
    quickSort(arr, i, right);  // 错误：应该是 i + 1
}`,
            rightCode: `void quickSort(int arr[], int left, int right) {
    if (left >= right) return;
    int pivot = arr[left];
    int i = left, j = right;
    while (i < j) {
        while (i < j && arr[j] >= pivot) j--;
        arr[i] = arr[j];
        while (i < j && arr[i] <= pivot) i++;
        arr[j] = arr[i];
    }
    arr[i] = pivot;
    quickSort(arr, left, i - 1);   // 正确
    quickSort(arr, i + 1, right);  // 正确
}`,
            tags: ['快速排序', '边界条件', '分治'],
            note: '记住：快速排序的递归边界是 [left, i-1] 和 [i+1, right]，因为 i 位置已经是正确的。这是最常见的边界条件错误之一！',
            source: '蓝桥杯',
            image: null,
            status: 'pending',
            reviewCount: 0,
            lastReviewAt: Date.now(),
            createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000
        },
        {
            id: generateId(),
            title: 'Python 列表赋值陷阱（引用问题）',
            lang: 'python',
            desc: '尝试复制列表但结果两个列表相互影响。',
            wrongCode: `# 错误的方式
a = [1, 2, 3, 4, 5]
b = a        # 这只是引用，不是复制！
b.append(6)
print(a)     # 输出 [1, 2, 3, 4, 5, 6]  意外！
print(b)     # 输出 [1, 2, 3, 4, 5, 6]`,
            rightCode: `# 正确的方式
a = [1, 2, 3, 4, 5]
b = a.copy()      # 方式1: 使用 copy()
# b = a[:]        # 方式2: 切片
# b = list(a)     # 方式3: list() 构造器
b.append(6)
print(a)     # [1, 2, 3, 4, 5]  <span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span> 不受影响
print(b)     # [1, 2, 3, 4, 5, 6]`,
            tags: ['列表', '引用', '浅拷贝', 'Python基础'],
            note: 'Python 中 a = b 只是复制了引用。对于列表复制，使用 .copy()、[:] 或 list()。嵌套列表需要用 deepcopy。',
            source: '课堂',
            image: null,
            status: 'pending',
            reviewCount: 1,
            lastReviewAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
            createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000
        },
        {
            id: generateId(),
            title: 'JavaScript 闭包中的循环变量问题',
            lang: 'javascript',
            desc: '在 for 循环中使用 setTimeout，所有定时器都捕获到了循环结束后的最终值。',
            wrongCode: `// 错误：所有定时器输出 5
for (var i = 0; i < 5; i++) {
    setTimeout(function() {
        console.log(i);
    }, 1000);
}
// 输出：5, 5, 5, 5, 5`,
            rightCode: `// 方式1: 使用 let (ES6)
for (let i = 0; i < 5; i++) {
    setTimeout(function() {
        console.log(i);
    }, 1000);
}

// 方式2: 使用闭包
for (var i = 0; i < 5; i++) {
    (function(num) {
        setTimeout(function() {
            console.log(num);
        }, 1000);
    })(i);
}
// 两种方式都输出: 0, 1, 2, 3, 4`,
            tags: ['闭包', 'var vs let', '循环'],
            note: 'var 没有块级作用域，循环中的 setTimeout 回调共享同一个 i。使用 let（有块级作用域）或 IIFE 解决。',
            source: 'LeetCode',
            image: null,
            status: 'mastered',
            reviewCount: 6,
            lastReviewAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
            createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000
        }
    ];
    saveData();
}

/* ========================================
 * 错题练习模块 - 举一反三
 * ======================================== */

// ========== 活动日志（统计热力图数据源）==========
const ACTIVITY_STORAGE_KEY = 'code_activity_log_v1';
let activityLog = {};   // { 'YYYY-MM-DD': 次数 }

function todayKey(ts) {
    const d = new Date(ts || Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function loadActivityLog() {
    try {
        activityLog = localStorage.getItem(ACTIVITY_STORAGE_KEY) ? JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY)) : {};
    } catch (e) {
        activityLog = {};
    }
}

function saveActivityLog() {
    try { localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activityLog)); }
    catch (e) { console.error('保存活动日志失败:', e); }
}

function logActivity(ts) {
    const k = todayKey(ts);
    activityLog[k] = (activityLog[k] || 0) + 1;
    saveActivityLog();
}

/* ========================================
 * 学习积分与等级模块
 * ======================================== */
const POINTS_KEY = 'code_points_v1';

const LEVELS = [
    { level: 1, name: '青铜学徒', min: 0,   icon: '<span class="ico" data-ico="medal"><svg viewBox="0 0 24 24"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.01"/></svg></span>', color: '#5e9bd4' },
    { level: 2, name: '白银练手', min: 50,  icon: '<span class="ico" data-ico="medal"><svg viewBox="0 0 24 24"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.01"/></svg></span>', color: '#5e9bd4' },
    { level: 3, name: '黄金进阶', min: 150, icon: '<span class="ico" data-ico="medal"><svg viewBox="0 0 24 24"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.01"/></svg></span>', color: '#0071e3' },
    { level: 4, name: '铂金达人', min: 300, icon: '<span class="ico" data-ico="gem"><svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg></span>', color: '#0071e3' },
    { level: 5, name: '钻石高手', min: 600, icon: '<span class="ico" data-ico="flame"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span>', color: '#0058b0' },
    { level: 6, name: '荣耀宗师', min: 1000,icon: '<span class="ico" data-ico="trophy"><svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg></span>', color: '#0058b0' },
];

let userPoints = 0;

function loadPoints() {
    try {
        userPoints = parseInt(localStorage.getItem(POINTS_KEY), 10) || 0;
    } catch (e) { userPoints = 0; }
}

function savePoints() {
    try { localStorage.setItem(POINTS_KEY, String(userPoints)); }
    catch (e) { console.error('保存积分失败:', e); }
}

function addPoints(amount, reason) {
    if (!amount) return;
    userPoints += amount;
    savePoints();
    if (reason) showToast(`+${amount} 积分 · ${reason}`);
    renderPoints();
}

function getLevel(points) {
    let cur = LEVELS[0], next = null;
    for (let i = 0; i < LEVELS.length; i++) {
        if (points >= LEVELS[i].min) {
            cur = LEVELS[i];
            next = LEVELS[i + 1] || null;
        }
    }
    return { cur, next };
}

function renderPoints() {
    const el = $('pointsCard');
    if (!el) return;
    const { cur, next } = getLevel(userPoints);

    let progress = '';
    if (next) {
        const pct = Math.round((userPoints - cur.min) / (next.min - cur.min) * 100);
        progress = `
            <div class="points-level-line">距「${next.icon} ${next.name}」还需 ${next.min - userPoints} 分</div>
            <div class="points-track"><div class="points-fill" style="width:${pct}%;background:${next.color}"></div></div>
        `;
    } else {
        progress = `<div class="points-level-line"><span class="ico" data-ico="sparkles"><svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg></span> 已达成最高等级！</div>`;
    }

    el.innerHTML = `
        <div class="points-main">
            <div class="points-num">${userPoints}<span class="points-unit">分</span></div>
            <div class="points-identity">
                <span class="points-level-icon">${cur.icon}</span>
                <div>
                    <div class="points-level-name">${cur.name} · Lv.${cur.level}</div>
                    <div class="points-tip">记录/复习/练习可得积分，升级解锁等级</div>
                </div>
            </div>
        </div>
        ${progress}
    `;
}

/* ========================================
 * 连续打卡徽章模块
 * ======================================== */

const STREAK_BADGES = [
    { days: 3,   icon: '<span class="ico" data-ico="flame"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span>', name: '初心者',   color: '#5e9bd4' },
    { days: 7,   icon: '<span class="ico" data-ico="zap"><svg viewBox="0 0 24 24"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></span>', name: '一周坚持', color: '#5e9bd4' },
    { days: 14,  icon: '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>', name: '半月达人', color: '#0071e3' },
    { days: 30,  icon: '<span class="ico" data-ico="gem"><svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg></span>', name: '月度王者', color: '#0071e3' },
    { days: 60,  icon: '<span class="ico" data-ico="crown"><svg viewBox="0 0 24 24"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg></span>', name: '持之以恒', color: '#0058b0' },
    { days: 100, icon: '<span class="ico" data-ico="trophy"><svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg></span>', name: '百日传说', color: '#0058b0' },
];

function calcStreak() {
    const todayK = todayKey();
    const yestK  = todayKey(Date.now() - 86400000);

    // 今天和昨天都没有活动 → 断签
    if (!activityLog[todayK] && !activityLog[yestK]) return 0;

    // 从今天（或昨天）往前数连续天数
    let streak = 0;
    let d = new Date();
    if (!activityLog[todayK]) d.setDate(d.getDate() - 1); // 今天还没活动，从昨天起算
    while (activityLog[todayKey(d)]) {
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

function getStreakBadge(streak) {
    let current = null, next = null;
    for (let i = 0; i < STREAK_BADGES.length; i++) {
        if (streak >= STREAK_BADGES[i].days) {
            current = STREAK_BADGES[i];
            next = STREAK_BADGES[i + 1] || null;
        }
    }
    return { current, next };
}

function renderStreak() {
    const el = $('streakBar');
    if (!el) return;

    const streak = calcStreak();
    const { current, next } = getStreakBadge(streak);

    // 进度条
    let progressHtml = '';
    if (next) {
        const prevDays = current ? current.days : 0;
        const pct = Math.round((streak - prevDays) / (next.days - prevDays) * 100);
        progressHtml = `
            <div class="streak-progress-wrap">
                <div class="streak-progress-label">
                    <span>距「${next.icon} ${next.name}」还需 ${next.days - streak} 天</span>
                </div>
                <div class="streak-progress-track">
                    <div class="streak-progress-fill" style="width:${pct}%;background:${next.color}"></div>
                </div>
            </div>
        `;
    } else {
        progressHtml = `<div class="streak-max-hint"><span class="ico" data-ico="sparkles"><svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg></span> 已达成最高徽章！</div>`;
    }

    // 所有徽章展示（已解锁高亮，未解锁灰色）
    const badgesHtml = STREAK_BADGES.map(b => {
        const unlocked = streak >= b.days;
        return `<div class="streak-badge ${unlocked ? 'unlocked' : 'locked'}" title="${b.name}（${b.days}天）">
            <span class="streak-badge-icon">${b.icon}</span>
            <span class="streak-badge-name">${b.name}</span>
            <span class="streak-badge-days">${b.days}天</span>
        </div>`;
    }).join('');

    const todayK = todayKey();
    const todayCount = activityLog[todayK] || 0;

    el.innerHTML = `
        <div class="streak-card">
            <div class="streak-header">
                <div class="streak-main">
                    <div class="streak-count">
                        <span class="streak-num">${streak}</span>
                        <span class="streak-unit">天</span>
                    </div>
                    <div class="streak-fire">${current ? current.icon : '<span class="ico" data-ico="sprout"><svg viewBox="0 0 24 24"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg></span>'}</div>
                </div>
                <div class="streak-info">
                    <div class="streak-badge-name-lg">${current ? current.name : '开始你的第一天'}</div>
                    <div class="streak-today">今日活动 ${todayCount} 次</div>
                </div>
            </div>
            ${progressHtml}
            <div class="streak-badges">${badgesHtml}</div>
        </div>
    `;
}

// ========== 统计页（热力图 + 雷达图 + 趋势 + 日历）==========
function renderStats() {
    renderHeatmap();
    renderRadar();
    renderTrend();
    renderCalendar();
    renderReviewPlan();
}

function renderHeatmap() {
    const today = new Date();
    const weeks = 26; // 展示最近 26 周
    const cellDays = weeks * 7;
    const days = [];
    for (let i = cellDays - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push(d);
    }

    let max = 1;
    days.forEach(d => {
        const n = activityLog[todayKey(d)] || 0;
        if (n > max) max = n;
    });

    // 按周一到周日切列
    const firstDay = days[0];
    // 计算起始日前面差多少天补到周一
    const leading = (firstDay.getDay() + 6) % 7; // 周几到周一的偏移
    const colCount = Math.ceil((days.length + leading) / 7);
    const grid = [];
    let idx = 0;
    for (let w = 0; w < colCount; w++) {
        const col = [];
        for (let d = 0; d < 7; d++) {
            const globalIdx = w * 7 + d - leading;
            if (globalIdx < 0 || globalIdx >= days.length) {
                col.push(null);
            } else {
                col.push(days[globalIdx]);
            }
        }
        grid.push(col);
    }

    const title = $('statsHeatTitle');
    if (title) title.textContent = `${weeks} 周温故记录 · 共 ${Object.values(activityLog).reduce((a, b) => a + b, 0)} 次`;

    const heat = $('heatmapGrid');
    if (!heat) return;
    let html = '';
    for (let w = 0; w < grid.length; w++) {
        for (let d = 0; d < 7; d++) {
            const date = grid[w][d];
            if (!date) { html += '<div class="heat-cell empty"></div>'; continue; }
            const k = todayKey(date);
            const n = activityLog[k] || 0;
            const level = n === 0 ? 0 : Math.min(4, 1 + Math.floor((n - 1) * 3 / Math.max(1, max)));
            const isToday = todayKey(date) === todayKey();
            html += `<div class="heat-cell l${level}${isToday ? ' today' : ''}" title="${k} · ${n} 次"></div>`;
        }
    }
    heat.innerHTML = html;
}

// 弱点雷达图：按考点标签统计「待复习/错题集中度」与「练习正确率」
function renderRadar() {
    const container = $('radarSvg');
    if (!container) return;

    // 聚合按标签：总错题数、未掌握数、以及该标签相关练习正确率
    const tagMap = {};   // tag -> { total, weak, practiceTotal, practiceCorrect }
    (mistakes || []).forEach(m => {
        (m.tags || []).forEach(t => {
            if (!tagMap[t]) tagMap[t] = { total: 0, weak: 0, practiceTotal: 0, practiceCorrect: 0 };
            tagMap[t].total++;
            if (m.status !== 'mastered') tagMap[t].weak++;
        });
    });

    // 结合练习正确率（覆盖 practice-data 中的 tags 匹配）
    Object.keys(practiceRecords || {}).forEach(qid => {
        const rec = practiceRecords[qid];
        if (!rec) return;
        const q = getAllPracticeQuestions().find(x => x.id === qid);
        if (!q) return;
        const t = q.topic || q.category;
        if (!tagMap[t]) tagMap[t] = { total: 0, weak: 0, practiceTotal: 0, practiceCorrect: 0 };
        tagMap[t].practiceTotal++;
        if (rec.correct) tagMap[t].practiceCorrect++;
    });

    const entries = Object.entries(tagMap)
        .filter(([t, v]) => (v.total + v.practiceTotal) > 0)
        .sort((a, b) => (b[1].total + b[1].practiceTotal) - (a[1].total + a[1].practiceTotal))
        .slice(0, 8);

    const hideEmpty = () => { const e = $('statsRadarEmpty'); if (e) e.style.display = 'none'; };
    const showEmpty = () => { const e = $('statsRadarEmpty'); if (e) e.style.display = 'block'; };

    if (entries.length < 2) {
        container.innerHTML = '';
        showEmpty();
        return;
    }
    hideEmpty();

    // 弱点系数 = 未掌握错题占比 + 练习错误率，合成为 0~1
    const data = entries.map(([t, v]) => {
        const m = v.total ? v.weak / v.total : 0;
        const p = v.practiceTotal ? (v.practiceTotal - v.practiceCorrect) / v.practiceTotal : 0;
        const score = m * 0.6 + p * 0.4;
        return { tag: t, score: Math.max(0, Math.min(1, score || 0)) };
    });

    const size = 300, cx = 150, cy = 145, R = 90;
    const n = data.length;
    const angle = (i) => (Math.PI * 2 / n) * i - Math.PI / 2;
    const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))].map(v => +v.toFixed(2)).join(',');

    let poly = '';
    for (let ring = 1; ring <= 4; ring++) {
        const rr = R * ring / 4;
        poly += `<polygon points="${data.map((_, i) => pt(i, rr)).join(' ')}" class="radar-ring"/>`;
    }
    let axes = '';
    data.forEach((_, i) => {
        const [x, y] = pt(i, R).split(',').map(Number);
        axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-axis"/>`;
    });
    const polyPts = data.map((_, i) => pt(i, R * data[i].score)).map((s) => {
        const [x, y] = s.split(',');
        return `${x},${y}`;
    }).join(' ');
    let dots = data.map((_, i) => {
        const [x, y] = pt(i, R * data[i].score).split(',');
        return `<circle cx="${x}" cy="${y}" r="3.5" class="radar-dot"/>`;
    }).join('');
    let labels = data.map((d, i) => {
        const [x0, y0] = pt(i, R + 4).split(',').map(Number);
        const [x, y] = pt(i, R + 20).split(',').map(Number);
        return `<text x="${x}" y="${y + 4}" class="radar-label" text-anchor="middle">${escapeHtml(d.tag)}</text>`;
    }).join('');

    container.innerHTML = `
        <svg viewBox="0 0 ${size} ${size}" class="radar-svg">
            ${poly}${axes}${labels}
            <polygon points="${polyPts}" class="radar-area" fill-opacity="0.35"/>
            <polygon points="${polyPts}" class="radar-stroke"/>
            ${dots}
        </svg>
        <div class="radar-legend">
            <span class="radar-legend-title">弱点集中度（值越高越弱）</span>
            <ul class="radar-legend-list">
                ${data.map((d, i) => {
                    const color = d.score > 0.66 ? '#ff3b30' : d.score > 0.33 ? '#ff9500' : '#34c759';
                    return `<li><i class="legend-dot" style="background:${color}"></i>${escapeHtml(d.tag)} <b>${Math.round(d.score * 100)}%</b></li>`;
                }).join('')}
            </ul>
        </div>
    `;
}

// ========== 错题趋势折线图 ==========
let trendRange = 'week';   // 'week' | 'month'

function setTrendRange(r) {
    trendRange = r;
    document.querySelectorAll('.trend-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.range === r);
    });
    renderTrend();
}

function buildTrendBuckets() {
    const now = Date.now();
    const dayMs = 86400000;

    // 收集每条错题的新增时间(mastered 时间取 lastReviewAt)
    const items = (mistakes || []).map(m => ({
        created: m.createdAt,
        mastered: (m.status === 'mastered') ? (m.lastReviewAt || m.createdAt) : null
    })).filter(i => i.created);

    if (trendRange === 'month') {
        // 按月：近 12 个月，键 = 'YYYY-MM'
        const buckets = [];
        const nowD = new Date(now);
        for (let i = 11; i >= 0; i--) {
            const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            buckets.push({ key, label: `${d.getMonth() + 1}月`, created: 0, mastered: 0 });
        }
        const find = key => buckets.find(b => b.key === key);
        items.forEach(i => {
            const ck = `${new Date(i.created).getFullYear()}-${String(new Date(i.created).getMonth() + 1).padStart(2, '0')}`;
            const b = find(ck); if (b) b.created++;
            if (i.mastered) {
                const mk = `${new Date(i.mastered).getFullYear()}-${String(new Date(i.mastered).getMonth() + 1).padStart(2, '0')}`;
                const b2 = find(mk); if (b2) b2.mastered++;
            }
        });
        return buckets;
    }

    // 按周：近 12 周，键 = 周起始日(周一)
    const buckets = [];
    const offset = (new Date(now).getDay() + 6) % 7; // 今天距本周一
    for (let i = 11; i >= 0; i--) {
        const monday = new Date(now - (offset + i * 7) * dayMs);
        monday.setHours(0, 0, 0, 0);
        const key = todayKey(monday);
        buckets.push({ key, label: `W${11 - i + 1}`, created: 0, mastered: 0 });
    }
    const mondayOf = ts => {
        const d = new Date(ts);
        const o = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - o);
        d.setHours(0, 0, 0, 0);
        return todayKey(d);
    };
    items.forEach(i => {
        const b = buckets.find(x => x.key === mondayOf(i.created)); if (b) b.created++;
        if (i.mastered) { const b2 = buckets.find(x => x.key === mondayOf(i.mastered)); if (b2) b2.mastered++; }
    });
    return buckets;
}

function renderTrend() {
    const svg = $('trendSvg');
    if (!svg) return;
    const buckets = buildTrendBuckets();
    const hasData = buckets.some(b => b.created > 0 || b.mastered > 0);

    const emptyEl = $('statsTrendEmpty');
    if (emptyEl) emptyEl.style.display = hasData ? 'none' : 'block';
    if (!hasData) { svg.innerHTML = ''; return; }

    const W = 440, H = 160, PAD = { l: 30, r: 12, t: 14, b: 28 };
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const n = buckets.length;
    const max = Math.max(1, ...buckets.flatMap(b => [b.created, b.mastered]));

    const dateColors = { created: '#0071e3', mastered: '#34c759' };

    function path(keyName) {
        let d = '';
        buckets.forEach((b, i) => {
            const x = PAD.l + (n === 1 ? innerW / 2 : innerW * i / (n - 1));
            const y = PAD.t + innerH - (b[keyName] / max) * innerH;
            d += (i === 0 ? `M` : `L`) + `${x.toFixed(1)},${y.toFixed(1)} `;
        });
        return d;
    }

    // 折线 + 面积
    function area(keyName) {
        let d = '';
        buckets.forEach((b, i) => {
            const x = PAD.l + (n === 1 ? innerW / 2 : innerW * i / (n - 1));
            const y = PAD.t + innerH - (b[keyName] / max) * innerH;
            d += (i === 0 ? `M` : `L`) + `${x.toFixed(1)},${y.toFixed(1)} `;
        });
        return d + `L${(PAD.l + innerW).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${PAD.l},${(PAD.t + innerH).toFixed(1)} Z`;
    }

    // 网格线（水平 3 条）与 Y 轴刻度
    let grid = '';
    for (let g = 0; g <= 3; g++) {
        const y = PAD.t + innerH * g / 3;
        grid += `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" class="trend-grid"/>`;
        grid += `<text x="${PAD.l - 6}" y="${y + 3}" class="trend-y" text-anchor="end">${Math.round(max - max * g / 3)}</text>`;
    }

    // X 轴标签（间隔显示避免拥挤）
    let xLabels = '';
    buckets.forEach((b, i) => {
        if (n > 8 && i % Math.ceil(n / 6) !== 0) return;
        const x = PAD.l + (n === 1 ? innerW / 2 : innerW * i / (n - 1));
        xLabels += `<text x="${x}" y="${H - 8}" class="trend-x" text-anchor="middle">${b.label}</text>`;
    });

    // 数据点
    let dots = '';
    ['created', 'mastered'].forEach(kn => {
        buckets.forEach((b, i) => {
            const x = PAD.l + (n === 1 ? innerW / 2 : innerW * i / (n - 1));
            const y = PAD.t + innerH - (b[kn] / max) * innerH;
            dots += `<circle cx="${x}" cy="${y}" r="3" fill="${dateColors[kn]}"><title>${b.label} 新增${b.created} 掌握${b.mastered}</title></circle>`;
        });
    });

    svg.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" style="width:100%">
            ${grid}
            <path d="${area('created')}" fill="#0071e3" opacity="0.08"/>
            <path d="${path('created')}" fill="none" stroke="#0071e3" stroke-width="2"/>
            <path d="${area('mastered')}" fill="#34c759" opacity="0.08"/>
            <path d="${path('mastered')}" fill="none" stroke="#34c759" stroke-width="2"/>
            ${dots}
            ${xLabels}
        </svg>
    `;
}

// ========== 错题日历回顾 ==========
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();   // 0-11

function calMoveMonth(delta) {
    let d = new Date(calYear, calMonth + delta, 1);
    calYear = d.getFullYear();
    calMonth = d.getMonth();
    renderCalendar();
}

function renderCalendar() {
    const grid = $('calGrid');
    const title = $('calTitle');
    const list = $('calDayList');
    if (!grid || !title) return;

    title.textContent = `${calYear}年 ${calMonth + 1}月`;

    const first = new Date(calYear, calMonth, 1);
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const leading = first.getDay();   // 0=周日

    // 按天收集错题
    const byDay = {};
    (mistakes || []).forEach(m => {
        const k = todayKey(m.createdAt);
        const y = +k.slice(0, 4), mo = +k.slice(5, 7), da = +k.slice(8, 10);
        if (y === calYear && mo === calMonth + 1) {
            (byDay[da] = byDay[da] || []).push(m);
        }
    });

    let html = '';
    for (let i = 0; i < leading + daysInMonth; i++) {
        const day = i - leading + 1;
        if (i < leading) { html += `<div class="cal-cell empty"></div>`; continue; }
        const listOfDay = byDay[day] || [];
        const isToday = (day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear());
        const has = listOfDay.length > 0;
        html += `<div class="cal-cell${isToday ? ' today' : ''}${has ? ' has' : ''}" onclick="showCalDay(${day})">
            <span class="cal-day-num">${day}</span>
            ${has ? `<span class="cal-day-dot">${listOfDay.length}</span>` : ''}
        </div>`;
    }
    grid.innerHTML = html;

    // 默认展示今天
    showCalDay(new Date().getDate());
}

function showCalDay(day) {
    const list = $('calDayList');
    if (!list) return;
    const items = (mistakes || []).filter(m => {
        const k = todayKey(m.createdAt);
        return +k.slice(0, 4) === calYear && +k.slice(5, 7) === calMonth + 1 && +k.slice(8, 10) === day;
    });

    if (!items.length) {
        list.innerHTML = `<div class="cal-day-empty">这一天还没有记录错题</div>`;
        return;
    }

    list.innerHTML = `
        <div class="cal-day-title">${calYear}年${calMonth + 1}月${day}日 · ${items.length} 道错题</div>
        <div class="cal-day-items">
            ${items.map(m => `<div class="cal-day-item" onclick="viewMistake('${m.id}')">
                <span class="lang-badge">${getLangName(m.lang)}</span>
                <span class="cal-day-item-title">${escapeHtml(m.title)}</span>
                <span class="cal-day-item-status">${m.status === 'mastered' ? '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span>' : '<span class="ico" data-ico="pin"><svg viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></span>'}</span>
            </div>`).join('')}
        </div>
    `;
}

// ========== 练习状态 ==========
const PRACTICE_STORAGE_KEY = 'code_practice_record_v1';
let practiceActiveCategory = '';
let practiceRecords = {};      // { q01: { done: true, correct: true, lastAt: ts, count: n } }
let currentPracticeQuestion = null;
let currentPracticeSelected = -1;
let currentPracticeAnswered = false;

// ========== 练习数据加载 ==========
function loadPracticeRecords() {
    try {
        const data = localStorage.getItem(PRACTICE_STORAGE_KEY);
        practiceRecords = data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('加载练习记录失败:', e);
        practiceRecords = {};
    }
}

function savePracticeRecords() {
    try {
        localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(practiceRecords));
    } catch (e) {
        console.error('保存练习记录失败:', e);
    }
}

// ========== 事件绑定 ==========
function bindPracticeEvents() {
    // 分类按钮
    document.querySelectorAll('.practice-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.practice-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            practiceActiveCategory = btn.dataset.cat;
            renderPracticeList();
        });
    });

    // 关闭答题弹窗
    $('closePracticeModal').addEventListener('click', closePracticeModal);
    $('practiceModal').addEventListener('click', (e) => {
        if (e.target.id === 'practiceModal') closePracticeModal();
    });
}

// ========== 渲染练习列表 ==========
function renderPractice() {
    if (!practiceRecords || Object.keys(practiceRecords).length === 0) {
        loadPracticeRecords();
    }
    updatePracticeStats();
    renderPracticeList();
}

function updatePracticeStats() {
    const records = Object.values(practiceRecords);
    const done = records.filter(r => r.done).length;
    const correct = records.filter(r => r.done && r.correct).length;
    const rate = done > 0 ? Math.round((correct / done) * 100) : 0;

    $('practiceDone').textContent = done;
    $('practiceCorrect').textContent = correct;
    $('practiceRate').textContent = rate + '%';
}

function renderPracticeList() {
    const listEl = $('practiceList');
    if (!listEl) return;

    let questions = getAllPracticeQuestions();
    if (practiceActiveCategory) {
        questions = questions.filter(q => q.category === practiceActiveCategory);
    }

    if (questions.length === 0) {
        listEl.innerHTML = '<div class="practice-empty">该分类下暂无练习题</div>';
        return;
    }

    listEl.innerHTML = questions.map(q => {
        const rec = practiceRecords[q.id];
        let statusHtml = '<span class="practice-card-status unseen">未做</span>';
        if (rec && rec.done) {
            statusHtml = rec.correct
                ? '<span class="practice-card-status correct">已掌握</span>'
                : '<span class="practice-card-status wrong">需巩固</span>';
        }
        const stars = '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(q.difficulty || 1) + '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(3 - (q.difficulty || 1));
        const relatedCount = (q.related || []).length;

        return `
            <div class="practice-card" onclick="openPracticeQuestion('${q.id}')">
                <div class="practice-card-meta">
                    <span class="practice-card-category">${escapeHtml(q.category)}</span>
                    <span class="practice-card-topic">知识点：${escapeHtml(q.topic || '综合')}</span>
                </div>
                <div class="practice-card-question">${escapeHtml(q.question)}</div>
                <div class="practice-card-footer">
                    <span class="practice-card-difficulty">${stars}</span>
                    ${statusHtml}
                </div>
                ${relatedCount > 0 ? `<div class="practice-card-related"><span class="ico" data-ico="link"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span> 举一反三：${relatedCount} 道相关题</div>` : ''}
            </div>
        `;
    }).join('');
}

// ========== 答题弹窗 ==========
function openPracticeQuestion(qid) {
    const q = getAllPracticeQuestions().find(x => x.id === qid);
    if (!q) {
        showToast('题目不存在');
        return;
    }

    currentPracticeQuestion = q;
    currentPracticeSelected = -1;
    currentPracticeAnswered = false;

    $('practiceModalTitle').textContent = `${q.category} · ${q.topic || '综合'}`;
    renderPracticeQuestion();
    $('practiceModal').style.display = 'flex';
}

function closePracticeModal() {
    $('practiceModal').style.display = 'none';
    currentPracticeQuestion = null;
    currentPracticeSelected = -1;
    currentPracticeAnswered = false;
}

function renderPracticeQuestion() {
    const q = currentPracticeQuestion;
    if (!q) return;

    const quizEl = $('practiceQuiz');
    const rec = practiceRecords[q.id] || {};
    const answered = currentPracticeAnswered;

    const optionsHtml = q.options.map((opt, idx) => {
        let cls = 'practice-quiz-option';
        if (answered) {
            if (idx === q.answer) cls += ' correct-answer';
            else if (idx === currentPracticeSelected) cls += ' wrong-answer';
        } else if (idx === currentPracticeSelected) {
            cls += ' selected';
        }
        return `<button class="${cls}" onclick="selectPracticeOption(${idx})">${String.fromCharCode(65 + idx)}. ${escapeHtml(opt)}</button>`;
    }).join('');

    const stars = '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(q.difficulty || 1) + '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(3 - (q.difficulty || 1));

    let explanationHtml = '';
    if (answered) {
        explanationHtml = `
            <div class="practice-quiz-explanation">
                <div class="practice-quiz-explanation-title">${currentPracticeSelected === q.answer ? '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 回答正确' : '<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 回答错误'}</div>
                <div>正确答案：${String.fromCharCode(65 + q.answer)}. ${escapeHtml(q.options[q.answer])}</div>
                <div style="margin-top:6px;"><span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> ${escapeHtml(q.explanation || '')}</div>
            </div>
        `;
    }

    // 举一反三：答题后展示相关题
    let relatedHtml = '';
    if (answered && q.related && q.related.length > 0) {
        const relatedQuestions = q.related
            .map(rid => getAllPracticeQuestions().find(x => x.id === rid))
            .filter(Boolean);

        if (relatedQuestions.length > 0) {
            const items = relatedQuestions.map(rq => {
                const rrec = practiceRecords[rq.id];
                let tag = '';
                if (rrec && rrec.done) {
                    tag = rrec.correct ? ' <span class="practice-card-status correct">已掌握</span>'
                                       : ' <span class="practice-card-status wrong">需巩固</span>';
                }
                return `<div class="practice-related-item" onclick="jumpToPracticeQuestion('${rq.id}')">
                    <strong>[${escapeHtml(rq.category)}]</strong> ${escapeHtml(rq.question)}${tag}
                </div>`;
            }).join('');

            relatedHtml = `
                <div class="practice-related-box">
                    <div class="practice-related-title"><span class="ico" data-ico="link"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span> 举一反三 - 相关知识点练习</div>
                    <div class="practice-related-list">${items}</div>
                </div>
            `;
        }
    }

    // 操作按钮
    let actionsHtml = '';
    if (answered) {
        actionsHtml = `
            <div class="practice-quiz-actions">
                <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="closePracticeModal()">关闭</button>
                <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="nextPracticeQuestion()">下一题</button>
            </div>
        `;
    } else {
        actionsHtml = `
            <div class="practice-quiz-actions">
                <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="closePracticeModal()">取消</button>
                <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="submitPracticeAnswer()" ${currentPracticeSelected < 0 ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>提交答案</button>
            </div>
        `;
    }

    quizEl.innerHTML = `
        <div class="practice-quiz-progress">难度：${stars} · 知识点：${escapeHtml(q.topic || '综合')}</div>
        <div class="practice-quiz-question">${escapeHtml(q.question)}</div>
        <div class="practice-quiz-options">${optionsHtml}</div>
        ${explanationHtml}
        ${relatedHtml}
        ${actionsHtml}
    `;
}

function selectPracticeOption(idx) {
    if (currentPracticeAnswered) return;
    currentPracticeSelected = idx;
    renderPracticeQuestion();
}

function submitPracticeAnswer() {
    if (currentPracticeAnswered || !currentPracticeQuestion) return;
    if (currentPracticeSelected < 0) {
        showToast('请先选择一个答案');
        return;
    }

    const q = currentPracticeQuestion;
    const correct = (currentPracticeSelected === q.answer);

    // 更新练习记录（举一反三算法的关键：记录每题状态，作为推荐依据）
    const prev = practiceRecords[q.id] || { done: false, correct: false, count: 0 };
    practiceRecords[q.id] = {
        done: true,
        correct: correct,
        lastAt: Date.now(),
        count: (prev.count || 0) + 1
    };
    savePracticeRecords();
    logActivity();
    if (correct) addPoints(30, '答对一道练习');
    currentPracticeAnswered = true;
    renderPracticeQuestion();
    updatePracticeStats();
    checkAchievements(true);

    showToast(correct ? '回答正确！' : '回答错误，看看解析吧');
}

function nextPracticeQuestion() {
    if (!currentPracticeQuestion) return;

    const q = currentPracticeQuestion;

    // 举一反三算法：优先推送相关题；如相关题已掌握或不存在，则推同分类的未做/未掌握题
    let nextQ = null;

    // 1. 优先推荐相关题中"未做"或"未掌握"的
    if (q.related && q.related.length > 0) {
        const candidates = q.related
            .map(rid => getAllPracticeQuestions().find(x => x.id === rid))
            .filter(Boolean)
            .filter(rq => {
                const r = practiceRecords[rq.id];
                return !r || !r.done || !r.correct;
            });
        if (candidates.length > 0) {
            nextQ = candidates[Math.floor(Math.random() * candidates.length)];
        }
    }

    // 2. 退而求其次：从同分类下找未做或未掌握的题
    if (!nextQ) {
        const all = getAllPracticeQuestions();
        const sameCategory = all.filter(x => x.category === q.category && x.id !== q.id);
        const candidates = sameCategory.filter(rq => {
            const r = practiceRecords[rq.id];
            return !r || !r.done || !r.correct;
        });
        if (candidates.length > 0) {
            nextQ = candidates[Math.floor(Math.random() * candidates.length)];
        } else if (sameCategory.length > 0) {
            nextQ = sameCategory[Math.floor(Math.random() * sameCategory.length)];
        }
    }

    // 3. 再退一步：从全题库中找未做/未掌握的
    if (!nextQ) {
        const all = getAllPracticeQuestions();
        const candidates = all.filter(rq => {
            const r = practiceRecords[rq.id];
            return !r || !r.done || !r.correct;
        });
        if (candidates.length > 0) {
            nextQ = candidates[Math.floor(Math.random() * candidates.length)];
        }
    }

    if (nextQ) {
        openPracticeQuestion(nextQ.id);
    } else {
        showToast('全部题目都已掌握，太棒了！');
        closePracticeModal();
        renderPracticeList();
    }
}

function jumpToPracticeQuestion(qid) {
    openPracticeQuestion(qid);
}

/* ========================================
 * AI 举一反三模块 - 基于错题生成变式题
 * ======================================== */

// ========== AI 配置与状态 ==========
const AI_CONFIG_KEY = 'ai_config_v1';
const AI_QUESTIONS_KEY = 'ai_generated_questions_v1';

let aiConfig = { baseURL: '', apiKey: '', model: '', count: 3 };
let aiCurrentMistake = null;        // 当前作为出题依据的错题
let aiGeneratedQuestions = [];      // 本轮生成的题目（临时）
let aiAnswerState = {};             // { qid: { selected, answered } }

// 加载/保存 AI 配置
function loadAIConfig() {
    try {
        const data = localStorage.getItem(AI_CONFIG_KEY);
        aiConfig = data ? { ...aiConfig, ...JSON.parse(data) } : aiConfig;
    } catch (e) { console.error('加载AI配置失败:', e); }
}
function saveAIConfig() {
    try { localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(aiConfig)); } catch (e) {}
}

// 加载/保存 AI 生成题库（持久化为练习题）
function loadAIQuestions() {
    try {
        const data = localStorage.getItem(AI_QUESTIONS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}
function saveAIQuestion(q) {
    const list = loadAIQuestions();
    // 避免重复 id
    if (!list.some(x => x.id === q.id)) {
        list.push(q);
        try { localStorage.setItem(AI_QUESTIONS_KEY, JSON.stringify(list)); } catch (e) {}
    }
}

// 统一获取所有练习题（内置 + AI 生成）
function getAllPracticeQuestions() {
    const builtin = (typeof PRACTICE_QUESTIONS !== 'undefined') ? PRACTICE_QUESTIONS : [];
    return [...builtin, ...loadAIQuestions()];
}

// ========== 打开/关闭弹窗 ==========
function openAIModal(mistakeId) {
    const m = mistakes.find(x => x.id === mistakeId);
    if (!m) { showToast('错题不存在'); return; }

    aiCurrentMistake = m;
    aiGeneratedQuestions = [];
    aiAnswerState = {};

    $('aiModalTitle').textContent = '<span class="ico" data-ico="bot"><svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></span> AI 举一反三 · ' + (m.title || '').slice(0, 16);
    $('aiModal').style.display = 'flex';

    if (!aiConfig.apiKey || !aiConfig.baseURL || !aiConfig.model) {
        renderAIBody({ type: 'no-config' });
    } else {
        generateAIQuestions();
    }
}

function closeAIModal() {
    $('aiModal').style.display = 'none';
    aiCurrentMistake = null;
    aiGeneratedQuestions = [];
    aiAnswerState = {};
}

// ========== AI 配置弹窗 ==========
function openAISettings() {
    loadAIConfig();
    $('aiBaseURL').value = aiConfig.baseURL || '';
    $('aiApiKey').value = aiConfig.apiKey || '';
    $('aiModel').value = aiConfig.model || '';
    $('aiCount').value = aiConfig.count || 3;
    $('aiSettingsModal').style.display = 'flex';
}
function closeAISettings() {
    $('aiSettingsModal').style.display = 'none';
}
function handleSaveAISettings() {
    const baseURL = $('aiBaseURL').value.trim().replace(/\/+$/, '');
    const apiKey = $('aiApiKey').value.trim();
    const model = $('aiModel').value.trim();
    const count = Math.max(1, Math.min(6, parseInt($('aiCount').value) || 3));

    if (!baseURL || !apiKey || !model) {
        showToast('请填写完整配置');
        return;
    }

    aiConfig = { baseURL, apiKey, model, count };
    saveAIConfig();
    closeAISettings();
    showToast('配置已保存');
    // 若 AI 弹窗处于"未配置"态，保存后自动开始出题
    if (aiCurrentMistake && aiGeneratedQuestions.length === 0) {
        generateAIQuestions();
    }
}

// ========== 提示词构造 ==========
function buildAIPrompt(m) {
    const langName = getLangName(m.lang);
    const tags = (m.tags || []).join('、') || '综合';
    const count = aiConfig.count || 3;

    // 错题字段：空值用占位符，避免提示词出现"无内容"歧义
    const wrongCode = (m.wrongCode || '').trim() || '//（原错题未提供错误代码）';
    const rightCode = (m.rightCode || '').trim() || '//（原错题未提供正确代码）';
    const note = (m.note || '').trim() || '（未填写错误分析）';
    const title = (m.title || '').trim() || '（无标题）';

    return `# 角色
你是一位严谨、有 10 年经验的编程教学专家，擅长从一道学生的错题出发，设计出能"举一反三"的变式选择题，帮助学生真正吃透考点、避免再犯同类错误。

# 任务
基于下方学生的原错题，生成 ${count} 道四选一变式选择题。题型在「概念辨析题」与「代码补全题」两种之间搭配（${count >= 3 ? '至少各 1 道' : '可任选'}），题目要覆盖不同认知层次（记忆 / 理解 / 应用 / 分析），难度逐题递增，做到"做一道带会一类"。

## 题型说明
- **choice 概念辨析题**：题干是文字描述，4 个选项是文字。考察概念、原理、边界、复杂度等。
- **code 代码补全题**：题干给一段有 \`<空缺>\` 标记的代码，问空缺处应填什么。4 个选项是**合法的代码片段**（不是完整程序），学生选出填入后能正确运行的片段。适合考察 API 易错、语法陷阱、边界处理。

# 原错题信息
- 标题：${title}
- 编程语言：${langName}
- 考点标签：${tags}
- 学生错误代码：
\`\`\`${m.lang || 'text'}
${wrongCode}
\`\`\`
- 正确代码：
\`\`\`${m.lang || 'text'}
${rightCode}
\`\`\`
- 学生自己的错误分析：${note}

# 出题设计原则

## 1. 视角矩阵（每题至少命中一个角度，整组要覆盖多个不同角度）
- **易混概念对比**：把考点与常见易混概念并排，要求学生辨析（例：数组的 length vs 容量、闭包 vs 作用域链）
- **边界 / 极端输入**：用空集、单元素、超大输入、负数、已排序等边界来考察
- **变形场景**：把原题场景换一个数据形态或语境（如数组→链表、循环→递归、单线程→并发）
- **反例识别**：给出 4 段代码，问哪一段会再次触发原错题同样的 bug
- **原理追问**：不考"怎么做"，考"为什么这么做 / 为什么错"
- **复杂度与权衡**：考察时间/空间复杂度、稳定性的取舍

## 2. 难度梯度（必须 ${count} 道题覆盖多档难度）
- difficulty=1 基础：直接复现考点的核心定义/性质，秒答
- difficulty=2 进阶：需要一步推导或结合场景应用
- difficulty=3 挑战：综合多个概念、含陷阱、需反向分析

## 3. 干扰项设计原则
- 4 个选项长度相近、句式一致，禁止"以上都对 / 以上都错"类凑数项
- 干扰项必须来自学生真实易错点（基于原错题的错误分析），不要凭空捏造明显错误的选项
- 若是代码类题，干扰项代码必须语法合法、可独立运行，只在"是否触发原 bug"上有区别

## 4. 题干规范
- 严禁照抄原题题干或代码，必须改写场景、数据或问法
- 题干自包含，学生无需回看原题即可作答
- 代码片段用 \`\`\` 包裹并在语言标签内

## 5. 解析规范
- 一句话点明"为什么对、为什么错"，不超过 60 字
- 不要复述题干，要给出可记忆的口诀或关键点

# 输出格式（必须严格遵守）

只输出一个 JSON 对象，禁止任何解释性文字、禁止 markdown 代码块包裹。结构如下：

{
  "questions": [
    {
      "type": "choice",
      "topic": "字符串型知识点名，如：快速排序的分区策略",
      "difficulty": 1,
      "question": "题干文本，代码用三反引号包裹",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 0,
      "explanation": "一句话解析，点明为什么对、为什么错",
      "mnemonic": "一句话易错口诀，便于学生记忆，如：分区后 pivot 已落位，递归跳过 i"
    }
  ]
}

字段约束：
- 恰好生成 ${count} 道题，options 数组恰好 4 个字符串元素
- type 必须是 "choice" 或 "code"，${count >= 3 ? '两种类型至少各出现 1 道' : ''}
- answer 必须是 0~3 的整数，表示正确选项在 options 中的下标
- difficulty 必须是 1、2 或 3 的整数
- ${count} 道题的 difficulty 必须覆盖至少 2 个不同档位
- explanation：不超过 60 字，点明对错原因
- mnemonic：不超过 30 字的口诀或关键提示，给学生在考场上能默念的速记点，禁止复述题干
- type=code 时，question 必须含 \`<空缺>\` 标记；options 4 项必须是合法代码片段（不是整段程序），4 个片段长度相近
- 所有字符串必须是纯文本，禁止 \\n 之外的转义符，禁止嵌套 JSON

# 参考样例（仅示意，禁止复制本样例的题目）

输入错题：快速排序把 pivot 的递归边界写成 [left, i] 而非 [left, i-1]
输出：
{
  "questions": [
    {
      "type": "choice",
      "topic": "快速排序的分区策略",
      "difficulty": 1,
      "question": "快速排序每一趟分区完成后，pivot 最终所在位置 i 的状态是？",
      "options": ["i 位置仍是待排序元素", "i 位置已经是最终有序位置", "i 位置需要再被作为 pivot", "i 位置数据将被丢弃"],
      "answer": 1,
      "explanation": "分区后 pivot 已落最终位置，递归时不应再包含 i。",
      "mnemonic": "pivot 落位即终局，递归跳过 i 不回头"
    },
    {
      "type": "code",
      "topic": "快速排序的递归边界",
      "difficulty": 2,
      "question": "下面是修正后的快速排序骨架，\`<空缺>\` 处应填什么才能避免原题的递归死循环？\\n\`\`\`cpp\\nvoid quickSort(int a[], int l, int r) {\\n  if (l >= r) return;\\n  int i = partition(a, l, r);\\n  quickSort(a, l, <空缺>);\\n  quickSort(a, <空缺>, r);\\n}\\n\`\`\`",
      "options": ["i - 1, i + 1", "i, i + 1", "i - 1, i", "i, i - 1"],
      "answer": 0,
      "explanation": "pivot 已在 i 落位，左右递归必须排除 i，故为 [l, i-1] 与 [i+1, r]。",
      "mnemonic": "左闭右开都不含 i：i-1 与 i+1"
    }
  ]
}

现在请基于上方"原错题信息"，按上述规范生成 ${count} 道变式选择题。`;
}

// ========== 调用 LLM ==========
async function callLLM(prompt) {
    const url = aiConfig.baseURL.replace(/\/+$/, '') + '/chat/completions';
    const body = {
        model: aiConfig.model,
        messages: [
            { role: 'system', content: '你是一位严谨的编程教学专家，只输出严格 JSON。' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + aiConfig.apiKey
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error('HTTP ' + resp.status + (text ? (': ' + text.slice(0, 200)) : ''));
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 返回为空');
    return content;
}

// ========== 解析 LLM 输出 ==========
function parseAIQuestions(content) {
    // 容错：尝试提取第一个 JSON 对象
    let text = content.trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        text = text.slice(start, end + 1);
    }
    const obj = JSON.parse(text);
    let list = obj.questions || obj.data || obj;
    if (!Array.isArray(list)) throw new Error('LLM 返回格式不正确');

    return list.map((q, idx) => {
        const options = Array.isArray(q.options) ? q.options.map(String) : [];
        if (options.length < 2) throw new Error('选项数不足');
        let answer = Number(q.answer);
        if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
            answer = 0;
        }
        // 题型容错：仅识别 code，其他一律按 choice 处理
        const rawType = String(q.type || 'choice').toLowerCase();
        const type = rawType === 'code' ? 'code' : 'choice';
        return {
            id: 'ai_' + Date.now().toString(36) + '_' + idx,
            category: 'AI变式',
            topic: String(q.topic || aiCurrentMistake?.tags?.[0] || '综合'),
            difficulty: Math.max(1, Math.min(3, Number(q.difficulty) || 1)),
            type,
            question: String(q.question || ''),
            options,
            answer,
            explanation: String(q.explanation || ''),
            mnemonic: String(q.mnemonic || '').trim(),
            related: [],
            sourceMistakeId: aiCurrentMistake ? aiCurrentMistake.id : null,
            createdAt: Date.now()
        };
    });
}

// ========== 主流程：生成题目 ==========
async function generateAIQuestions() {
    if (!aiCurrentMistake) return;

    aiGeneratedQuestions = [];
    aiAnswerState = {};
    renderAIBody({ type: 'loading' });

    // 最小加载时间 800ms，避免 DNS 失败太快导致 spinner 一闪而过
    const minLoading = new Promise(r => setTimeout(r, 800));

    try {
        const prompt = buildAIPrompt(aiCurrentMistake);
        const [content] = await Promise.all([callLLM(prompt), minLoading]);
        const questions = parseAIQuestions(content);

        if (questions.length === 0) throw new Error('未生成任何题目');

        aiGeneratedQuestions = questions;
        questions.forEach(q => { aiAnswerState[q.id] = { selected: -1, answered: false }; });
        renderAIBody({ type: 'success', questions });
    } catch (e) {
        await minLoading;
        console.error('AI 出题失败:', e);
        renderAIBody({ type: 'error', message: e.message || '未知错误' });
    }
}

// ========== 渲染 AI 弹窗内容 ==========
function renderAIBody(state) {
    const body = $('aiBody');
    if (!body) return;

    if (state.type === 'no-config') {
        body.innerHTML = `
            <div class="ai-empty">
                <div class="ai-empty-icon"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span></div>
                <p class="ai-empty-title">尚未配置 AI</p>
                <p class="ai-empty-hint">请先填写 API 地址、Key 和模型名，再开始出题</p>
                <button class="practice-quiz-btn practice-quiz-btn-primary" style="max-width:200px;margin:12px auto 0" onclick="openAISettings()"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span> 立即配置</button>
            </div>
        `;
        return;
    }

    if (state.type === 'loading') {
        body.innerHTML = `
            <div class="ai-loading">
                <div class="ai-spinner"></div>
                <p>AI 正在为你举一反三…</p>
                <p class="ai-loading-hint">基于「${escapeHtml(aiCurrentMistake?.title || '').slice(0, 30)}」生成变式题</p>
            </div>
        `;
        return;
    }

    if (state.type === 'error') {
        body.innerHTML = `
            <div class="ai-empty">
                <div class="ai-empty-icon"><span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span></div>
                <p class="ai-empty-title">出题失败</p>
                <p class="ai-empty-hint">${escapeHtml(state.message)}</p>
                <div class="ai-empty-actions">
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="closeAIModal()">关闭</button>
                    <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="generateAIQuestions()">重试</button>
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="openAISettings()"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span> 配置</button>
                </div>
            </div>
        `;
        return;
    }

    if (state.type === 'success') {
        const cardsHtml = state.questions.map(q => renderAIQuestionCard(q)).join('');
        body.innerHTML = `
            <div class="ai-summary">
                <span><span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 已生成 ${state.questions.length} 道变式题</span>
                <button class="ai-link-btn" onclick="generateAIQuestions()"><span class="ico" data-ico="refresh-cw"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span> 再来一轮</button>
            </div>
            <div class="ai-question-list">${cardsHtml}</div>
            <div class="ai-batch-actions">
                <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="addAllAIToPractice()"><span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 全部加入练习库</button>
            </div>
        `;
    }
}

function renderAIQuestionCard(q) {
    const stars = '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(q.difficulty) + '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(3 - q.difficulty);
    const state = aiAnswerState[q.id] || { selected: -1, answered: false };
    const isCode = q.type === 'code';

    const optionsHtml = q.options.map((opt, idx) => {
        let cls = 'practice-quiz-option' + (isCode ? ' ai-code-option' : '');
        if (state.answered) {
            if (idx === q.answer) cls += ' correct-answer';
            else if (idx === state.selected) cls += ' wrong-answer';
        } else if (idx === state.selected) {
            cls += ' selected';
        }
        const optInner = isCode
            ? `<code>${escapeHtml(opt)}</code>`
            : escapeHtml(opt);
        return `<button class="${cls}" onclick="selectAIOption('${q.id}', ${idx})">${String.fromCharCode(65 + idx)}. ${optInner}</button>`;
    }).join('');

    let explanationHtml = '';
    if (state.answered) {
        const correctOpt = isCode
            ? `<code>${escapeHtml(q.options[q.answer])}</code>`
            : escapeHtml(q.options[q.answer]);
        const mnemonicHtml = q.mnemonic
            ? `<div class="ai-mnemonic"><span class="ico" data-ico="brain"><svg viewBox="0 0 24 24"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg></span> 易错口诀：${escapeHtml(q.mnemonic)}</div>`
            : '';
        explanationHtml = `
            <div class="practice-quiz-explanation">
                <div class="practice-quiz-explanation-title">${state.selected === q.answer ? '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 回答正确' : '<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 回答错误'}</div>
                <div>正确答案：${String.fromCharCode(65 + q.answer)}. ${correctOpt}</div>
                <div style="margin-top:6px;"><span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> ${escapeHtml(q.explanation || '')}</div>
                ${mnemonicHtml}
            </div>
        `;
    }

    let actionsHtml = '';
    if (state.answered) {
        actionsHtml = `
            <div class="ai-card-actions">
                <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="addAIToPractice('${q.id}')"><span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 加入练习库</button>
                <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="addAIToMistake('${q.id}')"><span class="ico" data-ico="pencil-line"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span> 加入错题本</button>
            </div>
        `;
    } else {
        actionsHtml = `
            <div class="ai-card-actions">
                <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="submitAIAnswer('${q.id}')" ${state.selected < 0 ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>提交答案</button>
            </div>
        `;
    }

    const typeBadge = isCode
        ? '<span class="ai-type-badge code">代码题</span>'
        : '<span class="ai-type-badge">概念题</span>';

    return `
        <div class="ai-question-card" data-qid="${q.id}">
            <div class="ai-card-meta">
                <span class="practice-card-category">${escapeHtml(q.topic || '综合')}</span>
                ${typeBadge}
                <span class="practice-card-difficulty">${stars}</span>
            </div>
            <div class="ai-card-question">${renderAIQuestionText(q.question)}</div>
            <div class="practice-quiz-options">${optionsHtml}</div>
            ${explanationHtml}
            ${actionsHtml}
        </div>
    `;
}

// 渲染题干：支持三反引号代码块（带语言标签），其余按纯文本+换行
function renderAIQuestionText(text) {
    if (!text) return '';
    const parts = text.split(/```(\w*)\r?\n([\s\S]*?)```/g);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
        if (i % 3 === 0) {
            const t = parts[i];
            if (t) html += '<span class="ai-q-text">' + escapeHtml(t).replace(/\n/g, '<br>') + '</span>';
        } else if (i % 3 === 2) {
            const lang = (parts[i - 1] || '').trim();
            const code = parts[i].replace(/\n$/, '');
            let codeHtml;
            try {
                codeHtml = lang && hljs.getLanguage(lang)
                    ? hljs.highlight(code, { language: lang }).value
                    : hljs.highlightAuto(code).value;
            } catch (e) {
                codeHtml = escapeHtml(code);
            }
            html += `<pre class="ai-q-code"><code class="hljs">${codeHtml}</code></pre>`;
        }
    }
    return html;
}

// ========== 答题交互 ==========
function selectAIOption(qid, idx) {
    const state = aiAnswerState[qid];
    if (!state || state.answered) return;
    state.selected = idx;
    refreshAICard(qid);
}

function submitAIAnswer(qid) {
    const state = aiAnswerState[qid];
    const q = aiGeneratedQuestions.find(x => x.id === qid);
    if (!state || !q || state.answered) return;
    if (state.selected < 0) { showToast('请先选择一个答案'); return; }

    state.answered = true;
    refreshAICard(qid);
    showToast(state.selected === q.answer ? '回答正确！' : '回答错误，看下解析');
}

// 局部刷新单张题卡，避免滚动跳回顶部
function refreshAICard(qid) {
    const q = aiGeneratedQuestions.find(x => x.id === qid);
    if (!q) return;
    const wrapper = document.querySelector(`.ai-question-card[data-qid="${qid}"]`);
    // 找不到容器则全量刷新
    if (wrapper) {
        const newHtml = renderAIQuestionCard(q);
        const tmp = document.createElement('div');
        tmp.innerHTML = newHtml;
        wrapper.replaceWith(tmp.firstElementChild);
    } else {
        const list = document.querySelector('.ai-question-list');
        if (list) {
            list.innerHTML = aiGeneratedQuestions.map(renderAIQuestionCard).join('');
        }
    }
}

// ========== 把生成的题加入练习库 / 错题本 ==========
function addAIToPractice(qid) {
    const q = aiGeneratedQuestions.find(x => x.id === qid);
    if (!q) return;
    saveAIQuestion(q);
    showToast('已加入练习库（AI变式分类）');
}

function addAllAIToPractice() {
    if (aiGeneratedQuestions.length === 0) return;
    aiGeneratedQuestions.forEach(saveAIQuestion);
    showToast(`已批量加入 ${aiGeneratedQuestions.length} 道到练习库`);
}

function addAIToMistake(qid) {
    const q = aiGeneratedQuestions.find(x => x.id === qid);
    if (!q) return;
    const newMistake = {
        id: generateId(),
        title: '【AI变式】' + (q.topic || '综合') + ' - ' + (q.question || '').slice(0, 20),
        lang: (aiCurrentMistake && aiCurrentMistake.lang) || 'javascript',
        desc: q.question,
        wrongCode: '',
        rightCode: '',
        tags: [q.topic || 'AI变式', '举一反三'],
        note: `正确答案：${String.fromCharCode(65 + q.answer)}. ${q.options[q.answer]}\n解析：${q.explanation || ''}${q.mnemonic ? '\n<span class="ico" data-ico="brain"><svg viewBox="0 0 24 24"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg></span> 口诀：' + q.mnemonic : ''}`,
        source: 'AI出题',
        image: null,
        status: 'pending',
        reviewCount: 0,
        lastReviewAt: Date.now(),
        createdAt: Date.now()
    };
    mistakes.push(newMistake);
    saveData();
    showToast('已加入错题本');
}

/* ========================================
 * AI 错题诊断模块 - 分析错误原因并给出修正
 * ======================================== */

let aiDiagnoseMistake = null;   // 当前待诊断的错题
let aiDiagResult = null;        // 诊断结果 { summary, cause, correctCode, explanation, tips[], lang }

function openAIDiagnosis(mistakeId) {
    const m = mistakes.find(x => x.id === mistakeId);
    if (!m) { showToast('错题不存在'); return; }

    const hasCode = (m.wrongCode || m.rightCode || '').trim();
    if (!hasCode) { showToast('该错题没有代码，无法诊断'); return; }

    aiDiagnoseMistake = m;
    aiDiagResult = null;

    $('aiModalTitle').textContent = '<span class="ico" data-ico="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span> AI 诊断 · ' + (m.title || '').slice(0, 16);
    $('aiModal').style.display = 'flex';

    if (!aiConfig.apiKey || !aiConfig.baseURL || !aiConfig.model) {
        renderDiagnosisBody({ type: 'no-config' });
    } else {
        runAIDiagnosis();
    }
}

function buildDiagnosisPrompt(m) {
    const langName = getLangName(m.lang);
    const tags = (m.tags || []).join('、') || '综合';
    const wrongCode = (m.wrongCode || '').trim() || '//（未提供错误代码）';
    const rightCode = (m.rightCode || '').trim() || '//（未提供正确代码）';
    const desc = (m.desc || '').trim() || '（未描述问题现象）';

    return `# 角色
你是一位资深的编程教学与代码审查专家，擅长用通俗、准确的语言帮助学生理解代码错误。

# 任务
针对下面这道编程学习者的错题，做一次"错题诊断"。诊断要一针见血指出根因，并给出可立即生效的修正方案。禁止复述题目，直接给结论。

# 错题信息
- 标题：${m.title || '未命名'}
- 语言：${langName}
- 考点标签：${tags}
- 问题描述：${desc}

错误代码：
\`\`\`${m.lang || 'text'}
${wrongCode}
\`\`\`

正确代码：
\`\`\`${m.lang || 'text'}
${rightCode}
\`\`\`

# 输出要求
只输出单个严格 JSON 对象，不要输出其他任何内容。结构如下：
{
  "summary": "一句话概括这道错题犯了什么(不超过25字)",
  "cause": "错误的根本原因，讲清楚为什么(2-4句，控制在100字内)",
  "correctCode": "修正后的完整正确代码(纯代码，不要代码块标记，若原题有正确代码则以它为准并保持完整)",
  "explanation": "给学生的讲解：正确代码相对错误代码改了什么、为什么这么改(80字内)",
  "tips": ["易错口诀或要点1", "要点2", "要点3"],
  "lang": "${m.lang || 'text'}"
}

约束：
- correctCode 必须是完整的、可直接运行的代码，不要省略、不要用注释代替
- tips 3 条，每条不超过 20 字，考场能默念
- summary 和 explanation 不得照抄题目描述
- 字符串禁止使用 \\n 之外的转义符，禁止嵌套 JSON`;
}

async function runAIDiagnosis() {
    if (!aiDiagnoseMistake) return;
    renderDiagnosisBody({ type: 'loading' });

    const minLoading = new Promise(r => setTimeout(r, 800));
    try {
        const prompt = buildDiagnosisPrompt(aiDiagnoseMistake);
        const [content] = await Promise.all([callLLM(prompt), minLoading]);
        const result = parseDiagnosisJSON(content, aiDiagnoseMistake);
        aiDiagResult = result;
        renderDiagnosisBody({ type: 'success', result });
    } catch (e) {
        await minLoading;
        console.error('AI 诊断失败:', e);
        renderDiagnosisBody({ type: 'error', message: e.message || '未知错误' });
    }
}

function parseDiagnosisJSON(content, m) {
    let text = String(content || '').trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    const o = JSON.parse(text);
    return {
        summary: String(o.summary || '错误分析').slice(0, 50),
        cause: String(o.cause || '未能提取原因，请结合代码自行判断').slice(0, 500),
        correctCode: String(o.correctCode || m.rightCode || m.wrongCode || ''),
        explanation: String(o.explanation || '').slice(0, 300),
        tips: Array.isArray(o.tips) ? o.tips.map(String).slice(0, 3) : [],
        lang: String(o.lang || m.lang || 'text')
    };
}

function renderDiagnosisBody(state) {
    const body = $('aiBody');
    if (!body) return;

    if (state.type === 'no-config') {
        body.innerHTML = `
            <div class="ai-empty">
                <div class="ai-empty-icon"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span></div>
                <p class="ai-empty-title">尚未配置 AI</p>
                <p class="ai-empty-hint">请先填写 API 地址、Key 和模型名，再进行错题诊断</p>
                <button class="practice-quiz-btn practice-quiz-btn-primary" style="max-width:200px;margin:12px auto 0" onclick="openAISettings()"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span> 立即配置</button>
            </div>
        `;
        return;
    }

    if (state.type === 'loading') {
        body.innerHTML = `
            <div class="ai-loading">
                <div class="ai-spinner"></div>
                <p>AI 正在诊断代码错误…</p>
                <p class="ai-loading-hint">基于「${escapeHtml(aiDiagnoseMistake?.title || '').slice(0, 24)}」分析根因</p>
            </div>
        `;
        return;
    }

    if (state.type === 'error') {
        body.innerHTML = `
            <div class="ai-empty">
                <div class="ai-empty-icon"><span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span></div>
                <p class="ai-empty-title">诊断失败</p>
                <p class="ai-empty-hint">${escapeHtml(state.message)}</p>
                <div class="ai-empty-actions">
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="closeAIModal()">关闭</button>
                    <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="runAIDiagnosis()">重试</button>
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="openAISettings()"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span> 配置</button>
                </div>
            </div>
        `;
        return;
    }

    if (state.type === 'success') {
        const r = state.result;
        const lang = hljs.getLanguage(r.lang) ? r.lang : 'text';
        let correctHtml;
        try {
            correctHtml = r?.correctCode ? hljs.highlight(r.correctCode, { language: lang }).value : blankNote;
        } catch (e) {
            correctHtml = r?.correctCode ? escapeHtml(r.correctCode) : '';
        }
        const tipsHtml = (r.tips || []).length
            ? `<div class="diag-tips"><div class="diag-label"><span class="ico" data-ico="brain"><svg viewBox="0 0 24 24"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg></span> 易错口诀</div><ul>${r.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>`
            : '';
        body.innerHTML = `
            <div class="diag-container">
                <div class="diag-summary">${escapeHtml(r.summary)}</div>
                <div class="diag-block">
                    <div class="diag-label"><span class="ico" data-ico="bomb"><svg viewBox="0 0 24 24"><circle cx="11" cy="13" r="8"/><path d="M19 5l-1.5 1.5"/><path d="M22 4l-1 1"/><path d="M18 2l-1 1"/></svg></span> 错误原因</div>
                    <div class="diag-cause">${escapeHtml(r.cause).replace(/\n/g, '<br>')}</div>
                </div>
                <div class="diag-block">
                    <div class="diag-label"><span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 修正后的代码</div>
                    <pre class="diag-code"><code class="hljs language-${escapeHtml(lang)}">${correctHtml}</code></pre>
                </div>
                ${r.explanation ? `<div class="diag-block"><div class="diag-label"><span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> 讲解</div><div class="diag-explain">${escapeHtml(r.explanation).replace(/\n/g, '<br>')}</div></div>` : ''}
                ${tipsHtml}
                <div class="diag-actions">
                    <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="applyDiagnosis()"><span class="ico" data-ico="pencil-line"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span> 应用到错题</button>
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="speakDiagnosis()"><span class="ico" data-ico="volume-2"><svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></span> 播放讲解</button>
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="stopDiagnosisSpeech()">⏹ 停止</button>
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="closeAIModal()">完成</button>
                </div>
            </div>
        `;
    }
}

// 一键把诊断结果写回错题（正确代码 / 笔记 / 标签 / 描述补全）
function applyDiagnosis() {
    if (!aiDiagnoseMistake || !aiDiagResult) return;
    const m = aiDiagnoseMistake;
    const r = aiDiagResult;

    if (r.correctCode && !m.rightCode) m.rightCode = r.correctCode;
    // 笔记追加诊断结论
    const diagNote = `<span class="ico" data-ico="brain"><svg viewBox="0 0 24 24"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/></svg></span> ${r.summary}\n<span class="ico" data-ico="bomb"><svg viewBox="0 0 24 24"><circle cx="11" cy="13" r="8"/><path d="M19 5l-1.5 1.5"/><path d="M22 4l-1 1"/><path d="M18 2l-1 1"/></svg></span> ${r.cause}\n<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> ${r.explanation}` + (r.tips?.length ? '\n<span class="ico" data-ico="key"><svg viewBox="0 0 24 24"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg></span> ' + r.tips.join('；') : '');
    m.note = m.note ? m.note + '\n\n---\n【AI 诊断】\n' + diagNote : diagNote;
    if (r.tips?.length) {
        const set = new Set((m.tags || []).concat(r.tips));
        m.tags = [...set].slice(0, 6);
    }

    saveData();
    showToast('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 诊断结果已保存到错题');
    renderDetail(m);
    closeAIModal();
}

// ========== AI 诊断语音播报（TTS）==========
function speakDiagnosis() {
    if (!('speechSynthesis' in window)) { showToast('当前浏览器不支持语音播报'); return; }
    const r = aiDiagResult;
    if (!r) { showToast('暂无诊断结果可播报'); return; }

    speechSynthesis.cancel();
    const text = [
        r.summary,
        '错误原因：' + r.cause,
        r.explanation ? '讲解：' + r.explanation : '',
        r.tips && r.tips.length ? '易错口诀：' + r.tips.join('，') : ''
    ].filter(Boolean).join('。');

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1;
    // 尽量选用中文语音
    const zhVoice = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('zh'));
    if (zhVoice) u.voice = zhVoice;
    speechSynthesis.speak(u);
    showToast('<span class="ico" data-ico="volume-2"><svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></span> 正在播报讲解...');
}

function stopDiagnosisSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// ========== AI 复习计划：按薄弱考点生成本周复习清单 ==========
function renderReviewPlan() {
    const body = $('reviewPlanBody');
    if (!body) return;

    // 待复习错题
    const pending = mistakes.filter(m => m.status !== 'mastered');

    if (!pending.length) {
        body.innerHTML = `
            <div class="ai-empty" style="padding:12px 0">
                <div class="ai-empty-icon"><span class="ico" data-ico="sparkles"><svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg></span></div>
                <p class="ai-empty-title">全部掌握，无需复习</p>
                <p class="ai-empty-hint">本周计划为空，继续保持！</p>
            </div>
        `;
        return;
    }

    // 弱点权重：按未掌握错题的标签统计
    const tagWeight = {};
    pending.forEach(m => (m.tags || []).forEach(t => { tagWeight[t] = (tagWeight[t] || 0) + 1; }));

    // 排序：弱点权重高优先，其次最后复习时间最久优先
    const sorted = [...pending].sort((a, b) => {
        const wa = (a.tags || []).reduce((s, t) => s + (tagWeight[t] || 0), 0);
        const wb = (b.tags || []).reduce((s, t) => s + (tagWeight[t] || 0), 0);
        if (wb !== wa) return wb - wa;
        return (a.lastReviewAt || 0) - (b.lastReviewAt || 0);
    });

    // 本周日期（周一起）
    const today = new Date();
    const monday = new Date(today);
    const dow = (today.getDay() + 6) % 7; // 周一=0
    monday.setDate(today.getDate() - dow);
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    // 生成 7 天计划，循环分配
    const plan = Array.from({ length: 7 }, () => []);
    sorted.forEach((m, i) => plan[i % 7].push(m));

    const rows = plan.map((items, dayIdx) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + dayIdx);
        const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
        const isToday = dayIdx === dow;
        const n = items.length;
        return `
            <div class="review-plan-day ${isToday ? 'is-today' : ''}">
                <div class="review-plan-day-head">
                    <span class="review-plan-day-name">${dayNames[dayIdx]} ${dateLabel}</span>
                    ${isToday ? '<span class="review-plan-today-tag">今天</span>' : ''}
                    <span class="review-plan-count">${n ? n + ' 题' : '休息'}</span>
                </div>
                ${n ? `<div class="review-plan-items">${items.map(m => `
                    <div class="review-plan-item" onclick="openMistake('${m.id}')">
                        <span class="review-plan-item-tag ${escapeHtml(m.tags?.[0] || '')}">${escapeHtml(m.tags?.[0] || '综合')}</span>
                        <span class="review-plan-item-title">${escapeHtml(m.title || '未命名')}</span>
                    </div>
                `).join('')}</div>` : '<div class="review-plan-rest">无安排，好好休息 <span class="ico" data-ico="tree-palm"><svg viewBox="0 0 24 24"><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3.5z"/><path d="m5.89 10.17 3.24 7.41"/><path d="m17.16 10.17-3.24 7.41"/><path d="M11.25 17.58h5.5"/></svg></span></div>'}
            </div>
        `;
    }).join('');

    body.innerHTML = `
        <div class="review-plan-tip">共 ${sorted.length} 道待复习错题，按薄弱考点智能排入本周</div>
        ${rows}
    `;
}

// ========== AI 编程伙伴对话 ==========
let chatMistake = null;   // 当前对话的错题
let chatHistory = [];     // 保存消息格式为 { role, content }

function openAIChat(mistakeId) {
    const m = mistakes.find(x => x.id === mistakeId);
    if (!m) { showToast('错题不存在'); return; }
    chatMistake = m;
    chatHistory = [];
    $('chatModalTitle').textContent = '<span class="ico" data-ico="message-circle"><svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg></span> AI 对话 · ' + (m.title || '').slice(0, 16);
    $('chatModal').style.display = 'flex';
    renderChatBody();

    if (!aiConfig.apiKey || !aiConfig.baseURL || !aiConfig.model) {
        // 未配置，展示引导
        const body = $('chatBody');
        body.innerHTML = `
            <div class="ai-empty">
                <div class="ai-empty-icon"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span></div>
                <p class="ai-empty-title">尚未配置 AI</p>
                <p class="ai-empty-hint">请先填写 API 地址、Key 和模型名，再与 AI 对话</p>
                <button class="practice-quiz-btn practice-quiz-btn-primary" style="max-width:200px;margin:12px auto 0" onclick="openAISettings()"><span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span> 立即配置</button>
            </div>
        `;
        return;
    }
    addChatMsg('assistant', '你好！我是你的编程伙伴 <span class="ico" data-ico="hand"><svg viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg></span> 我会结合这道错题帮你答疑。直接提问即可，例如：「为什么我的代码会越界？」');
}

function closeAIChat() {
    $('chatModal').style.display = 'none';
}
function renderChatBody() {
    const body = $('chatBody');
    // 保留首条引导语或清空
    body.innerHTML = '';
    addChatMsg('assistant', '把你这道错题的疑问发给我吧，我会结合它来分析。');
}

function addChatMsg(role, content) {
    const body = $('chatBody');
    if (!body) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (role === 'user' ? 'chat-msg-user' : 'chat-msg-assistant');
    const text = document.createElement('div');
    text.className = 'chat-bubble';
    text.innerHTML = role === 'assistant' ? renderMarkdown(content || '') : escapeHtml(content);
    wrap.appendChild(text);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
}

// 对话用：不强制 JSON 输出
async function callLLMChat(messages) {
    const url = aiConfig.baseURL.replace(/\/+$/, '') + '/chat/completions';
    const body = {
        model: aiConfig.model,
        messages: messages,
        temperature: 0.7
    };
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aiConfig.apiKey },
        body: JSON.stringify(body)
    });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error('HTTP ' + resp.status + (text ? (': ' + text.slice(0, 200)) : ''));
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM 返回为空');
    return content;
}

async function sendChatMessage() {
    if (!chatMistake) return;
    const input = $('chatInput');
    const text = (input.value || '').trim();
    if (!text) return;

    addChatMsg('user', text);
    input.value = '';
    input.style.height = 'auto';

    if (!aiConfig.apiKey || !aiConfig.baseURL || !aiConfig.model) {
        addChatMsg('assistant', '<span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span> 尚未配置 AI，请点击右上角/引导按钮先完成配置再继续对话。');
        return;
    }

    chatHistory.push({ role: 'user', content: text });

    // 注入错题上下文
    const ctx = chatMistake;
    const contextMsg = {
        role: 'system',
        content: `你是用户学习编程的 AI 伙伴，请结合这道错题耐心解答。问题尽量通俗、给出关键代码示例。
错题标题：${ctx.title || ''}
语言：${getLangName(ctx.lang)}
标签：${(ctx.tags || []).join('、') || '无'}
错误代码：
${ctx.wrongCode || '（无）'}
正确代码：
${ctx.rightCode || '（无）'}
错误分析：
${ctx.note || '（无）'}`
    };

    // 显示"思考中"
    const pendingEl = document.createElement('div');
    pendingEl.className = 'chat-msg chat-msg-assistant';
    pendingEl.innerHTML = '<div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>';
    $('chatBody').appendChild(pendingEl);
    $('chatBody').scrollTop = $('chatBody').scrollHeight;

    // 限制上下文长度
    const history = [...chatHistory].slice(-8);
    const messages = [contextMsg, ...history];

    try {
        const reply = await callLLMChat(messages);
        pendingEl.remove();
        chatHistory.push({ role: 'assistant', content: reply });
        addChatMsg('assistant', reply);
        // 对话计数（成就统计）
        try {
            localStorage.setItem('code_chat_count_v1', String(parseInt(localStorage.getItem('code_chat_count_v1') || '0', 10) + 1));
        } catch (e) {}
        checkAchievements(true);
    } catch (e) {
        pendingEl.remove();
        console.error('AI 对话失败:', e);
        addChatMsg('assistant', '<span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span> 对话失败：' + (e.message || '未知错误') + '。请检查网络或配置后重试。');
    }
}

// ========== 数据管理：PDF 导出 / JSON 备份恢复 ==========
function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildLaTeXEsc(s) {
    return String(s || '').replace(/([\\{}&%_#^$])/g, '\\$1');
}

function exportDataPDF() {
    if (!mistakes.length) { showToast('暂无错题可导出'); return; }

    const items = [...mistakes].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const now = formatDate(Date.now());

    // 每条错题转成文本
    const blocks = items.map((m, i) => {
        const lines = [];
        lines.push(`错题 ${i + 1}：${m.title || '未命名'}`);
        lines.push(`语言：${getLangName(m.lang)}    状态：${m.status === 'mastered' ? '已掌握' : '待复习'}`);
        if (m.tags && m.tags.length) lines.push(`考点：${m.tags.join('、')}`);
        lines.push('');
        if (m.wrongCode) { lines.push('【错误代码】'); lines.push(m.wrongCode); lines.push(''); }
        if (m.rightCode) { lines.push('【正确代码】'); lines.push(m.rightCode); lines.push(''); }
        if (m.note) { lines.push('【错误分析】'); lines.push(m.note); lines.push(''); }
        return lines.join('\n');
    });

    const content = `代码错题集复习资料\n导出自：${now}（共 ${items.length} 道错题）\n${'='.repeat(40)}\n\n` + blocks.join('\n\n' + '='.repeat(40) + '\n\n');

    // 使用浏览器打印对话框生成 PDF
    const win = window.open('', '_blank');
    if (!win) { showToast('弹窗被拦截，请允许弹窗'); return; }
    win.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
        <title>代码错题集复习资料</title>
        <style>
            body { font-family: "PingFang SC","Microsoft YaHei",sans-serif; padding: 24px; color: #1d1d1f; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .meta { color: #86868b; font-size: 12px; margin-bottom: 16px; }
            .block { margin: 20px 0; page-break-inside: avoid; }
            .num { font-weight: bold; font-size: 16px; margin-bottom: 6px; color: #1d1d1f; }
            .info { font-size: 12px; color: #86868b; margin-bottom: 4px; }
            .lbl { font-weight: bold; font-size: 13px; margin: 6px 0 2px; color: #1d1d1f; }
            pre { background: #e8e8ed; border: 1px solid #e5e5ea; padding: 8px 10px; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
            .note { white-space: pre-wrap; font-size: 13px; }
            hr { border: none; border-top: 1px dashed #e5e5ea; margin: 16px 0; }
        </style>
    </head><body>
        <h1>代码错题集复习资料</h1>
        <div class="meta">导出自：${now} · 共 ${items.length} 道错题</div>
        ${items.map((m, i) => `
            <div class="block">
                <div class="num">错题 ${i + 1}：${buildLaTeXEsc(m.title || '未命名')}</div>
                <div class="info">语言：${getLangName(m.lang)} ｜ 状态：${m.status === 'mastered' ? '已掌握' : '待复习'}${m.tags && m.tags.length ? ' ｜ 考点：' + m.tags.join('、') : ''}</div>
                ${m.wrongCode ? `<div class="lbl"><span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 错误代码</div><pre>${buildLaTeXEsc(m.wrongCode)}</pre>` : ''}
                ${m.rightCode ? `<div class="lbl"><span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 正确代码</div><pre>${buildLaTeXEsc(m.rightCode)}</pre>` : ''}
                ${m.note ? `<div class="lbl"><span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> 错误分析</div><div class="note">${buildLaTeXEsc(m.note)}</div>` : ''}
            </div>
        `).join('<hr>')}
    </body></html>`);
    win.document.close();
    // 等图片/字体渲染后调打印
    setTimeout(() => { win.focus(); win.print(); }, 400);
}

function exportBackup() {
    if (!mistakes.length) { showToast('暂无数据可备份'); return; }
    const payload = {
        app: 'code-mistake-book',
        version: 1,
        exportedAt: Date.now(),
        mistakes: mistakes
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `错题集备份_${formatDate(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 已导出备份文件');
}

function importBackup(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            const list = Array.isArray(data) ? data : (Array.isArray(data.mistakes) ? data.mistakes : null);
            if (!list) throw new Error('格式不正确');
            const valid = list.filter(m => m && typeof m === 'object' && (m.title || m.wrongCode || m.rightCode || m.note));
            if (!valid.length) throw new Error('没有有效的错题记录');

            if (!confirm(`将用备份文件中的 ${valid.length} 道错题替换当前数据（当前 ${mistakes.length} 道），是否继续？`)) {
                input.value = '';
                return;
            }
            mistakes = valid;
            saveData();
            // 尝试一并恢复积分与打卡
            if (data && typeof data === 'object' && data.points !== undefined) {
                try { localStorage.setItem(POINTS_KEY, String(data.points)); userPoints = data.points; } catch (err) {}
            }
            renderPoints();
            renderMistakeList();
            showToast('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 恢复成功，数据已更新');
        } catch (err) {
            console.error('恢复失败:', err);
            showToast('<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 备份文件无效');
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

/* ========================================
 * Shape Waves 头部动画背景
 *   灵感来自 reactbits.dev/backgrounds/shape-waves
 *   纯 Canvas 2D 实现，不依赖 WebGPU
 * ======================================== */
function initShapeWaves() {
    const canvas = document.getElementById('headerCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const header = canvas.parentElement;

    // 根据主题获取配色
    function getColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            return {
                bg: '#0a84ff',
                shapes: ['#64b5ff', '#a8d4ff', '#ffffff'],
            };
        }
        return {
            bg: '#0071e3',
            shapes: ['#42a1ff', '#8ec5ff', '#ffffff'],
        };
    }

    let cols = 0, rows = 0;
    const cellSize = 14;       // 网格单元大小
    let shapes = [];          // 每个单元的形状类型 0=三角 1=圆 2=方
    let time = 0;
    let rafId = null;
    let running = true;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = header.offsetWidth;
        const h = header.offsetHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cols = Math.ceil(w / cellSize) + 1;
        rows = Math.ceil(h / cellSize) + 1;
        shapes = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                row.push((c + r) % 3); // 交替分配形状
            }
            shapes.push(row);
        }
    }

    function drawShape(x, y, size, type, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.translate(x, y);
        if (type === 0) {
            // 三角形
            ctx.beginPath();
            ctx.moveTo(0, -size / 2);
            ctx.lineTo(size / 2, size / 2);
            ctx.lineTo(-size / 2, size / 2);
            ctx.closePath();
            ctx.fill();
        } else if (type === 1) {
            // 圆形
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 方形
            ctx.fillRect(-size / 2, -size / 2, size, size);
        }
        ctx.restore();
    }

    function frame() {
        if (!running) return;
        const { shapes: shapeColors } = getColors();
        const w = header.offsetWidth;
        const h = header.offsetHeight;
        ctx.clearRect(0, 0, w, h);

        time += 0.012;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = c * cellSize + cellSize / 2;
                const y = r * cellSize + cellSize / 2;
                // 波浪：基于位置和时间的正弦叠加
                const wave = Math.sin(c * 0.25 + time) * 0.5 + Math.sin(r * 0.3 - time * 1.3) * 0.5;
                const band = (wave + 1) / 2; // 0~1
                const size = cellSize * (0.2 + band * 0.55);
                const colorIdx = Math.min(2, Math.floor(band * 3));
                const alpha = 0.15 + band * 0.5;
                drawShape(x, y, size, shapes[r][c], shapeColors[colorIdx], alpha);
            }
        }
        rafId = requestAnimationFrame(frame);
    }

    resize();
    frame();

    // 响应窗口尺寸与主题变化
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    // 页面隐藏时暂停，节省性能
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            running = false;
            cancelAnimationFrame(rafId);
        } else {
            running = true;
            frame();
        }
    });
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);

/* ========================================
 * 浏览器内运行代码模块
 *   - JS：受限 eval 沙箱，捕获 console.log / error
 *   - Python：动态加载 Pyodide CDN 后运行
 * ======================================== */

const RUNNABLE_LANGS = ['javascript', 'js', 'python', 'py'];
let pyodidePromise = null;   // 复用 Pyodide 加载 Promise

function isRunnableLang(lang) {
    if (!lang) return false;
    return RUNNABLE_LANGS.includes(String(lang).toLowerCase());
}

function getLangKey(lang) {
    const l = String(lang || '').toLowerCase();
    if (l === 'js') return 'javascript';
    if (l === 'py') return 'python';
    return l;
}

// 主入口
async function runMistakeCode(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m || !m.rightCode) { showToast('没有可运行的代码'); return; }

    const lang = getLangKey(m.lang);
    const outEl = $('output-' + id);
    const btn = $('runBtn-' + id);
    if (!outEl) return;

    // 进入运行中态
    outEl.style.display = 'block';
    outEl.className = 'code-output loading';
    outEl.innerHTML = '<span class="run-spinner"></span> 运行中…';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 运行中'; }

    try {
        let result;
        if (lang === 'javascript') {
            result = runJS(m.rightCode);
        } else if (lang === 'python') {
            result = await runPython(m.rightCode);
        } else {
            throw new Error('暂不支持运行 ' + m.lang + ' 代码');
        }
        showRunOutput(outEl, result, btn);
    } catch (e) {
        outEl.className = 'code-output error';
        outEl.innerHTML = '<div class="run-line run-err"><span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 运行失败：' + escapeHtml(e.message || String(e)) + '</div>';
        if (btn) { btn.disabled = false; btn.textContent = '▶ 运行'; }
    }
}

function showRunOutput(outEl, result, btn) {
    outEl.className = 'code-output' + (result.hasError ? ' error' : '');
    let html = '<div class="run-out-title">' + (result.hasError ? '<span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span> 输出（含错误）' : '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 输出') + '</div>';
    if (result.stdout) {
        html += '<pre class="run-stdout">' + escapeHtml(result.stdout) + '</pre>';
    }
    if (result.stderr) {
        html += '<pre class="run-stderr">' + escapeHtml(result.stderr) + '</pre>';
    }
    if (!result.stdout && !result.stderr && !result.hasError) {
        html += '<div class="run-empty">（程序没有输出）</div>';
    }
    outEl.innerHTML = html;
    if (btn) { btn.disabled = false; btn.textContent = '▶ 运行'; }
}

// ========== JavaScript：受限 eval 沙箱 ==========
function runJS(code) {
    const logs = [];
    const errBuf = [];

    // 构造一个假 console，捕获所有 log/info/warn/error
    const fakeConsole = {};
    ['log', 'info', 'warn', 'error'].forEach(level => {
        fakeConsole[level] = (...args) => {
            logs.push(args.map(fmtArg).join(' '));
        };
    });

    const stdout = [];
    const fakeStdout = {
        write: (s) => { stdout.push(String(s)); }
    };

    // 受限的全局对象：仅暴露必要 API，禁用 fetch/eval/Function/LocalStorage 等
    const sandbox = {
        console: fakeConsole,
        process: { stdout: fakeStdout, stderr: { write: s => errBuf.push(String(s)) } },
        Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Map, Set, WeakMap, WeakSet, Promise, Symbol, BigInt, Error, TypeError, RangeError, SyntaxError, Reflect, Proxy, structuredClone: (typeof structuredClone === 'function') ? structuredClone : undefined,
        setTimeout: (cb, t) => setTimeout(cb, Math.min(t || 0, 1000)),
        parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    };
    // 删掉未定义字段
    Object.keys(sandbox).forEach(k => { if (sandbox[k] === undefined) delete sandbox[k]; });

    let hasError = false;
    let stderr = '';

    try {
        // 用 Function 构造隔离作用域，避免污染全局；this 指向 sandbox
        // eslint-disable-next-line no-new-func
        const fn = new Function('console', 'process', 'Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'BigInt', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Reflect', 'Proxy', 'structuredClone', 'setTimeout', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
            '"use strict";\n' + code);
        fn.apply(sandbox, Object.values(sandbox));
    } catch (e) {
        hasError = true;
        stderr = (e && e.stack) ? (e.name + ': ' + e.message + '\n' + e.stack) : String(e);
    }

    // 合并：console 输出 + stdout
    const stdoutText = [...logs, ...stdout].join('\n') + (logs.length && stdout.length ? '\n' : '');
    return {
        stdout: stdoutText,
        stderr: stderr || errBuf.join(''),
        hasError
    };
}

function fmtArg(a) {
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    if (typeof a === 'string') return a;
    try {
        if (typeof a === 'object' && a && a.constructor && a.constructor.name === 'Error') return a.toString();
        return JSON.stringify(a, null, 2);
    } catch (e) {
        return String(a);
    }
}

// ========== Python：动态加载 Pyodide ==========
async function ensurePyodide() {
    if (pyodidePromise) return pyodidePromise;

    pyodidePromise = (async () => {
        // 已加载？
        if (window.loadPyodide) {
            return await window.loadPyodide();
        }
        // 注入 CDN script（pyodide v0.26.2）
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Pyodide CDN 加载失败，请检查网络'));
            document.head.appendChild(s);
        });
        if (!window.loadPyodide) throw new Error('Pyodide 加载后未导出 loadPyodide');
        return await window.loadPyodide();
    })();

    // 失败时清掉 promise 让下次能重试
    try {
        return await pyodidePromise;
    } catch (e) {
        pyodidePromise = null;
        throw e;
    }
}

async function runPython(code) {
    const py = await ensurePyodide();

    // 重定向 stdout / stderr
    let stdout = '';
    let stderr = '';
    try {
        py.setStdout({ batched: s => { stdout += s + '\n'; } });
        py.setStderr({ batched: s => { stderr += s + '\n'; } });
    } catch (e) {
        // 老 API
    }

    let hasError = false;
    try {
        await py.runPythonAsync(code);
    } catch (e) {
        hasError = true;
        stderr = (stderr || '') + (e.message || String(e));
    }

    return { stdout, stderr, hasError };
}

/* ========================================
 * #14 暗黑模式 / 主题切换
 * ======================================== */
const THEME_KEY = 'code_theme_v1';

function applyTheme(theme) {
    const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
    const moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        $('themeToggleBtn').innerHTML = sun;
    } else {
        document.documentElement.removeAttribute('data-theme');
        $('themeToggleBtn').innerHTML = moon;
    }
}

function loadTheme() {
    let theme = 'light';
    try { theme = localStorage.getItem(THEME_KEY) || 'light'; } catch (e) {}
    applyTheme(theme);
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    showToast(next === 'dark' ? '<span class="ico" data-ico="moon"><svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></span> 已切换深色模式' : '<span class="ico" data-ico="sun"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg></span> 已切换浅色模式');
}

/* ========================================
 * #7 复习提醒（本机通知）
 * ======================================== */
const REMIND_KEY = 'code_reminder_v1';
let remindConfig = { enabled: false, time: '20:00', lastNotifiedDate: '' };

function loadRemindConfig() {
    try {
        const d = localStorage.getItem(REMIND_KEY);
        remindConfig = d ? { ...remindConfig, ...JSON.parse(d) } : remindConfig;
    } catch (e) {}
}

function saveRemindConfig() {
    try { localStorage.setItem(REMIND_KEY, JSON.stringify(remindConfig)); } catch (e) {}
}

function renderReminderUI() {
    const sw = $('reminderSwitch');
    const timeInput = $('reminderTime');
    if (!sw) return;
    sw.classList.toggle('on', !!remindConfig.enabled);
    timeInput.value = remindConfig.time || '20:00';
    const tip = $('reminderTip');
    if (tip) {
        if (remindConfig.enabled && 'Notification' in window && Notification.permission === 'granted') {
            tip.textContent = '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 已开启：每天 ' + (remindConfig.time || '20:00') + ' 若有待复习错题将提醒你。';
        } else if (remindConfig.enabled) {
            tip.textContent = '已开启，但浏览器尚未授权通知权限，请点击右侧开关重新开启并允许通知。';
        } else {
            tip.textContent = '开启后，每天指定时间若打开本应用且有待复习错题，会弹出通知提醒。';
        }
    }
}

function pendingReviewCount() {
    return mistakes.filter(m => getReviewStatus(m) === 'pending').length;
}

function toggleReminder() {
    if (!remindConfig.enabled) {
        // 尝试开启：先申请通知权限
        const doEnable = () => {
            remindConfig.enabled = true;
            saveRemindConfig();
            renderReminderUI();
            showToast('<span class="ico" data-ico="bell"><svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></span> 复习提醒已开启');
        };
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                doEnable();
            } else if (Notification.permission === 'denied') {
                alert('浏览器已拒绝通知权限。请在浏览器设置中允许本网站的通知后重试。');
                renderReminderUI();
            } else {
                Notification.requestPermission().then(p => {
                    if (p === 'granted') { doEnable(); }
                    else { showToast('未获得通知权限，提醒无法开启'); renderReminderUI(); }
                });
            }
        } else {
            showToast('当前浏览器不支持通知');
        }
    } else {
        remindConfig.enabled = false;
        saveRemindConfig();
        renderReminderUI();
        showToast('复习提醒已关闭');
    }
}

function sendLocalNotice(title, body) {
    try {
        const n = new Notification(title, {
            body: body,
            icon: './assets/icon.jpg',
            badge: './assets/icon.jpg',
            tag: 'review-reminder'
        });
        n.onclick = () => {
            window.focus();
            switchPage('pageReview');
            n.close();
        };
    } catch (e) {
        showToast(body, 3000);
    }
}

function checkDailyReminder() {
    if (!remindConfig.enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = pendingReviewCount();
    if (n === 0) return;
    const today = todayKey();
    if (remindConfig.lastNotifiedDate === today) return;
    const now = new Date();
    const [h, m] = (remindConfig.time || '20:00').split(':').map(Number);
    if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) return;
    remindConfig.lastNotifiedDate = today;
    saveRemindConfig();
    sendLocalNotice('<span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 复习时间到', `你有 ${n} 道错题待复习，快来巩固一下吧！`);
}

function sendTestReminder() {
    if ('Notification' in window && Notification.permission === 'granted') {
        sendLocalNotice('<span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 代码错题集', '这是一条测试提醒，提醒功能工作正常！');
        showToast('测试提醒已发送');
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
            if (p === 'granted') {
                sendLocalNotice('<span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 代码错题集', '这是一条测试提醒，提醒功能工作正常！');
                showToast('测试提醒已发送');
            } else {
                showToast('未获得通知权限');
            }
        });
    } else {
        showToast('当前浏览器不支持通知，无需提醒也能在复习页查看待复习列表', 3000);
    }
}

/* ========================================
 * #9 成就 / 勋章系统
 * ======================================== */
const ACH_KEY = 'code_achievements_v1';

const ACHIEVEMENTS = [
    { id: 'first_mistake', icon: '<span class="ico" data-ico="sprout"><svg viewBox="0 0 24 24"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg></span>', name: '初来乍到', desc: '记录第 1 道错题', check: c => c.total >= 1 },
    { id: 'ten_mistakes', icon: '<span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span>', name: '勤学苦练', desc: '错题总数达到 10', check: c => c.total >= 10 },
    { id: 'fifty_mistakes', icon: '<span class="ico" data-ico="package"><svg viewBox="0 0 24 24"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></span>', name: '错题仓库', desc: '错题总数达到 50', check: c => c.total >= 50 },
    { id: 'master_10', icon: '<span class="ico" data-ico="trophy"><svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg></span>', name: '融会贯通', desc: '掌握 10 道错题', check: c => c.mastered >= 10 },
    { id: 'master_50', icon: '<span class="ico" data-ico="crown"><svg viewBox="0 0 24 24"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg></span>', name: '独孤求败', desc: '掌握 50 道错题', check: c => c.mastered >= 50 },
    { id: 'streak_3', icon: '<span class="ico" data-ico="flame"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span>', name: '小试牛刀', desc: '连续打卡 3 天', check: c => c.streak >= 3 },
    { id: 'streak_7', icon: '<span class="ico" data-ico="zap"><svg viewBox="0 0 24 24"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></span>', name: '七日之火', desc: '连续打卡 7 天', check: c => c.streak >= 7 },
    { id: 'streak_30', icon: '<span class="ico" data-ico="mountain"><svg viewBox="0 0 24 24"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg></span>', name: '持之以恒', desc: '连续打卡 30 天', check: c => c.streak >= 30 },
    { id: 'practice_20', icon: '<span class="ico" data-ico="pencil"><svg viewBox="0 0 24 24"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg></span>', name: '练习达人', desc: '完成 20 道练习', check: c => c.practiceDone >= 20 },
    { id: 'practice_100', icon: '<span class="ico" data-ico="rocket"><svg viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg></span>', name: '刷题狂魔', desc: '完成 100 道练习', check: c => c.practiceDone >= 100 },
    { id: 'accuracy_90', icon: '<span class="ico" data-ico="target"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span>', name: '百发百中', desc: '练习正确率 ≥ 90%（至少 10 题）', check: c => c.practiceDone >= 10 && c.practiceCorrect / Math.max(1, c.practiceDone) >= 0.9 },
    { id: 'review_5_day', icon: '<span class="ico" data-ico="calendar"><svg viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg></span>', name: '复习标兵', desc: '单日复习打卡 5 次', check: c => c.maxDailyActivity >= 5 },
    { id: 'points_500', icon: '<span class="ico" data-ico="gem"><svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg></span>', name: '学习达人', desc: '积分达到 500', check: c => c.points >= 500 },
    { id: 'points_1000', icon: '<span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>', name: '学神降临', desc: '积分达到 1000', check: c => c.points >= 1000 },
    { id: 'ai_chat_1', icon: '<span class="ico" data-ico="bot"><svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></span>', name: 'AI 伙伴', desc: '与 AI 编程伙伴对话 1 次', check: c => c.chatCount >= 1 },
    { id: 'challenge_1', icon: '<span class="ico" data-ico="dice-5"><svg viewBox="0 0 24 24"><rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/></svg></span>', name: '迎接挑战', desc: '完成 1 次随机抽考', check: c => c.challengeCount >= 1 }
];

let unlockedAchievements = {};

function loadAchievements() {
    try {
        const d = localStorage.getItem(ACH_KEY);
        unlockedAchievements = d ? JSON.parse(d) : {};
    } catch (e) { unlockedAchievements = {}; }
}

function saveAchievements() {
    try { localStorage.setItem(ACH_KEY, JSON.stringify(unlockedAchievements)); } catch (e) {}
}

function buildAchievementContext() {
    const done = Object.values(practiceRecords || {});
    return {
        total: mistakes.length,
        mastered: mistakes.filter(m => m.status === 'mastered').length,
        streak: calcStreak ? calcStreak() : 0,
        practiceDone: done.filter(r => r.done).length,
        practiceCorrect: done.filter(r => r.done && r.correct).length,
        maxDailyActivity: Math.max(0, ...Object.values(activityLog || {})),
        points: userPoints || 0,
        chatCount: parseInt(localStorage.getItem('code_chat_count_v1') || '0', 10),
        challengeCount: (challengeStats && challengeStats.count) || 0
    };
}

function checkAchievements(showNewToast = true) {
    const ctx = buildAchievementContext();
    let newUnlocks = [];
    ACHIEVEMENTS.forEach(a => {
        if (!unlockedAchievements[a.id] && a.check(ctx)) {
            unlockedAchievements[a.id] = Date.now();
            newUnlocks.push(a);
        }
    });
    if (newUnlocks.length) {
        saveAchievements();
        if (showNewToast) {
            newUnlocks.forEach(a => showToast(`<span class="ico" data-ico="medal"><svg viewBox="0 0 24 24"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.01"/></svg></span> 解锁成就：${a.icon} ${a.name}`, 2500));
        }
    }
}

function renderAchievements() {
    const grid = $('achievementGrid');
    if (!grid) return;
    const unlocked = Object.keys(unlockedAchievements).length;
    $('achievementUnlockedNum').textContent = unlocked;
    $('achievementTotalNum').textContent = ACHIEVEMENTS.length;
    $('achievementProgressText').textContent = Math.round(unlocked / ACHIEVEMENTS.length * 100) + '%';
    grid.innerHTML = ACHIEVEMENTS.map(a => {
        const isUnlocked = !!unlockedAchievements[a.id];
        const time = unlockedAchievements[a.id];
        return `
            <div class="achievement-item ${isUnlocked ? 'unlocked' : 'locked'}" title="${isUnlocked ? '解锁于 ' + new Date(time).toLocaleDateString() : '未解锁'}">
                <div class="achievement-icon">${a.icon}</div>
                <div class="achievement-name">${a.name}</div>
                <div class="achievement-desc">${a.desc}</div>
            </div>
        `;
    }).join('');
}

/* ========================================
 * #5 随机抽考挑战
 * ======================================== */
const CHALLENGE_KEY = 'code_challenge_stats_v1';
let challengeStats = { best: 0, last: -1, count: 0 };
let challengeState = null;   // { questions, idx, score, chosen }

function loadChallengeStats() {
    try {
        const d = localStorage.getItem(CHALLENGE_KEY);
        challengeStats = d ? { ...challengeStats, ...JSON.parse(d) } : challengeStats;
    } catch (e) {}
}

function saveChallengeStats() {
    try { localStorage.setItem(CHALLENGE_KEY, JSON.stringify(challengeStats)); } catch (e) {}
}

function renderChallengeCard() {
    const sub = $('challengeCardSub');
    if (!sub) return;
    if (challengeStats.count > 0) {
        sub.textContent = `已挑战 ${challengeStats.count} 次 · 最佳 ${challengeStats.best} 分 · ${dailyMistakeTip()}`;
    } else {
        sub.textContent = '随机抽考，检验复习成果';
    }
}

// 今日一题：按日期种子从待复习错题中选一道
function dailyMistakeTip() {
    const pending = mistakes.filter(m => m.status !== 'mastered');
    if (!pending.length) return '错题已全部掌握';
    const seed = parseInt(todayKey().replace(/-/g, ''), 10) || Date.now();
    const m = pending[seed % pending.length];
    return '今日一题：' + (m.title || '未命名').slice(0, 10);
}

function openDailyMistake() {
    const pending = mistakes.filter(m => m.status !== 'mastered');
    if (!pending.length) { showToast('错题已全部掌握 <span class="ico" data-ico="sparkles"><svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg></span>'); return; }
    const seed = parseInt(todayKey().replace(/-/g, ''), 10) || Date.now();
    const m = pending[seed % pending.length];
    closeChallengeModal();
    viewMistake(m.id);
}

function openChallenge() {
    $('challengeModal').style.display = 'flex';
    renderChallengeSetup();
}

function closeChallengeModal() {
    $('challengeModal').style.display = 'none';
    challengeState = null;
}

function renderChallengeSetup() {
    const body = $('challengeBody');
    body.innerHTML = `
        <div class="challenge-quote"><span class="ico" data-ico="dumbbell"><svg viewBox="0 0 24 24"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg></span> 随机抽考，看看自己真正掌握了多少</div>
        <div class="challenge-setup-row">
            <label>题数</label>
            <button class="challenge-opt-btn active" data-count="5" onclick="startChallenge(5)">5 题</button>
            <button class="challenge-opt-btn" data-count="10" onclick="startChallenge(10)">10 题</button>
            <button class="challenge-opt-btn" data-count="20" onclick="startChallenge(20)">20 题</button>
        </div>
        <div class="challenge-setup-row" style="margin-top:4px">
            <label>范围</label>
            <button class="challenge-opt-btn" onclick="startChallenge(5, true)"><span class="ico" data-ico="dice-5"><svg viewBox="0 0 24 24"><rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/></svg></span> 全题库随机</button>
            <button class="challenge-opt-btn" onclick="startChallenge(5, false)"><span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 只考错过的题</button>
        </div>
        <button class="practice-quiz-btn practice-quiz-btn-primary" style="width:100%" onclick="openDailyMistake()"><span class="ico" data-ico="book"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span> 今日一题（错题回顾）</button>
    `;
}

// 只考错过的题：利用错题标签匹配练习题库 topic/category
function questionsByMistakes(pool) {
    const myTags = new Set();
    mistakes.forEach(m => (m.tags || []).forEach(t => myTags.add(t)));
    const matched = pool.filter(q => {
        const qTags = [q.category, q.topic].filter(Boolean);
        return qTags.some(t => myTags.has(t));
    });
    return matched.length >= 3 ? matched : pool;
}

function startChallenge(count, fullPool = true) {
    const pool = getAllPracticeQuestions();
    if (pool.length < 3) { showToast('题库题目不足，先做做练习或生成 AI 变式题吧'); return; }
    const candidate = fullPool ? pool : questionsByMistakes(pool);
    const shuffled = [...candidate].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(count, shuffled.length));
    challengeState = { questions: picked, idx: 0, score: 0, chosen: -1, answered: false };
    renderChallengeQuestion();
}

function renderChallengeQuestion() {
    const s = challengeState;
    if (!s) return;
    const q = s.questions[s.idx];
    const body = $('challengeBody');
    const percent = Math.round(s.idx / s.questions.length * 100);
    body.innerHTML = `
        <div>
            <div class="challenge-progress">
                <span>第 ${s.idx + 1} / ${s.questions.length} 题</span>
                <span>得分 ${s.score}</span>
            </div>
            <div class="challenge-progress-bar"><div class="challenge-progress-fill" style="width:${percent}%"></div></div>
        </div>
        <div>
            <span class="challenge-q-cat">${escapeHtml(q.category || '综合')}${q.difficulty ? ' · <span class="ico" data-ico="star"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'.repeat(Math.min(5, q.difficulty)) : ''}</span>
            <div class="challenge-q-title">${escapeHtml(q.question)}</div>
            ${q.code ? `<div class="challenge-q-code">${escapeHtml(q.code)}</div>` : ''}
            <div class="challenge-options" id="challengeOptions">
                ${q.options.map((opt, i) => `
                    <button class="challenge-option" data-idx="${i}" onclick="challengeAnswer(${i})">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</button>
                `).join('')}
            </div>
            <div id="challengeFeedback"></div>
        </div>
    `;
}

function challengeAnswer(optIdx) {
    const s = challengeState;
    if (!s || s.answered) return;
    s.answered = true;
    s.chosen = optIdx;
    const q = s.questions[s.idx];
    const correct = optIdx === q.answer;

    if (correct) {
        s.score += 10;
        logActivity();
        addPoints(10, '挑战答对一题');
    }

    const options = $('challengeOptions');
    const btns = options.querySelectorAll('.challenge-option');
    btns.forEach((b, i) => {
        b.disabled = true;
        if (i === q.answer) b.classList.add('correct');
        if (i === optIdx && !correct) b.classList.add('wrong');
    });

    const last = s.idx === s.questions.length - 1;
    $('challengeFeedback').innerHTML = `
        <div style="margin-top:12px;font-size:13px;color:var(--text-secondary);line-height:1.6">
            ${correct ? '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 回答正确！' : '<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 回答错误'}
            ${q.explanation ? `<br><span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> ${escapeHtml(q.explanation)}` : ''}
        </div>
        <button class="practice-quiz-btn practice-quiz-btn-primary" style="width:100%;margin-top:12px" onclick="${last ? 'finishChallenge()' : 'challengeNext()'}">
            ${last ? '查看结果' : '下一题 →'}
        </button>
    `;
}

function challengeNext() {
    challengeState.idx += 1;
    challengeState.answered = false;
    challengeState.chosen = -1;
    renderChallengeQuestion();
}

function finishChallenge() {
    const s = challengeState;
    const total = s.questions.length;
    const score = s.score;
    const full = score === total * 10;

    challengeStats.count += 1;
    challengeStats.last = score;
    challengeStats.best = Math.max(challengeStats.best || 0, score);
    saveChallengeStats();
    addPoints(Math.round(score / 2), '完成随机抽考');
    checkAchievements(true);

    const percent = Math.round(score / (total * 10) * 100);
    const quotes = [
        [100, '<span class="ico" data-ico="trophy"><svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg></span> 满分！你是真正的学神！'],
        [80, '<span class="ico" data-ico="sparkles"><svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg></span> 非常棒，继续保持！'],
        [60, '<span class="ico" data-ico="dumbbell"><svg viewBox="0 0 24 24"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg></span> 还不错，错题再复习一下会更稳'],
        [0, '<span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 别灰心，翻开错题本温故知新吧']
    ];
    const quote = quotes.find(q => percent >= q[0])[1];

    $('challengeBody').innerHTML = `
        <div class="challenge-result-score">${score}<span style="font-size:16px;color:var(--text-secondary)"> / ${total * 10} 分</span></div>
        <div class="challenge-result-detail">正确率 ${percent}% · 历史最佳 ${challengeStats.best} 分</div>
        <div class="challenge-quote">${quote}</div>
        <button class="practice-quiz-btn practice-quiz-btn-primary" style="width:100%" onclick="startChallenge(${total})"><span class="ico" data-ico="refresh-cw"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span> 再来一轮</button>
        <button class="practice-quiz-btn practice-quiz-btn-secondary" style="width:100%;margin-top:8px" onclick="closeChallengeModal()">关闭</button>
    `;
    renderChallengeCard();
}

/* ========================================
 * #15 社交分享
 * ======================================== */
let shareMistakeId = null;

function openShareModal(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) { showToast('错题不存在'); return; }
    shareMistakeId = id;
    const canNativeShare = !!(navigator.share);
    $('shareOptions').innerHTML = `
        ${canNativeShare ? `
        <div class="share-option" onclick="shareNative()">
            <div class="share-option-icon" style="background:#f0f4f8"><span class="ico" data-ico="upload"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg></span></div>
            <div class="share-option-text">
                <div class="share-option-name">系统分享</div>
                <div class="share-option-hint">通过手机系统分享（含图片卡片）</div>
            </div>
        </div>` : ''}
        <div class="share-option" onclick="shareDownloadCard()">
            <div class="share-option-icon" style="background:#f0f4f8"><span class="ico" data-ico="image"><svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></span></div>
            <div class="share-option-text">
                <div class="share-option-name">下载分享卡片</div>
                <div class="share-option-hint">生成精美 PNG 图片，可发朋友圈 / 聊天群</div>
            </div>
        </div>
        <div class="share-option" onclick="shareCopyText()">
            <div class="share-option-icon" style="background:#f0f4f8"><span class="ico" data-ico="clipboard"><svg viewBox="0 0 24 24"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg></span></div>
            <div class="share-option-text">
                <div class="share-option-name">复制题目文本</div>
                <div class="share-option-hint">复制到剪贴板，粘贴到聊天软件</div>
            </div>
        </div>
        <div class="share-option" onclick="shareCopyLink()">
            <div class="share-option-icon" style="background:#f0f4f8"><span class="ico" data-ico="link"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span></div>
            <div class="share-option-text">
                <div class="share-option-name">复制应用链接</div>
                <div class="share-option-hint">把错题本应用分享给同学</div>
            </div>
        </div>
        <div class="share-option" onclick="shareToWeibo()">
            <div class="share-option-icon" style="background:#f0f4f8"><span class="ico" data-ico="twitter"><svg viewBox="0 0 24 24"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg></span></div>
            <div class="share-option-text">
                <div class="share-option-name">分享到微博</div>
                <div class="share-option-hint">跳转微博网页发布</div>
            </div>
        </div>
    `;
    $('shareModal').style.display = 'flex';
}

function closeShareModal() {
    $('shareModal').style.display = 'none';
    shareMistakeId = null;
}

function shareNative() {
    const m = mistakes.find(x => x.id === shareMistakeId);
    if (!m) return;
    const text = `【错题分享】${m.title}\n语言：${getLangName(m.lang)}\n考点：${(m.tags || []).join('、') || '综合'}\n\n${(m.wrongCode || '').slice(0, 200)}`;
    navigator.share({ title: m.title, text: text, url: location.href })
        .catch(() => {});
}

function shareDownloadCard() {
    const m = mistakes.find(x => x.id === shareMistakeId);
    if (!m) return;
    showToast('正在生成分享卡片...');
    setTimeout(() => generateShareCard(m), 100);
}

function shareCopyText() {
    const m = mistakes.find(x => x.id === shareMistakeId);
    if (!m) return;
    const text = `【错题分享】${m.title}\n语言：${getLangName(m.lang)}\n考点：${(m.tags || []).join('、') || '综合'}\n\n<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 错误代码:\n${m.wrongCode || '（无）'}\n<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 正确代码:\n${m.rightCode || '（无）'}\n<span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> 错误分析:\n${m.note || '（无）'}`;
    copyToClipboard(text, '题目文本已复制，快去粘贴分享吧！');
}

function shareCopyLink() {
    copyToClipboard(location.href, '应用链接已复制！');
}

function shareToWeibo() {
    const m = mistakes.find(x => x.id === shareMistakeId);
    if (!m) return;
    const text = `【编程错题】${m.title}（${getLangName(m.lang)} · ${(m.tags || []).join('、') || '综合'}）我用「代码错题集」记录并攻克了这道题！`;
    const url = 'https://service.weibo.com/share/share.php?title=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(location.href);
    window.open(url, '_blank');
}

function copyToClipboard(text, successMsg) {
    const done = () => showToast(successMsg, 2000);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
        fallbackCopy(text, done);
    }
}

function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { showToast('复制失败，请手动复制'); }
    ta.remove();
}

/* ========================================
 * #12 OCR 拍照识别录入
 * ======================================== */
let ocrImageData = null;   // dataURL
let ocrBusy = false;
let tesseractLoadPromise = null;

function openOcrModal() {
    $('ocrModal').style.display = 'flex';
    renderOcrBody();
}

function closeOcrModal() {
    if (ocrBusy) { showToast('识别进行中，请稍候'); return; }
    $('ocrModal').style.display = 'none';
    ocrImageData = null;
}

function renderOcrBody() {
    $('ocrBody').innerHTML = `
        <div class="ocr-dropzone" onclick="document.getElementById('ocrFileInput').click()">
            ${ocrImageData ? '<img class="ocr-preview-img" src="' + ocrImageData + '">' : '<span class="ico" data-ico="camera"><svg viewBox="0 0 24 24"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg></span> 点击选择题目截图 / 报错图片<br><span style="font-size:12px">支持中英文识别，首次识别需下载模型（约 20MB）</span>'}
        </div>
        <input type="file" id="ocrFileInput" accept="image/*" capture="environment" style="display:none" onchange="handleOcrFile(this)">
        <button class="practice-quiz-btn practice-quiz-btn-primary" id="ocrStartBtn" ${ocrImageData ? '' : 'disabled style="opacity:0.5"'} onclick="runOCR()"><span class="ico" data-ico="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span> 开始识别</button>
        <div class="ocr-progress" id="ocrProgress" style="display:none"><div class="ocr-progress-fill" id="ocrProgressFill"></div></div>
        <div class="ocr-status" id="ocrStatus"></div>
        <textarea class="ocr-result-textarea" id="ocrResultText" placeholder="识别结果将显示在这里，可手动编辑…" style="display:none"></textarea>
        <button class="practice-quiz-btn practice-quiz-btn-secondary" id="ocrFillBtn" onclick="ocrFillForm()" style="display:none"><span class="ico" data-ico="pencil-line"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span> 智能填入错题表单</button>
        <div class="ocr-prefill-hint">识别代码可能出现少量字符偏差，填入后请人工校对。</div>
    `;
}

function handleOcrFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { showToast('请选择图片文件'); return; }
    const reader = new FileReader();
    reader.onload = () => {
        ocrImageData = reader.result;
        renderOcrBody();
    };
    reader.readAsDataURL(file);
}

function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoadPromise) return tesseractLoadPromise;
    tesseractLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract 加载失败'));
        s.onerror = () => reject(new Error('OCR 引擎 CDN 加载失败，请检查网络'));
        document.head.appendChild(s);
    });
    return tesseractLoadPromise;
}

async function runOCR() {
    if (ocrBusy || !ocrImageData) return;
    ocrBusy = true;
    const startBtn = $('ocrStartBtn');
    const progress = $('ocrProgress');
    const fill = $('ocrProgressFill');
    const status = $('ocrStatus');
    const result = $('ocrResultText');
    const fillBtn = $('ocrFillBtn');
    startBtn.disabled = true;
    progress.style.display = 'block';
    result.style.display = 'none';
    fillBtn.style.display = 'none';
    status.textContent = '正在加载识别引擎…';

    try {
        const Tesseract = await loadTesseract();
        status.textContent = '正在识别文字（首次较慢，请耐心等待）…';
        const { data } = await Tesseract.recognize(ocrImageData, 'chi_sim+eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    fill.style.width = Math.round(m.progress * 100) + '%';
                    status.textContent = '识别中 ' + Math.round(m.progress * 100) + '%';
                }
            }
        });
        status.textContent = '<span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span> 识别完成';
        result.value = (data.text || '').trim();
        result.style.display = 'block';
        fillBtn.style.display = 'block';
        showToast('识别完成，可编辑后填入表单');
    } catch (e) {
        console.error('OCR失败:', e);
        status.textContent = '<span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span> 识别失败：' + (e.message || '未知错误');
    } finally {
        ocrBusy = false;
        startBtn.disabled = !ocrImageData;
        progress.style.display = 'none';
    }
}

// 启发式拆分：疑似代码行 → 错误代码框；其余 → 题目描述
function ocrFillForm() {
    const text = ($('ocrResultText').value || '').trim();
    if (!text) { showToast('没有可填入的识别内容'); return; }

    const lines = text.split('\n');
    const codeLines = [];
    const textLines = [];
    lines.forEach(line => {
        const isCode = /[{};()=<>\[\]()]|\b(int|var|let|const|def|return|for|while|if|else|print|printf|cout)\b|^\s{2,}/.test(line)
            || line.length > 60;
        (isCode ? codeLines : textLines).push(line);
    });

    if ($('inputDesc').value.trim() === '' && textLines.length) {
        $('inputDesc').value = textLines.join('\n').trim();
    } else if (textLines.length) {
        $('inputNote').value = ($('inputNote').value ? $('inputNote').value + '\n\n' : '') + '【OCR 识别】\n' + textLines.join('\n').trim();
    }

    if (codeLines.length) {
        const code = codeLines.join('\n').trim();
        if ($('inputWrongCode').value.trim() === '') {
            $('inputWrongCode').value = code;
        } else {
            $('inputRightCode').value = ($('inputRightCode').value ? $('inputRightCode').value + '\n\n' : '') + code;
        }
    }

    closeOcrModal();
    switchPage('pageEdit');
    showToast('已填入表单，请校对后保存');
}

/* ========================================
 * #1 错题云同步（GitHub Gist）
 * ======================================== */
const SYNC_KEY = 'code_sync_config_v1';
const SYNC_FILENAME = 'code-mistake-book-backup.json';
let syncConfig = { token: '', gistId: '', autoSync: false, lastSyncAt: 0, user: '' };
let autoSyncTimer = null;

function loadSyncConfig() {
    try {
        const d = localStorage.getItem(SYNC_KEY);
        syncConfig = d ? { ...syncConfig, ...JSON.parse(d) } : syncConfig;
    } catch (e) {}
}

function saveSyncConfig() {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncConfig)); } catch (e) {}
}

function openSyncModal() {
    $('syncModal').style.display = 'flex';
    renderSyncBody();
}

function closeSyncModal() {
    $('syncModal').style.display = 'none';
}

function renderSyncBody(statusHtml = '') {
    const lastText = syncConfig.lastSyncAt ? '上次同步：' + new Date(syncConfig.lastSyncAt).toLocaleString() : '尚未同步过';
    $('syncBody').innerHTML = `
        <div class="ai-settings-tip" style="font-size:12px;color:var(--text-secondary);line-height:1.6">
            <span class="ico" data-ico="cloud"><svg viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></span> 通过 GitHub Gist 把错题数据同步到云端，换设备也能恢复；支持多设备合并。
            Token 仅保存在本机 localStorage 中，不会上传给任何第三方。
        </div>
        <div class="form-group">
            <label class="form-label">GitHub Token（需勾选 gist 权限）</label>
            <input type="password" id="syncToken" class="form-input" placeholder="ghp_..." value="${escapeHtml(syncConfig.token)}">
        </div>
        <div class="form-group">
            <label class="form-label">Gist ID（留空则自动创建）</label>
            <input type="text" id="syncGistId" class="form-input" placeholder="留空自动创建" value="${escapeHtml(syncConfig.gistId)}">
        </div>
        <div class="reminder-row">
            <span class="reminder-label">自动同步（保存错题时静默上传）</span>
            <div class="switch ${syncConfig.autoSync ? 'on' : ''}" id="syncAutoSwitch" onclick="toggleAutoSync()"></div>
        </div>
        <div class="sync-status ${syncConfig.user ? 'ok' : ''}" id="syncStatus">${statusHtml || (syncConfig.user ? '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 已连接 GitHub 账号：' + escapeHtml(syncConfig.user) : '<span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> 填写 Token 后先点击「检测连接」')}</div>
        <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="saveSyncInputs(); syncTest()"><span class="ico" data-ico="plug"><svg viewBox="0 0 24 24"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg></span> 检测连接</button>
        <button class="practice-quiz-btn practice-quiz-btn-primary" style="background:#0071e3" onclick="saveSyncInputs(); syncPush()"><span class="ico" data-ico="cloud"><svg viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></span> 立即备份上传</button>
        <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="saveSyncInputs(); syncPull(false)"><span class="ico" data-ico="download"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></span> 云端下载（合并到本地）</button>
        <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="saveSyncInputs(); syncPull(true)"><span class="ico" data-ico="recycle"><svg viewBox="0 0 24 24"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/></svg></span>️ 云端覆盖本地</button>
        <div style="font-size:12px;color:var(--text-secondary)">${lastText}</div>
    `;
}

function saveSyncInputs() {
    syncConfig.token = ($('syncToken') ? $('syncToken').value.trim() : syncConfig.token);
    syncConfig.gistId = ($('syncGistId') ? $('syncGistId').value.trim() : syncConfig.gistId);
    saveSyncConfig();
}

function toggleAutoSync() {
    syncConfig.autoSync = !syncConfig.autoSync;
    saveSyncConfig();
    renderSyncBody();
    showToast(syncConfig.autoSync ? '已开启自动同步' : '已关闭自动同步');
}

function setSyncStatus(msg, ok) {
    const el = $('syncStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'sync-status ' + (ok ? 'ok' : '');
    if (!ok && ok !== null) el.className = 'sync-status err';
    if (ok === null) el.className = 'sync-status';
}

// GitHub API 封装：Bearer 失败时回退 classic token 方式
async function syncGh(method, path, body) {
    const headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const doFetch = (authHeader) => fetch('https://api.github.com' + path, {
        method, headers: { ...headers, ...(authHeader ? { 'Authorization': authHeader } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let resp = await doFetch('Bearer ' + syncConfig.token);
    if (resp.status === 401) resp = await doFetch('token ' + syncConfig.token);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || ('HTTP ' + resp.status));
    return data;
}

async function syncTest() {
    if (!syncConfig.token) { setSyncStatus('请先填写 GitHub Token', false); return; }
    setSyncStatus('正在连接 GitHub…', null);
    try {
        const user = await syncGh('GET', '/user');
        syncConfig.user = user.login || '';
        saveSyncConfig();
        setSyncStatus('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 连接成功，当前账号：' + syncConfig.user, true);
    } catch (e) {
        syncConfig.user = '';
        saveSyncConfig();
        setSyncStatus('<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 连接失败：' + (e.message || '未知错误'), false);
    }
}

function buildSyncPayload() {
    return {
        app: 'code-mistake-book',
        version: 1,
        updatedAt: Date.now(),
        mistakes: mistakes
    };
}

async function syncPush() {
    if (!syncConfig.token) { setSyncStatus('请先填写 GitHub Token', false); return; }
    setSyncStatus('正在上传到云端…', null);
    try {
        const payload = buildSyncPayload();
        if (syncConfig.gistId) {
            await syncGh('PATCH', '/gists/' + syncConfig.gistId, {
                files: { [SYNC_FILENAME]: { content: JSON.stringify(payload) } }
            });
        } else {
            const gist = await syncGh('POST', '/gists', {
                description: '代码错题集 - 云端同步备份（由应用自动管理）',
                public: false,
                files: { [SYNC_FILENAME]: { content: JSON.stringify(payload) } }
            });
            syncConfig.gistId = gist.id;
        }
        syncConfig.lastSyncAt = Date.now();
        saveSyncConfig();
        setSyncStatus('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 备份成功！共 ' + mistakes.length + ' 道错题已上传（' + new Date().toLocaleTimeString() + '）', true);
        showToast('<span class="ico" data-ico="cloud"><svg viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></span> 云端备份成功');
    } catch (e) {
        setSyncStatus('<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 上传失败：' + (e.message || '未知错误'), false);
    }
}

// merge: true 云端覆盖本地；false 与本地按 updatedAt 合并
async function syncPull(overwrite) {
    if (!syncConfig.token || !syncConfig.gistId) { setSyncStatus('请先填写 Token，并至少成功备份过一次', false); return; }
    setSyncStatus('正在从云端下载…', null);
    try {
        const gist = await syncGh('GET', '/gists/' + syncConfig.gistId);
        const file = gist.files && gist.files[SYNC_FILENAME];
        if (!file) { setSyncStatus('云端未找到备份文件', false); return; }
        const data = JSON.parse(file.content);
        const remote = Array.isArray(data.mistakes) ? data.mistakes : (Array.isArray(data) ? data : []);
        let next;
        if (overwrite) {
            next = remote;
        } else {
            // 合并：按 id 去重，updatedAt 新者胜（新设备上本地较旧）
            const map = new Map();
            [...remote, ...mistakes].forEach(m => {
                const exist = map.get(m.id);
                if (!exist || (m.updatedAt || m.createdAt || 0) > (exist.updatedAt || exist.createdAt || 0)) {
                    map.set(m.id, m);
                }
            });
            next = [...map.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        }
        mistakes = next;
        saveData();
        syncConfig.lastSyncAt = Date.now();
        saveSyncConfig();
        setSyncStatus('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 已恢复 ' + mistakes.length + ' 道错题' + (overwrite ? '（云端数据已覆盖本地）' : '（已与本地合并）'), true);
        showToast('<span class="ico" data-ico="cloud"><svg viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></span> 云端数据已恢复到本地');
        refreshCurrentPage();
    } catch (e) {
        setSyncStatus('<span class="ico" data-ico="x-circle"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg></span> 下载失败：' + (e.message || '未知错误'), false);
    }
}

/* ========================================
 * B7 AI 智能打标
 * 粘贴题目/代码后，AI 推荐标签、标题、错因，自动预填表单
 * ======================================== */
async function aiAutoTag() {
    const btn = $('aiTagBtn');
    const hint = $('aiTagHint');

    if (!aiConfig.apiKey || !aiConfig.baseURL || !aiConfig.model) {
        hint.textContent = '<span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span> 尚未配置 AI，点击 AI 举一反三弹窗中的「<span class="ico" data-ico="settings"><svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span> 配置」先完成配置';
        hint.style.color = '#a07035';
        showToast('请先配置 AI');
        return;
    }

    const title = $('inputTitle').value.trim();
    const desc = $('inputDesc').value.trim();
    const wrongCode = $('inputWrongCode').value.trim();

    if (!title && !wrongCode) {
        showToast('请先填写题目标题或错误代码，AI 才有分析依据');
        return;
    }

    // 已有标签时不覆盖
    const existingTags = $('inputTags').value.split(/[,，]/).map(t => t.trim()).filter(Boolean);

    btn.disabled = true;
    btn.textContent = '<span class="ico" data-ico="bot"><svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></span> 分析中…';
    hint.textContent = 'AI 正在分析题目，推荐标签与错因…';
    hint.style.color = '';

    try {
        const prompt = `请分析这道编程错题，返回严格 JSON（不要多余文字）：
{
  "tags": ["考点标签1", "考点标签2", "考点标签3"],  // 3-5 个，简短中文标签
  "title": "简洁题目标题（仅当原标题为空时返回，否则返回空字符串）",
  "reason": "一句话错误原因",  // 20 字内
  "category": "数据结构/算法/操作系统/计算机网络/数据库/语言基础 之一"
}
已有标签（避免重复，可用同义补充）：${existingTags.join('、') || '无'}
现有标题：${title || '（空）'}
题目描述：${desc || '（无）'}
错误代码：
${wrongCode || '（无）'}`;

        const text = await callLLMChat([
            { role: 'system', content: '你是编程教学专家，擅长为错题打标签、归纳错误原因。只输出合法 JSON。' },
            { role: 'user', content: prompt }
        ]);

        // 解析 JSON：剥离代码围栏，取第一个 {...}
        let cleaned = text.trim();
        const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) cleaned = fence[1].trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error('未返回有效 JSON');
        const data = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));

        const newTags = Array.isArray(data.tags) ? data.tags.map(t => String(t).trim()).filter(Boolean) : [];
        // 合并标签去重（保留用户已填的）
        const merged = [...new Set([...existingTags, ...newTags])].slice(0, 6);
        $('inputTags').value = merged.join(', ');

        // 标题仅在为空时填充
        if (!$('inputTitle').value.trim() && data.title) {
            $('inputTitle').value = String(data.title).trim();
        }
        // 错因仅在为空时填充
        if (!$('inputNote').value.trim() && data.reason) {
            $('inputNote').value = String(data.reason).trim();
        }
        // 分类映射到语言？category 与语言无关，仅用于提示
        if (data.category && !$('inputNote').value.includes(data.category)) {
            // 不自动写类别，避免污染笔记；仅在 hint 展示
            hint.textContent = `<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> 已推荐 ${newTags.length} 个标签${data.category ? '（分类：' + data.category + '）' : ''}，可手动微调后保存`;
            hint.style.color = '#1a5c2e';
        } else {
            hint.textContent = '<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> AI 已打标，可手动微调后保存';
            hint.style.color = '#1a5c2e';
        }
        showToast('<span class="ico" data-ico="check-circle"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg></span> AI 打标完成');
    } catch (e) {
        console.error('AI 打标失败:', e);
        hint.textContent = '<span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span> 打标失败：' + (e.message || '未知错误') + '，请重试或手动填写';
        hint.style.color = '#a04545';
    } finally {
        btn.disabled = false;
        btn.textContent = '<span class="ico" data-ico="bot"><svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></span> AI 智能打标';
    }
}

// 自动同步：保存数据后静默推送（防抖）
function maybeAutoSync() {
    if (!syncConfig.autoSync || !syncConfig.token || !syncConfig.gistId) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => {
        syncGh('PATCH', '/gists/' + syncConfig.gistId, {
            files: { [SYNC_FILENAME]: { content: JSON.stringify(buildSyncPayload()) } }
        }).then(() => {
            syncConfig.lastSyncAt = Date.now();
            saveSyncConfig();
        }).catch(err => console.warn('自动同步失败:', err));
    }, 2500);
}

/* ========================================
 * A3 AI 复习周报
 * 汇总近 7 天学习数据 → AI 点评（未配置 AI 时使用模板）
 * ======================================== */
let weeklyStats = null;
let weeklyAIText = '';

function buildWeeklyStats() {
    const weekAgo = Date.now() - 7 * 86400000;
    const inWeek = ts => ts && ts >= weekAgo;

    const newCount = mistakes.filter(m => inWeek(m.createdAt)).length;
    const masteredCount = mistakes.filter(m => m.status === 'mastered' && inWeek(m.lastReviewAt)).length;

    let reviewActions = 0, activeDays = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const n = activityLog[todayKey(d)] || 0;
        reviewActions += n;
        if (n > 0) activeDays++;
    }

    const done = Object.values(practiceRecords || {});
    const practiceDone = done.filter(r => inWeek(r.lastAt)).length;
    const practiceCorrect = done.filter(r => inWeek(r.lastAt) && r.correct).length;

    // 薄弱标签：未掌握错题按标签统计 Top3
    const tagCount = {};
    mistakes.filter(m => m.status !== 'mastered').forEach(m =>
        (m.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; })
    );
    const weakTags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t, n]) => `${t}(${n}题)`);

    return {
        newCount,
        masteredCount,
        reviewActions,
        activeDays,
        practiceDone,
        practiceCorrect,
        practiceRate: practiceDone ? Math.round(practiceCorrect / practiceDone * 100) : 0,
        weakTags,
        total: mistakes.length,
        pending: mistakes.filter(m => m.status !== 'mastered').length,
        streak: calcStreak(),
        points: userPoints || 0,
        awardCount: Object.keys(unlockedAchievements).length
    };
}

function templateWeeklyText(s) {
    const lines = [];
    lines.push('## <span class="ico" data-ico="dumbbell"><svg viewBox="0 0 24 24"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg></span> 本周表现\n本周复习打卡 **' + s.reviewActions + '** 次（' + s.activeDays + '/7 天），新增 ' + s.newCount + ' 道错题，掌握 **' + s.masteredCount + '** 道，练习 ' + s.practiceDone + ' 题、正确率 ' + s.practiceRate + '%。');
    if (s.weakTags.length) {
        lines.push('## <span class="ico" data-ico="trending-down"><svg viewBox="0 0 24 24"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg></span> 薄弱分析\n薄弱考点集中在：' + s.weakTags.join('、') + '。建议优先复习这些标签下的错题。');
    }
    lines.push('## <span class="ico" data-ico="target"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> 下周建议\n当前待攻克 ' + s.pending + ' 道错题' + (s.streak > 1 ? '，已连续打卡 ' + s.streak + ' 天，保持节奏！' : '，从今天开始打卡吧！') + (s.practiceRate < 60 && s.practiceDone > 0 ? ' 练习正确率偏低，多回顾错题解析。' : ''));
    return lines.join('\n\n');
}

async function openWeeklyReport() {
    $('weeklyModal').style.display = 'flex';
    weeklyStats = buildWeeklyStats();
    weeklyAIText = '';
    renderWeeklyBody('<span class="ico" data-ico="message-circle"><svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg></span> AI 正在总结你的本周表现…', true);

    if (aiConfig.apiKey && aiConfig.baseURL && aiConfig.model) {
        try {
            const prompt = '学生本周学习数据如下（JSON）：\n' + JSON.stringify(weeklyStats) +
                '\n\n请写一份鼓励性的编程学习周报，使用 Markdown，250 字以内，包含三段：## <span class="ico" data-ico="dumbbell"><svg viewBox="0 0 24 24"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg></span> 本周表现、## <span class="ico" data-ico="trending-down"><svg viewBox="0 0 24 24"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg></span> 薄弱分析、## <span class="ico" data-ico="target"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> 下周建议';
            const text = await callLLMChat([
                { role: 'system', content: '你是严谨又温暖的编程学习导师，回复使用简体中文 Markdown，控制在 250 字以内。' },
                { role: 'user', content: prompt }
            ]);
            weeklyAIText = text;
            renderWeeklyBody('');
        } catch (e) {
            console.warn('AI 周报生成失败，使用模板:', e);
            weeklyAIText = templateWeeklyText(weeklyStats);
            renderWeeklyBody('<span class="ico" data-ico="alert-triangle"><svg viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span> AI 生成失败，已展示数据模板报告');
        }
    } else {
        weeklyAIText = templateWeeklyText(weeklyStats);
        renderWeeklyBody('<span class="ico" data-ico="lightbulb"><svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg></span> 未配置 AI，展示数据模板报告；配置 AI 后可获得个性化点评');
    }
}

function closeWeeklyModal() {
    $('weeklyModal').style.display = 'none';
}

function renderWeeklyBody(note, loading = false) {
    const s = weeklyStats;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const range = `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

    $('weeklyBody').innerHTML = `
        <div class="weekly-range"><span class="ico" data-ico="calendar"><svg viewBox="0 0 24 24"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg></span> ${range} · 本周学习周报</div>
        <div class="weekly-stats-grid">
            <div class="weekly-stat"><b>${s.reviewActions}</b><span>复习打卡</span></div>
            <div class="weekly-stat"><b>${s.newCount}</b><span>新增错题</span></div>
            <div class="weekly-stat"><b>${s.masteredCount}</b><span>掌握错题</span></div>
            <div class="weekly-stat"><b>${s.practiceRate}%</b><span>练习正确率</span></div>
        </div>
        <div class="weekly-meta">
            <span><span class="ico" data-ico="flame"><svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span> 连续打卡 ${s.streak} 天</span>
            <span><span class="ico" data-ico="medal"><svg viewBox="0 0 24 24"><path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.01"/></svg></span> 成就 ${s.awardCount} 枚</span>
            <span><span class="ico" data-ico="gem"><svg viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg></span> 积分 ${s.points}</span>
        </div>
        <div class="weekly-ai-text markdown-body kd-detail">${loading ? '<span class="ico" data-ico="message-circle"><svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg></span> AI 正在总结你的本周表现…' : renderMarkdown(weeklyAIText)}</div>
        ${note ? `<div class="weekly-note">${escapeHtml(note)}</div>` : ''}
        <div class="weekly-actions">
            <button class="practice-quiz-btn practice-quiz-btn-secondary" id="weeklyRegenBtn" ${loading ? 'disabled style="opacity:0.5"' : ''}><span class="ico" data-ico="refresh-cw"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></span> 重新生成</button>
            <button class="practice-quiz-btn practice-quiz-btn-primary" id="weeklyImgBtn" ${loading ? 'disabled style="opacity:0.5"' : ''}><span class="ico" data-ico="image"><svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></span> 保存周报图片</button>
        </div>
    `;
    $('weeklyRegenBtn').addEventListener('click', openWeeklyReport);
    $('weeklyImgBtn').addEventListener('click', downloadWeeklyImage);
}

function downloadWeeklyImage() {
    if (!weeklyStats || !weeklyAIText) { showToast('周报尚未生成完成'); return; }
    const s = weeklyStats;
    const W = 720, H = 940;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#1d1d1f';
    ctx.fillRect(0, 0, W, H);

    // 顶部
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = 'bold 20px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('<span class="ico" data-ico="library"><svg viewBox="0 0 24 24"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg></span> 代码错题集', 40, 54);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('本周 AI 复习周报', 40, 96);

    // 白卡片
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(40, 124, W - 80, H - 124 - 70, 20);
    ctx.fill();

    // 数据 2x2
    const stats = [
        ['复习打卡', s.reviewActions + ' 次'],
        ['新增错题', s.newCount + ' 道'],
        ['掌握错题', s.masteredCount + ' 道'],
        ['练习正确率', s.practiceRate + '%']
    ];
    stats.forEach(([label, value], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 70 + col * 300, y = 170 + row * 110;
        ctx.fillStyle = '#e8e8ed';
        ctx.beginPath();
        ctx.roundRect(x, y, 260, 86, 14);
        ctx.fill();
        ctx.fillStyle = '#1d1d1f';
        ctx.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(value, x + 20, y + 48);
        ctx.fillStyle = '#86868b';
        ctx.font = '15px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText(label, x + 20, y + 74);
    });

    // 元信息
    ctx.fillStyle = '#48484a';
    ctx.font = '15px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(`连续打卡 ${s.streak} 天 · 成就 ${s.awardCount} 枚 · 积分 ${s.points}`, 70, 420);

    // AI 点评（纯文本换行）
    const plain = weeklyAIText.replace(/[#*`>]/g, '').trim();
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '16px "PingFang SC","Microsoft YaHei",sans-serif';
    let y = 470;
    const maxW = W - 140;
    const chunks = plain.split('\n').filter(Boolean);
    chunks.slice(0, 12).forEach(line => {
        // 简单按字符数截断换行
        let current = '';
        for (const ch of line) {
            if (ctx.measureText(current + ch).width > maxW && current) {
                ctx.fillText(current, 70, y);
                y += 26;
                current = ch;
            } else {
                current += ch;
            }
        }
        if (current) { ctx.fillText(current, 70, y); y += 26; }
    });

    // 底部
    ctx.fillStyle = '#8e8e93';
    ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('记录易错点，让每次错误都成为进步', W / 2, H - 34);

    canvas.toBlob(blob => {
        if (!blob) { showToast('生成图片失败'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'AI复习周报.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('<span class="ico" data-ico="check"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span> 周报图片已保存');
    }, 'image/png');
}