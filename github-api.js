// GitHub API 封装
class GitHubAPI {
    constructor(config) {
        this.owner = config.github.owner;
        this.repo = config.github.repo;
        this.contentPath = config.github.contentPath;
        this.dataPath = config.github.dataPath;
        this.apiBase = config.apiBase;
        this.useProxy = config.api.useProxy;
        this.token = config.githubToken; // 仅在不使用代理时需要
    }
    
    // 通用请求方法
    async request(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        
        // 准备请求头
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        // 如果不使用代理，需要添加Authorization
        if (!this.useProxy && this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || '请求失败');
            }
            
            // 对于204 No Content等没有响应体的情况
            if (response.status === 204) {
                return null;
            }
            
            return await response.json();
        } catch (error) {
            console.error('GitHub API Error:', error);
            throw error;
        }
    }
    
    // 获取文件内容
    async getFile(path) {
        try {
            const data = await this.request(`/repos/${this.owner}/${this.repo}/contents/${path}`);
            if (data.content) {
                return {
                    content: atob(data.content),
                    sha: data.sha
                };
            }
            return null;
        } catch (error) {
            if (error.message.includes('404')) {
                return null; // 文件不存在
            }
            throw error;
        }
    }
    
    // 创建或更新文件
    async saveFile(path, content, message, sha = null) {
        const body = {
            message,
            content: btoa(unescape(encodeURIComponent(content)))
        };
        
        if (sha) {
            body.sha = sha;
        }
        
        return await this.request(`/repos/${this.owner}/${this.repo}/contents/${path}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }
    
    // 删除文件
    async deleteFile(path, message, sha) {
        return await this.request(`/repos/${this.owner}/${this.repo}/contents/${path}`, {
            method: 'DELETE',
            body: JSON.stringify({
                message,
                sha
            })
        });
    }
    
    // 获取目录内容列表
    async getDirectory(path) {
        try {
            return await this.request(`/repos/${this.owner}/${this.repo}/contents/${path}`);
        } catch (error) {
            if (error.message.includes('404')) {
                return [];
            }
            throw error;
        }
    }
    
    // 获取所有文章列表
    async getArticles() {
        const files = await this.getDirectory(this.contentPath);
        const articles = [];
        
        for (const file of files) {
            if (file.name.endsWith('.md')) {
                try {
                    const fileData = await this.getFile(`${this.contentPath}/${file.name}`);
                    if (fileData) {
                        const article = this.parseArticle(fileData.content, file.name);
                        articles.push({
                            ...article,
                            filename: file.name,
                            sha: fileData.sha
                        });
                    }
                } catch (error) {
                    console.error(`解析文章失败: ${file.name}`, error);
                }
            }
        }
        
        // 按日期排序
        return articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    // 解析文章内容
    parseArticle(content, filename) {
        const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
        const match = content.match(frontMatterRegex);
        
        if (!match) {
            return {
                title: filename,
                date: new Date().toISOString(),
                author: '',
                categories: [],
                tags: [],
                content: content,
                comments: true,
                showThumbnail: true
            };
        }
        
        const frontMatter = match[1];
        const body = match[2];
        
        const data = {
            title: '',
            date: new Date().toISOString(),
            author: '',
            categories: [],
            tags: [],
            content: body,
            comments: true,
            showThumbnail: true
        };
        
        // 解析front matter
        const lines = frontMatter.split('\n');
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;
            
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();
            
            // 移除引号
            value = value.replace(/^['"]|['"]$/g, '');
            
            switch (key) {
                case 'title':
                    data.title = value;
                    break;
                case 'date':
                    data.date = value;
                    break;
                case 'author':
                    data.author = value;
                    break;
                case 'categories':
                    data.categories = value.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                    break;
                case 'tags':
                    data.tags = value.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                    break;
                case 'comments':
                    data.comments = value === 'true';
                    break;
                case 'showThumbnail':
                    data.showThumbnail = value === 'true';
                    break;
            }
        }
        
        return data;
    }
    
    // 生成文章内容
    generateArticleContent(article) {
        const frontMatter = [
            '---',
            `title: '${article.title.replace(/'/g, "\\'")}'`,
            `date: ${article.date}`,
            `author: '${article.author.replace(/'/g, "\\'")}'`,
            `categories: [${article.categories.map(c => `'${c}'`).join(', ')}]`,
            `tags: [${article.tags.map(t => `'${t}'`).join(', ')}]`,
            `comments: ${article.comments}`,
            `showThumbnail: ${article.showThumbnail}`,
            '---'
        ].join('\n');
        
        return `${frontMatter}\n\n${article.content}`;
    }
    
    // 加载分类
    async loadCategories() {
        try {
            const fileData = await this.getFile(`${this.dataPath}/categories.json`);
            if (fileData) {
                return JSON.parse(fileData.content);
            }
        } catch (error) {
            console.error('加载分类失败', error);
        }
        return {};
    }
    
    // 保存分类
    async saveCategories(categories) {
        const content = JSON.stringify(categories, null, 2);
        const existingFile = await this.getFile(`${this.dataPath}/categories.json`);
        return await this.saveFile(
            `${this.dataPath}/categories.json`,
            content,
            '更新分类配置',
            existingFile?.sha
        );
    }
    
    // 加载标签
    async loadTags() {
        try {
            const fileData = await this.getFile(`${this.dataPath}/tags.json`);
            if (fileData) {
                return JSON.parse(fileData.content);
            }
        } catch (error) {
            console.error('加载标签失败', error);
        }
        return [];
    }
    
    // 保存标签
    async saveTags(tags) {
        const content = JSON.stringify(tags, null, 2);
        const existingFile = await this.getFile(`${this.dataPath}/tags.json`);
        return await this.saveFile(
            `${this.dataPath}/tags.json`,
            content,
            '更新标签配置',
            existingFile?.sha
        );
    }
}

// 导出
window.GitHubAPI = GitHubAPI;
