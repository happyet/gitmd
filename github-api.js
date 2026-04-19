// GitHub API 封装
class GitHubAPI {
    constructor(config) {
        this.owner = config.github.owner;
        this.repo = config.github.repo;
        // 使用 getter 获取当前内容路径
        this.getContentPath = () => config.contentPath;
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
                    content: decodeURIComponent(escape(atob(data.content))),
                    sha: data.sha
                };
            }
            return null;
        } catch (error) {
            // 文件不存在时返回null
            if (error.message.includes('Not Found') || error.message.includes('404')) {
                return null;
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
            // 目录不存在时返回空数组
            if (error.message.includes('Not Found') || error.message.includes('404')) {
                return [];
            }
            throw error;
        }
    }
    
    // 获取所有文章列表（优化版）
    async getArticles(options = {}) {
        const { 
            skipContent = false,  // 是否跳过内容获取
            useCache = true,      // 是否使用缓存
            cacheKey = null       // 自定义缓存键
        } = options;
        
        const contentPath = this.getContentPath();
        
        // 检查ETag缓存
        if (useCache && cacheKey) {
            const cached = await this.checkETagCache(cacheKey);
            if (cached) {
                console.log('使用ETag缓存');
                return cached;
            }
        }
        
        // 获取文件列表
        const files = await this.getDirectory(contentPath);
        const articles = [];
        
        for (const file of files) {
            if (file.name.endsWith('.md')) {
                try {
                    if (skipContent) {
                        // 快速模式：只获取基本信息
                        articles.push({
                            filename: file.name,
                            sha: file.sha,
                            title: file.name.replace('.md', ''),
                            date: file.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || new Date().toISOString(),
                            size: file.size
                        });
                    } else {
                        // 完整模式：获取文章内容
                        const fileData = await this.getFile(`${contentPath}/${file.name}`);
                        if (fileData) {
                            const article = this.parseArticle(fileData.content, file.name);
                            articles.push({
                                ...article,
                                filename: file.name,
                                sha: fileData.sha
                            });
                        }
                    }
                } catch (error) {
                    console.error(`解析文章失败: ${file.name}`, error);
                }
            }
        }
        
        // 按日期排序
        const sorted = articles.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // 保存ETag缓存
        if (useCache && cacheKey) {
            await this.saveETagCache(cacheKey, sorted);
        }
        
        return sorted;
    }
    
    // ETag缓存检查
    async checkETagCache(key) {
        try {
            const cacheData = localStorage.getItem(`etag_${key}`);
            if (!cacheData) return null;
            
            const { data, timestamp, etag } = JSON.parse(cacheData);
            
            // 检查缓存是否过期（10分钟）
            if (Date.now() - timestamp > 10 * 60 * 1000) {
                return null;
            }
            
            return data;
        } catch {
            return null;
        }
    }
    
    // 保存ETag缓存
    async saveETagCache(key, data) {
        try {
            localStorage.setItem(`etag_${key}`, JSON.stringify({
                data,
                timestamp: Date.now(),
                etag: Date.now().toString()
            }));
        } catch (error) {
            console.warn('缓存保存失败:', error);
        }
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
}

// 导出
window.GitHubAPI = GitHubAPI;
