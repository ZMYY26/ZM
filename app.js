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
        pagePractice: '错题练习'
    };

    $('pageTitle').textContent = titles[pageId] || '代码错题集';
    $('backBtn').style.display = (pageId === 'pageEdit' || pageId === 'pageDetail') ? 'inline-flex' : 'none';
}

function refreshCurrentPage() {
    switch (currentPage) {
        case 'pageHome': renderMistakeList(); break;
        case 'pageCategory': renderCategory(); break;
        case 'pageReview': renderReview(); break;
        case 'pageKnowledge': renderKnowledge(); break;
        case 'pagePractice': renderPractice(); break;
    }
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
                <div class="empty-icon">📝</div>
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
                    <span>📅 ${formatDate(m.createdAt)}</span>
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
    if (mistake.status === 'mastered') return '<span style="color:#22c55e">✓ 已掌握</span>';

    const nextReview = getNextReviewDate(mistake);
    if (!nextReview) return '<span>✓ 复习完成</span>';

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const today = now.getTime();
    const diffDays = Math.ceil((nextReview - today) / (24 * 60 * 60 * 1000));

    if (diffDays <= 0) return '<span style="color:#ef4444">🔥 今天复习</span>';
    if (diffDays === 1) return '<span style="color:#f59e0b">⏰ 明天复习</span>';
    return `<span>📅 ${diffDays}天后复习</span>`;
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

// ========== 渲染复习页 ==========
function renderReview() {
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
                <div class="empty-icon">✨</div>
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
                <span class="review-check">${m.reviewCheck ? '✓' : ''}</span>
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
            <button type="button" class="image-remove" onclick="removeImage()">✕</button>
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
            <button type="button" class="image-remove" onclick="removeImage()">✕</button>
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
            createdAt: Date.now()
        });
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
    const nextReviewText = nextReview ? formatDate(nextReview) : '复习完成 ✓';

    container.innerHTML = `
        <div class="detail-header">
            <div class="detail-meta" style="margin-bottom:10px">
                <span class="lang-badge" style="font-size:13px;padding:5px 12px">${getLangName(m.lang)}</span>
                ${m.source ? `<span class="meta-tag">${escapeHtml(m.source)}</span>` : ''}
                <span class="meta-tag">创建于 ${formatDate(m.createdAt)}</span>
                <span class="meta-tag">下次复习: ${nextReviewText}</span>
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
                <div class="detail-section-title">❌ 错误代码</div>
                <div class="code-block">
                    <div class="code-block-header wrong">错误代码</div>
                    <pre><code class="hljs language-${m.lang}">${wrongCodeHtml}</code></pre>
                </div>
            </div>
        ` : ''}

        ${m.rightCode ? `
            <div class="detail-section">
                <div class="detail-section-title">✅ 正确代码</div>
                <div class="code-block">
                    <div class="code-block-header right">正确实现</div>
                    <pre><code class="hljs language-${m.lang}">${rightCodeHtml}</code></pre>
                </div>
            </div>
        ` : ''}

        ${m.note ? `
            <div class="detail-section">
                <div class="detail-section-title">💡 错误分析</div>
                <div class="detail-note">${escapeHtml(m.note)}</div>
            </div>
        ` : ''}

        <button class="ai-gen-btn" onclick="openAIModal('${m.id}')">🤖 AI 举一反三</button>
        <div class="detail-footer">
            ${m.status !== 'mastered' ? `
                <button class="action-btn success" onclick="markMastered('${m.id}')">✓ 已掌握</button>
            ` : `
                <button class="action-btn warning" onclick="unmarkMastered('${m.id}')">↩ 重新复习</button>
            `}
            <button class="action-btn primary" onclick="openEditForm('${m.id}')">✏ 编辑</button>
            <button class="action-btn danger" onclick="deleteMistake('${m.id}')">🗑 删除</button>
        </div>
    `;
}

function markMastered(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    m.status = 'mastered';
    m.lastReviewAt = Date.now();
    m.reviewCount = REVIEW_INTERVALS.length;

    saveData();
    showToast('🎉 恭喜！已标记为掌握');
    renderDetail(m);
    updateReviewBadge();
}

function unmarkMastered(id) {
    const m = mistakes.find(x => x.id === id);
    if (!m) return;

    m.status = 'pending';
    m.reviewCount = 0;
    m.lastReviewAt = Date.now();

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

    saveData();
    showToast('复习完成！');
}

// ========== 知识库（从后端 API 获取）==========
async function renderKnowledge() {
    const searchInput = $('knowledgeSearch');
    if (searchInput) searchInput.value = knowledgeSearchKeyword;

    const listEl = $('knowledgeList');
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p class="empty-text">加载中...</p></div>';

    // 并行获取分类和知识点列表
    const catPromise = api('/categories');

    let listPromise;
    if (knowledgeSearchKeyword) {
        listPromise = api('/knowledge/search?q=' + encodeURIComponent(knowledgeSearchKeyword));
    } else {
        listPromise = api('/knowledge' + (knowledgeActiveCategory ? '?category=' + encodeURIComponent(knowledgeActiveCategory) : ''));
    }

    const [catResult, listResult] = await Promise.all([catPromise, listPromise]);

    // 渲染分类标签
    const catContainer = $('knowledgeCategories');
    const cats = catResult.success ? catResult.data : [];
    const totalAll = cats.reduce((s, c) => s + c.count, 0);
    catContainer.innerHTML = `
        <div class="knowledge-cat-tab ${knowledgeActiveCategory === '' ? 'active' : ''}" onclick="selectKnowledgeCategory('')">
            全部<span class="knowledge-cat-count">${totalAll}</span>
        </div>
        ${cats.map(([cat, count]) => `
            <div class="knowledge-cat-tab ${knowledgeActiveCategory === cat ? 'active' : ''}" onclick="selectKnowledgeCategory('${escapeHtml(cat)}')">
                ${escapeHtml(cat)}<span class="knowledge-cat-count">${count}</span>
            </div>
        `).join('')}
    `;

    // 渲染知识点列表
    const items = listResult.success ? listResult.data : [];

    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <p class="empty-text">未找到相关知识点</p>
                <p class="empty-hint">试试搜索其他关键词，如"排序"、"TCP"、"索引"</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = items.map(item => `
        <div class="knowledge-card" onclick="viewKnowledge('${item.id}')">
            <span class="knowledge-card-category">${escapeHtml(item.category)}</span>
            <div class="knowledge-card-title">${escapeHtml(item.title)}</div>
            <div class="knowledge-card-summary">${escapeHtml(item.summary)}</div>
            <div class="knowledge-card-tags">
                ${(item.tags || []).map(t => `<span class="knowledge-card-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
            ${item.complexity ? `<div class="knowledge-card-complexity">⏱ ${escapeHtml(item.complexity)}</div>` : ''}
        </div>
    `).join('');
}

function selectKnowledgeCategory(cat) {
    knowledgeActiveCategory = cat;
    knowledgeSearchKeyword = '';
    renderKnowledge();
}

function handleKnowledgeSearch(event) {
    knowledgeSearchKeyword = event.target.value.trim();
    renderKnowledge();
}

async function viewKnowledge(id) {
    const detail = $('knowledgeDetail');
    detail.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p class="empty-text">加载中...</p></div>';
    $('knowledgeModal').style.display = 'block';

    const result = await api('/knowledge/' + id);
    if (!result.success || !result.data) {
        detail.innerHTML = '<div class="empty-state"><p class="empty-text">加载失败</p></div>';
        return;
    }

    const item = result.data;
    $('knowledgeModalTitle').textContent = item.title;

    // 找到相关错题
    const relatedMistakes = mistakes.filter(m => {
        if (!m.tags) return false;
        return item.tags.some(t => m.tags.includes(t));
    });

    // 找到同分类的相关知识点（从 API 获取）
    const relatedResult = await api('/knowledge?category=' + encodeURIComponent(item.category));
    const related = (relatedResult.success ? relatedResult.data : [])
        .filter(k => k.id !== item.id)
        .slice(0, 5);

    detail.innerHTML = `
        <div class="kd-header">
            <span class="kd-category">${escapeHtml(item.category)}</span>
        </div>
        <div class="kd-title">${escapeHtml(item.title)}</div>
        ${item.tags && item.tags.length > 0 ? `
            <div class="kd-tags">
                ${item.tags.map(t => `<span class="kd-tag">#${escapeHtml(t)}</span>`).join('')}
            </div>
        ` : ''}

        <div class="kd-section">
            <div class="kd-section-title">📖 概述</div>
            <div class="kd-summary">${escapeHtml(item.summary)}</div>
        </div>

        ${item.detail ? `
            <div class="kd-section">
                <div class="kd-section-title">📝 详细说明</div>
                <div class="kd-detail">${escapeHtml(item.detail)}</div>
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
                <div class="kd-section-title">🔗 关联错题 (${relatedMistakes.length})</div>
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

        <button class="kd-link-btn" onclick="linkToMistake('${escapeHtml(item.title)}', ${JSON.stringify(item.tags).replace(/"/g, '&quot;')})">
            📝 用此知识点创建错题
        </button>

        ${related.length > 0 ? `
            <div class="kd-related">
                <div class="kd-related-title">📚 同类知识点</div>
                <div class="kd-related-items">
                    ${related.map(r => `
                        <div class="kd-related-item" onclick="viewKnowledge('${r.id}')">
                            ${escapeHtml(r.title)}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
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

    // 绑定导航
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchPage(item.dataset.page));
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
            if ($('aiSettingsModal').style.display !== 'none') {
                closeAISettings();
            }
        }
    });

    // 首次加载页面
    switchPage('pageHome');
    updateTagFilter();

    // 检查是否有示例数据（首次使用时添加一些）
    if (mistakes.length === 0) {
        addSampleData();
    }
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
print(a)     # [1, 2, 3, 4, 5]  ✓ 不受影响
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
        const stars = '★'.repeat(q.difficulty || 1) + '☆'.repeat(3 - (q.difficulty || 1));
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
                ${relatedCount > 0 ? `<div class="practice-card-related">🔗 举一反三：${relatedCount} 道相关题</div>` : ''}
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

    const stars = '★'.repeat(q.difficulty || 1) + '☆'.repeat(3 - (q.difficulty || 1));

    let explanationHtml = '';
    if (answered) {
        explanationHtml = `
            <div class="practice-quiz-explanation">
                <div class="practice-quiz-explanation-title">${currentPracticeSelected === q.answer ? '✅ 回答正确' : '❌ 回答错误'}</div>
                <div>正确答案：${String.fromCharCode(65 + q.answer)}. ${escapeHtml(q.options[q.answer])}</div>
                <div style="margin-top:6px;">💡 ${escapeHtml(q.explanation || '')}</div>
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
                    <div class="practice-related-title">🔗 举一反三 - 相关知识点练习</div>
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

    currentPracticeAnswered = true;
    renderPracticeQuestion();
    updatePracticeStats();

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

    $('aiModalTitle').textContent = '🤖 AI 举一反三 · ' + (m.title || '').slice(0, 16);
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
                <div class="ai-empty-icon">⚙️</div>
                <p class="ai-empty-title">尚未配置 AI</p>
                <p class="ai-empty-hint">请先填写 API 地址、Key 和模型名，再开始出题</p>
                <button class="practice-quiz-btn practice-quiz-btn-primary" style="max-width:200px;margin:12px auto 0" onclick="openAISettings()">⚙️ 立即配置</button>
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
                <div class="ai-empty-icon">⚠️</div>
                <p class="ai-empty-title">出题失败</p>
                <p class="ai-empty-hint">${escapeHtml(state.message)}</p>
                <div class="ai-empty-actions">
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="closeAIModal()">关闭</button>
                    <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="generateAIQuestions()">重试</button>
                    <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="openAISettings()">⚙️ 配置</button>
                </div>
            </div>
        `;
        return;
    }

    if (state.type === 'success') {
        const cardsHtml = state.questions.map(q => renderAIQuestionCard(q)).join('');
        body.innerHTML = `
            <div class="ai-summary">
                <span>✅ 已生成 ${state.questions.length} 道变式题</span>
                <button class="ai-link-btn" onclick="generateAIQuestions()">🔄 再来一轮</button>
            </div>
            <div class="ai-question-list">${cardsHtml}</div>
            <div class="ai-batch-actions">
                <button class="practice-quiz-btn practice-quiz-btn-primary" onclick="addAllAIToPractice()">📚 全部加入练习库</button>
            </div>
        `;
    }
}

function renderAIQuestionCard(q) {
    const stars = '★'.repeat(q.difficulty) + '☆'.repeat(3 - q.difficulty);
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
            ? `<div class="ai-mnemonic">🧠 易错口诀：${escapeHtml(q.mnemonic)}</div>`
            : '';
        explanationHtml = `
            <div class="practice-quiz-explanation">
                <div class="practice-quiz-explanation-title">${state.selected === q.answer ? '✅ 回答正确' : '❌ 回答错误'}</div>
                <div>正确答案：${String.fromCharCode(65 + q.answer)}. ${correctOpt}</div>
                <div style="margin-top:6px;">💡 ${escapeHtml(q.explanation || '')}</div>
                ${mnemonicHtml}
            </div>
        `;
    }

    let actionsHtml = '';
    if (state.answered) {
        actionsHtml = `
            <div class="ai-card-actions">
                <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="addAIToPractice('${q.id}')">📚 加入练习库</button>
                <button class="practice-quiz-btn practice-quiz-btn-secondary" onclick="addAIToMistake('${q.id}')">📝 加入错题本</button>
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
        note: `正确答案：${String.fromCharCode(65 + q.answer)}. ${q.options[q.answer]}\n解析：${q.explanation || ''}${q.mnemonic ? '\n🧠 口诀：' + q.mnemonic : ''}`,
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

// 启动应用
document.addEventListener('DOMContentLoaded', init);