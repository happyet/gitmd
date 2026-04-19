/**
 * 图片上传服务
 * 通过 Worker 代理上传（安全）
 */

class ImageUploader {
    constructor(config) {
        this.config = config.imageUpload || {};
        this.provider = this.config.provider || 'none';
        this.workerUrl = this.config.workerUrl || '';
        this.maxSize = this.config.maxSize || 5 * 1024 * 1024;
    }
    
    /**
     * 上传图片
     * @param {File} file - 图片文件
     * @returns {Promise<string>} - 图片URL
     */
    async upload(file) {
        if (this.provider === 'none') {
            throw new Error('未配置图片上传服务');
        }
        
        if (this.provider === 'worker') {
            return await this.uploadViaWorker(file);
        }
        
        throw new Error('不支持的上传方式');
    }
    
    /**
     * 通过 Worker 上传
     */
    async uploadViaWorker(file) {
        if (!this.workerUrl) {
            throw new Error('未配置 Worker URL');
        }
        
        // 验证文件
        if (!file.type.startsWith('image/')) {
            throw new Error('只能上传图片文件');
        }
        
        if (file.size > this.maxSize) {
            throw new Error(`图片大小不能超过 ${this.maxSize / 1024 / 1024}MB`);
        }
        
        try {
            // 创建FormData
            const formData = new FormData();
            formData.append('file', file);
            
            // 上传到Worker
            const response = await fetch(`${this.workerUrl}/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '上传失败');
            }
            
            const result = await response.json();
            return result.url;
            
        } catch (error) {
            throw new Error(`上传失败: ${error.message}`);
        }
    }
}

// 导出
window.ImageUploader = ImageUploader;
