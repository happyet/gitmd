// GitMD 主脚本
document.addEventListener('DOMContentLoaded', async function() {
    // 检查配置
    if (!checkConfig()) {
        return;
    }
    
    // 初始化目录选择器
    initPathSelector();
    
    // 初始化GitHub API
    const api = new GitHubAPI(GitMDConfig);
    window.gitMDApi = api;
    
    // 初始化日期
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localDate = new Date(now.getTime() - offset * 60 * 1000);
        dateInput.value = localDate.toISOString().slice(0, 16);
    }
    
    // 加载分类和标签
    try {
        const categories = await api.loadCategories();
        const tags = await api.loadTags();
        
        // 渲染分类列表
        renderCategories(categories);
        
        // 保存标签数据
        window.allTags = tags;
    } catch (error) {
        console.error('加载数据失败', error);
        showMessage('加载数据失败: ' + error.message, 'error');
    }
    
    // 预览面板控制
    const previewPanel = document.getElementById('previewPanel');
    const togglePreviewBtn = document.getElementById('togglePreview');
    const closePreviewBtn = document.getElementById('closePreview');
    const editorContainer = document.querySelector('.editor-container');
    const contentTextarea = document.getElementById('content');
    const livePreview = document.getElementById('livePreview');
    
    let previewVisible = false;
    
    function togglePreview() {
        previewVisible = !previewVisible;
        
        if (previewVisible) {
            previewPanel?.classList.add('show');
            editorContainer?.classList.add('with-preview');
            togglePreviewBtn?.classList.add('active');
            updatePreview();
            if (previewPanel) {
                previewPanel.offsetHeight;
            }
        } else {
            previewPanel?.classList.remove('show');
            editorContainer?.classList.remove('with-preview');
            togglePreviewBtn?.classList.remove('active');
        }
        
        localStorage.setItem('md_preview_visible', previewVisible);
    }
    
    togglePreviewBtn?.addEventListener('click', togglePreview);
    closePreviewBtn?.addEventListener('click', togglePreview);
    
    const savedPreviewState = localStorage.getItem('md_preview_visible');
    if (savedPreviewState === 'true') {
        previewVisible = false;
        togglePreview();
    }
    
    // 配置 marked
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            highlight: function(code, lang) {
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return code;
            }
        });
    }
    
    // 实时预览
    function updatePreview() {
        if (!contentTextarea || !livePreview) return;
        const content = contentTextarea.value;
        
        if (typeof marked !== 'undefined') {
            livePreview.innerHTML = marked.parse(content);
            if (typeof hljs !== 'undefined') {
                livePreview.querySelectorAll('pre code').forEach(block => {
                    hljs.highlightElement(block);
                });
            }
        } else {
            livePreview.innerHTML = '<pre>' + escapeHtml(content) + '</pre>';
        }
        
        updateStats(content);
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 更新统计
    function updateStats(content) {
        const charCount = document.getElementById('charCount');
        const wordCount = document.getElementById('wordCount');
        const readTime = document.getElementById('readTime');
        
        if (!charCount) return;
        
        const chars = content.length;
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
        const minutes = Math.ceil((chineseChars + words) / 400);
        
        charCount.textContent = chars + ' 字';
        wordCount.textContent = (chineseChars + words) + ' 词';
        readTime.textContent = '约 ' + minutes + ' 分钟';
    }
    
    // 监听内容变化
    if (contentTextarea) {
        contentTextarea.addEventListener('input', updatePreview);
        updatePreview();
    }
    
    // 自动生成URL
    document.getElementById('generateUrl')?.addEventListener('click', async function() {
        const title = document.getElementById('title').value.trim();
        if (!title) return;
        
        const hasChinese = /[\u4e00-\u9fa5]/.test(title);
        let slug;
        
        if (hasChinese && typeof pinyinPro !== 'undefined') {
            slug = pinyinPro.pinyin(title, { toneType: 'none', type: 'array'}).join('-')
                .toLowerCase()
                .replace(/[^\w-]/g, '');
        } else {
            slug = title.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }
        
        const checkedCategories = Array.from(
            document.querySelectorAll('.category-checkbox:checked')
        ).map(checkbox => checkbox.value);
        
        if (checkedCategories.length > 0) {
            slug = `${checkedCategories[0]}/${slug}`;
        }
        
        document.getElementById('url').value = `/${slug}/`;
    });
    
    // 标签输入功能
    const tagInput = document.getElementById('tagInput');
    const selectedTags = document.getElementById('selectedTags');
    
    if (tagInput) {
        tagInput.addEventListener('input', function() {
            const value = this.value.trim().toLowerCase();
            
            if (value.includes(',')) {
                const tagsToAdd = value.split(',').map(t => t.trim()).filter(t => t !== '');
                tagsToAdd.forEach(t => addTag(t));
                this.value = '';
                return;
            }
        });
        
        tagInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const value = this.value.trim();
                if (value !== '') {
                    addTag(value);
                    this.value = '';
                }
            }
        });
        
        function addTag(tag) {
            tag = tag.replace(/,/g, '').trim();
            if (tag === '' || !selectedTags) return;
            
            const existingTags = Array.from(selectedTags.querySelectorAll('input[type="hidden"]'))
                .map(el => el.value);
            if (existingTags.includes(tag)) return;
            
            const span = document.createElement('span');
            span.className = 'tag';
            span.innerHTML = `${tag}<input type="hidden" name="tags[]" value="${tag}"><span class="remove-tag">&times;</span>`;
            selectedTags.appendChild(span);
            
            span.querySelector('.remove-tag').addEventListener('click', () => span.remove());
        }
    }
    
    // 保存文章
    document.getElementById('saveBtn')?.addEventListener('click', async function() {
        const title = document.getElementById('title').value.trim();
        const content = document.getElementById('content').value.trim();
        
        if (!title || !content) {
            showMessage('请填写标题和内容', 'error');
            return;
        }
        
        const article = {
            title: title,
            content: content,
            author: document.getElementById('author').value || GitMDConfig.defaultAuthor,
            date: document.getElementById('date').value,
            categories: Array.from(document.querySelectorAll('.category-checkbox:checked'))
                .map(cb => cb.dataset.name),
            tags: Array.from(selectedTags.querySelectorAll('input[type="hidden"]'))
                .map(el => el.value),
            comments: document.getElementById('comments').checked,
            showThumbnail: document.getElementById('showThumbnail').checked
        };
        
        try {
            this.disabled = true;
            this.textContent = '保存中...';
            
            // 生成文件名
            const filename = GitMDConfig.fileNameFormat(title, article.date);
            const filepath = `${GitMDConfig.github.contentPath}/${filename}`;
            
            // 生成文章内容
            const articleContent = api.generateArticleContent(article);
            
            // 检查文件是否存在
            const existingFile = await api.getFile(filepath);
            
            // 保存文件
            await api.saveFile(
                filepath,
                articleContent,
                existingFile ? `更新文章: ${title}` : `创建文章: ${title}`,
                existingFile?.sha
            );
            
            showMessage('文章保存成功！', 'success');
            
            // 跳转到文章列表
            setTimeout(() => {
                window.location.href = 'articles.html';
            }, 1500);
            
        } catch (error) {
            showMessage('保存失败: ' + error.message, 'error');
            this.disabled = false;
            this.textContent = '保存文章';
        }
    });
    
    // 主题切换
    const themeToggle = document.getElementById('themeToggle');
    const saved = localStorage.getItem('theme');
    
    if (saved === 'dark') {
        document.body.classList.add('dark-mode');
    } else if (saved === 'light') {
        document.body.classList.add('light-mode');
    }
    
    themeToggle?.addEventListener('click', function() {
        const isDark = document.body.classList.contains('dark-mode');
        document.body.classList.remove('dark-mode', 'light-mode');
        
        if (isDark) {
            document.body.classList.add('light-mode');
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        }
    });
});

// 渲染分类列表
function renderCategories(categories) {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;
    
    categoryList.innerHTML = '';
    
    for (const [slug, category] of Object.entries(categories)) {
        const label = document.createElement('label');
        label.innerHTML = `
            <input type="checkbox" class="category-checkbox" value="${slug}" data-name="${category.name}">
            ${category.name}
        `;
        categoryList.appendChild(label);
    }
}

// 显示消息
function showMessage(text, type = 'info') {
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.remove();
    }, 3000);
}

// 初始化目录选择器
function initPathSelector() {
    const selector = document.getElementById('pathSelector');
    const badge = document.getElementById('currentPathBadge');
    
    if (!selector) return;
    
    // 获取所有可用目录
    const paths = getAvailablePaths();
    
    // 填充选项
    selector.innerHTML = paths.map(path => 
        `<option value="${path}" ${path === GitMDConfig.github.currentPath ? 'selected' : ''}>
            ${path === 'post' ? '📝 文章' : path === 'page' ? '📄 页面' : path === 'draft' ? '✏️ 草稿' : path}
        </option>`
    ).join('');
    
    // 更新徽章
    updatePathBadge();
    
    // 监听切换
    selector.addEventListener('change', function() {
        const newPath = this.value;
        if (switchContentPath(newPath)) {
            updatePathBadge();
            showMessage(`已切换到 ${newPath} 目录`, 'success');
            
            // 重新加载数据
            location.reload();
        }
    });
}

// 更新目录徽章
function updatePathBadge() {
    const badge = document.getElementById('currentPathBadge');
    if (badge) {
        const currentPath = GitMDConfig.github.currentPath;
        const pathLabel = currentPath === 'post' ? '文章' : 
                        currentPath === 'page' ? '页面' : 
                        currentPath === 'draft' ? '草稿' : currentPath;
        badge.textContent = `(${pathLabel})`;
    }
}
