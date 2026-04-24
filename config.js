// GitMD 配置文件
const CONFIG = {
    // GitHub 配置
    github: {
        // 你的GitHub用户名
        owner: 'happyet',
        // 仓库名称
        repo: 'lmsim',
        // 存放markdown文件的文件夹路径（相对于仓库根目录）
        // 支持多个目录，可以在界面上切换
        contentPaths: {
            'post': 'content/post',      // 文章
            'page': 'content/page'       // 页面
        },
        // 当前使用的目录（默认）
        currentPath: 'post'
    },
    
    // 获取当前内容路径
    get contentPath() {
        return this.github.contentPaths[this.github.currentPath];
    },
    
    // API代理配置（使用Cloudflare Workers）
    api: {
        // Worker代理URL（部署Worker后填入）
        proxyUrl: 'https://mdworker.lms.im',
        // 是否使用代理（true=使用Worker，false=直接使用Token）
        useProxy: true
    },
    
    // GitHub Personal Access Token
    // 注意：如果使用Worker代理，这里可以留空
    // 如果不使用代理，需要填入token
    githubToken: '',
    
    // 默认作者
    defaultAuthor: 'LMS',
    
    // 图片上传配置
    imageUpload: {
        // 上传服务: 'worker' | 'none'
        // worker: 通过Worker代理上传（推荐，安全）
        // none: 不使用图片上传
        provider: 'worker',
        
        // 最大文件大小（字节）
        maxSize: 5 * 1024 * 1024, // 5MB
        
        // Worker URL（用于图片上传）
        // 如果使用Worker代理，填写Worker URL
        workerUrl: 'https://mdworker.lms.im'  // 如: https://gitmd-worker.xxx.workers.dev
    },
    
    // 文件命名格式
    fileNameFormat: (title, date) => {
        const dateStr = new Date(date).toISOString().split('T')[0];
        const slug = title.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return `${dateStr}-${slug}.md`;
    },
    
    // API基础URL（通过代理）
    get apiBase() {
        return CONFIG.api.useProxy ? CONFIG.api.proxyUrl : 'https://api.github.com';
    },
    
    // 分页配置
    perPage: 30
};

// 切换内容目录
function switchContentPath(pathName) {
    if (CONFIG.github.contentPaths[pathName]) {
        CONFIG.github.currentPath = pathName;
        localStorage.setItem('gitmd_current_path', pathName);
        return true;
    }
    return false;
}

// 获取所有可用的内容目录
function getAvailablePaths() {
    return Object.keys(CONFIG.github.contentPaths);
}

// 检查配置
function checkConfig() {
    // 检查GitHub配置
    if (!CONFIG.github.owner || CONFIG.github.owner === 'your-username') {
        alert('请先配置GitHub信息！\n\n1. 打开 config.js\n2. 修改 github.owner 为你的用户名\n3. 修改 github.repo 为你的仓库名');
        return false;
    }
    
    // 检查API配置
    if (CONFIG.api.useProxy) {
        if (!CONFIG.api.proxyUrl || CONFIG.api.proxyUrl.includes('your-subdomain')) {
            alert('请配置Worker代理URL！\n\n1. 部署Cloudflare Worker\n2. 获取Worker URL\n3. 在 config.js 中设置 api.proxyUrl');
            return false;
        }
    } else {
        if (!CONFIG.githubToken) {
            alert('请配置GitHub Personal Access Token！\n\n获取方法：\n1. 访问 https://github.com/settings/tokens\n2. 点击 "Generate new token (classic)"\n3. 勾选 "repo" 权限\n4. 生成并复制token到 config.js');
            return false;
        }
    }
    
    return true;
}

// 恢复上次选择的目录
const savedPath = localStorage.getItem('gitmd_current_path');
if (savedPath && CONFIG.github.contentPaths[savedPath]) {
    CONFIG.github.currentPath = savedPath;
}

// 导出配置
window.GitMDConfig = CONFIG;
window.checkConfig = checkConfig;
window.switchContentPath = switchContentPath;
window.getAvailablePaths = getAvailablePaths;
