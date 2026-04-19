/**
 * GitMD Cloudflare Worker
 * 功能：
 * 1. GitHub API 代理
 * 2. R2 图片上传
 * 3. 又拍云图片上传（通过Worker代理）
 * 4. CORS 支持
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // CORS预检
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Max-Age': '86400'
                }
            });
        }
        
        // 路由分发
        if (url.pathname === '/health') {
            return handleHealth();
        }
        
        if (url.pathname === '/upload' && request.method === 'POST') {
            return await handleUpload(request, env);
        }
        
        if (url.pathname.startsWith('/delete/') && request.method === 'DELETE') {
            return await handleDelete(request, env);
        }
        
        if (url.pathname === '/list') {
            return await handleList(request, env);
        }
        
        // 默认：GitHub API代理
        return await handleGitHubAPI(request, env, ctx);
    }
};

/**
 * 健康检查
 */
function handleHealth() {
    return new Response(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString() 
    }), {
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

/**
 * GitHub API 代理
 */
async function handleGitHubAPI(request, env, ctx) {
    const url = new URL(request.url);
    
    // 验证Token
    if (!env.GITHUB_TOKEN) {
        return new Response(JSON.stringify({ 
            error: 'GitHub Token未配置',
            message: '请在Cloudflare Workers环境变量中设置GITHUB_TOKEN'
        }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
    
    try {
        // 构建GitHub API URL
        const githubApiUrl = `https://api.github.com${url.pathname}${url.search}`;
        
        // 准备请求头
        const headers = {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitMD-Worker/1.0'
        };
        
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            headers['Content-Type'] = 'application/json';
        }
        
        // 构建请求
        const requestOptions = {
            method: request.method,
            headers: headers
        };
        
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            const body = await request.text();
            if (body) {
                requestOptions.body = body;
            }
        }
        
        // 发送请求
        const githubResponse = await fetch(githubApiUrl, requestOptions);
        
        if (!githubResponse.ok) {
            const errorBody = await githubResponse.text();
            return new Response(errorBody, {
                status: githubResponse.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        const responseBody = await githubResponse.text();
        
        return new Response(responseBody, {
            status: githubResponse.status,
            headers: {
                'Content-Type': 'application/json',
                'X-RateLimit-Remaining': githubResponse.headers.get('X-RateLimit-Remaining') || 'unknown',
                'X-RateLimit-Limit': githubResponse.headers.get('X-RateLimit-Limit') || 'unknown',
                'Access-Control-Allow-Origin': '*'
            }
        });
        
    } catch (error) {
        return new Response(JSON.stringify({
            error: '服务器错误',
            message: error.message
        }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}

/**
 * 统一图片上传处理
 * 自动选择 R2 或又拍云
 */
async function handleUpload(request, env) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
            return jsonResponse({ error: '未找到文件' }, 400);
        }
        
        // 验证文件类型
        if (!file.type.startsWith('image/')) {
            return jsonResponse({ error: '只能上传图片' }, 400);
        }
        
        // 验证文件大小（最大10MB）
        if (file.size > 10 * 1024 * 1024) {
            return jsonResponse({ error: '文件太大，最大10MB' }, 400);
        }
        
        // 优先使用 R2
        if (env.R2_BUCKET) {
            return await uploadToR2(file, env);
        }
        
        // 其次使用又拍云
        if (env.UPYUN_BUCKET && env.UPYUN_OPERATOR && env.UPYUN_PASSWORD) {
            return await uploadToUpyun(file, env);
        }
        
        return jsonResponse({ error: '未配置图片上传服务' }, 500);
        
    } catch (error) {
        console.error('Upload error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}

/**
 * 上传到 R2
 */
async function uploadToR2(file, env) {
    // 生成文件名
    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${ext}`;
    
    // 上传到R2
    await env.R2_BUCKET.put(filename, file.stream(), {
        httpMetadata: {
            contentType: file.type
        }
    });
    
    // 返回URL
    const publicUrl = env.R2_PUBLIC_URL || `https://${env.R2_BUCKET_NAME}.r2.dev`;
    const imageUrl = `${publicUrl}/${filename}`;
    
    return jsonResponse({
        success: true,
        url: imageUrl,
        filename: filename,
        provider: 'r2'
    });
}

/**
 * 上传到又拍云
 */
async function uploadToUpyun(file, env) {
    const bucket = env.UPYUN_BUCKET;
    const operator = env.UPYUN_OPERATOR;
    const password = env.UPYUN_PASSWORD;
    const path = env.UPYUN_PATH || 'images';
    const domain = env.UPYUN_DOMAIN || `https://${bucket}.test.upcdn.net`;
    
    // 生成文件名
    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${random}.${ext}`;
    const uploadPath = `/${path}/${filename}`;
    
    // 又拍云API地址
    const api = `https://v0.api.upyun.com/${bucket}${uploadPath}`;
    
    // 计算签名
    const date = new Date().toUTCString();
    const signature = await generateUpyunSignature('PUT', uploadPath, date, file.size, operator, password, bucket);
    
    // 上传
    const response = await fetch(api, {
        method: 'PUT',
        headers: {
            'Authorization': signature,
            'Date': date,
            'Content-Type': file.type
        },
        body: file
    });
    
    if (!response.ok) {
        throw new Error(`又拍云上传失败: ${response.status}`);
    }
    
    // 返回URL
    const imageUrl = `${domain}${uploadPath}`;
    
    return jsonResponse({
        success: true,
        url: imageUrl,
        filename: filename,
        provider: 'upyun'
    });
}

/**
 * 生成又拍云签名
 */
async function generateUpyunSignature(method, path, date, length, operator, password, bucket) {
    const stringToSign = [method, `/${bucket}${path}`, date, length].join('&');
    
    // 使用Web Crypto API计算HMAC-SHA1
    const encoder = new TextEncoder();
    const keyData = encoder.encode(password);
    const messageData = encoder.encode(stringToSign);
    
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    
    return `UPYUN ${operator}:${signatureBase64}`;
}

/**
 * 统一删除处理
 */
async function handleDelete(request, env) {
    try {
        const url = new URL(request.url);
        const filename = url.pathname.replace('/delete/', '');
        
        // 优先使用 R2
        if (env.R2_BUCKET) {
            await env.R2_BUCKET.delete(filename);
            return jsonResponse({ success: true, provider: 'r2' });
        }
        
        // 又拍云删除需要额外实现
        return jsonResponse({ error: '删除功能暂不支持' }, 400);
        
    } catch (error) {
        return jsonResponse({ error: error.message }, 500);
    }
}

/**
 * 统一列表处理
 */
async function handleList(request, env) {
    try {
        // 优先使用 R2
        if (env.R2_BUCKET) {
            const list = await env.R2_BUCKET.list();
            const files = list.objects.map(obj => ({
                key: obj.key,
                size: obj.size,
                uploaded: obj.uploaded
            }));
            return jsonResponse({ files, provider: 'r2' });
        }
        
        return jsonResponse({ error: '列表功能暂不支持' }, 400);
        
    } catch (error) {
        return jsonResponse({ error: error.message }, 500);
    }
}

/**
 * JSON响应辅助函数
 */
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
