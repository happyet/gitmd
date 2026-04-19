document.addEventListener('DOMContentLoaded', function() {
    const editorButtons = document.querySelectorAll('#editor-button [data-action]');
    const contentTextarea = document.getElementById('content');
    
    // 快捷键支持
    contentTextarea?.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    wrapSelection('**', '**');
                    break;
                case 'i':
                    e.preventDefault();
                    wrapSelection('*', '*');
                    break;
                case 'k':
                    e.preventDefault();
                    insertLink();
                    break;
            }
        }
        
        // Tab 键插入空格
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 4;
        }
    });
    
    function getSelection() {
        return {
            start: contentTextarea.selectionStart,
            end: contentTextarea.selectionEnd,
            selectedText: contentTextarea.value.substring(contentTextarea.selectionStart, contentTextarea.selectionEnd)
        };
    }
    
    function insertText(text, start, end) {
        contentTextarea.value = contentTextarea.value.substring(0, start) + text + contentTextarea.value.substring(end);
        contentTextarea.selectionStart = contentTextarea.selectionEnd = start + text.length;
        contentTextarea.focus();
        contentTextarea.dispatchEvent(new Event('input'));
    }
    
    function wrapSelection(before, after = '') {
        const sel = getSelection();
        insertText(before + sel.selectedText + after, sel.start, sel.end);
    }
    
    function insertLink() {
        const sel = getSelection();
        const linkText = sel.selectedText || '链接文字';
        const linkUrl = prompt('请输入链接地址:', 'https://');
        if (linkUrl) {
            insertText(`[${linkText}](${linkUrl})`, sel.start, sel.end);
        }
    }
    
    // 按钮事件
    editorButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            const level = this.getAttribute('data-level');
            const sel = getSelection();
            
            switch(action) {
                case 'bold':
                    wrapSelection('**', '**');
                    break;
                case 'italic':
                    wrapSelection('*', '*');
                    break;
                case 'strikethrough':
                    wrapSelection('~~', '~~');
                    break;
                case 'heading':
                    wrapSelection('#'.repeat(parseInt(level)) + ' ');
                    break;
                case 'quote':
                    wrapSelection('> ');
                    break;
                case 'code':
                    if (sel.selectedText.includes('\n')) {
                        wrapSelection('```\n', '\n```');
                    } else {
                        wrapSelection('`', '`');
                    }
                    break;
                case 'hr':
                    insertText('\n---\n', sel.start, sel.end);
                    break;
                case 'link':
                    insertLink();
                    break;
                case 'image':
                    const altText = sel.selectedText || '图片描述';
                    const imageUrl = prompt('请输入图片地址:', 'https://');
                    if (imageUrl) {
                        insertText(`![${altText}](${imageUrl})`, sel.start, sel.end);
                    }
                    break;
            }
        });
    });
    
    // 图片粘贴上传
    contentTextarea?.addEventListener('paste', async function(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await uploadPastedImage(file);
                }
                break;
            }
        }
    });
    
    async function uploadPastedImage(file) {
        await uploadImage(file);
    }
    
    // 图片上传功能
    async function uploadImage(file) {
        const status = showUploadStatus('正在上传图片...', 'blue');
        
        try {
            // 检查是否配置了图片上传
            if (!window.ImageUploader) {
                throw new Error('图片上传服务未加载');
            }
            
            const uploader = new ImageUploader(GitMDConfig);
            const imageUrl = await uploader.upload(file);
            
            // 插入Markdown图片语法
            const sel = getSelection();
            const altText = file.name.replace(/\.[^/.]+$/, '') || '图片';
            insertText(`![${altText}](${imageUrl})`, sel.start, sel.end);
            
            showUploadStatus('图片上传成功!', 'green');
        } catch (error) {
            showUploadStatus('上传失败: ' + error.message, 'red');
            console.error('图片上传失败:', error);
        }
    }
    
    // 工具栏图片上传按钮
    const imageUploadBtn = document.querySelector('[data-action="upload-image"]');
    const imageInput = document.getElementById('image-upload-input');
    
    imageUploadBtn?.addEventListener('click', function() {
        imageInput?.click();
    });
    
    imageInput?.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (file) {
            await uploadImage(file);
            this.value = ''; // 清空input
        }
    });
    
    function showUploadStatus(message, color) {
        let el = document.getElementById('upload-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'upload-status';
            Object.assign(el.style, {
                position: 'fixed', bottom: '20px', right: '20px',
                padding: '10px 20px', borderRadius: '4px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)', zIndex: '9999'
            });
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.style.color = color;
        el.style.background = color === 'green' ? '#d4edda' : color === 'red' ? '#f8d7da' : '#fff';
        setTimeout(() => el.remove(), 3000);
        return el;
    }
});
