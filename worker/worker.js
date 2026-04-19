/**
 * GitMD Cloudflare Worker - GitHub API 代理
 * 
 * 功能：
 * 1. 安全地存储GitHub Token
 * 2. 代理GitHub API请求
 * 3. 添加CORS支持
 * 4. 速率限制
 * 5. 请求日志
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // 处理CORS预检请求
        if (request.method === 'OPTIONS') {
            return handleCORS();
        }
        
        // 健康检查
        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ 
                status: 'ok', 
                timestamp: new Date().toISOString() 
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 验证Token是否配置
        if (!env.GITHUB_TOKEN) {
            return new Response(JSON.stringify({ 
                error: 'GitHub Token未配置',
                message: '请在Cloudflare Workers环境变量中设置GITHUB_TOKEN'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        // 速率限制检查（可选）
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateLimitKey = `rate-limit:${clientIP}`;
        
        try {
            // 检查速率限制
            const rateLimitResult = await checkRateLimit(env, rateLimitKey);
            if (rateLimitResult.exceeded) {
                return new Response(JSON.stringify({
                    error: '速率限制',
                    message: '请求过于频繁，请稍后再试',
                    retryAfter: rateLimitResult.retryAfter
                }), {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(rateLimitResult.retryAfter),
                        ...corsHeaders
                    }
                });
            }
            
            // 构建GitHub API URL
            const githubApiUrl = `https://api.github.com${url.pathname}${url.search}`;
            
            // 准备请求头
            const headers = {
                'Authorization': `token ${env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'GitMD-Worker/1.0'
            };
            
            // 如果有请求体，添加Content-Type
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                headers['Content-Type'] = 'application/json';
            }
            
            // 构建请求选项
            const requestOptions = {
                method: request.method,
                headers: headers
            };
            
            // 如果有请求体，转发请求体
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                const body = await request.text();
                if (body) {
                    requestOptions.body = body;
                }
            }
            
            // 发送请求到GitHub API
            const githubResponse = await fetch(githubApiUrl, requestOptions);
            
            // 检查GitHub API响应
            if (!githubResponse.ok) {
                const errorBody = await githubResponse.text();
                console.error('GitHub API Error:', {
                    status: githubResponse.status,
                    statusText: githubResponse.statusText,
                    body: errorBody,
                    url: githubApiUrl
                });
                
                return new Response(errorBody, {
                    status: githubResponse.status,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }
            
            // 成功响应
            const responseBody = await githubResponse.text();
            
            // 记录成功请求（可选）
            ctx.waitUntil(
                logRequest(env, {
                    ip: clientIP,
                    method: request.method,
                    path: url.pathname,
                    status: githubResponse.status,
                    timestamp: new Date().toISOString()
                })
            );
            
            return new Response(responseBody, {
                status: githubResponse.status,
                headers: {
                    'Content-Type': 'application/json',
                    'X-RateLimit-Remaining': githubResponse.headers.get('X-RateLimit-Remaining') || 'unknown',
                    'X-RateLimit-Limit': githubResponse.headers.get('X-RateLimit-Limit') || 'unknown',
                    ...corsHeaders
                }
            });
            
        } catch (error) {
            console.error('Worker Error:', error);
            
            return new Response(JSON.stringify({
                error: '服务器错误',
                message: error.message
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
    }
};

// CORS头
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
};

// 处理CORS预检请求
function handleCORS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders
    });
}

// 速率限制检查
async function checkRateLimit(env, key) {
    // 如果没有KV命名空间，跳过速率限制
    if (!env.RATE_LIMIT_KV) {
        return { exceeded: false };
    }
    
    const limit = 100; // 每分钟最多100次请求
    const window = 60; // 时间窗口：60秒
    
    try {
        // 获取当前计数
        const current = await env.RATE_LIMIT_KV.get(key);
        const count = current ? parseInt(current) : 0;
        
        if (count >= limit) {
            const ttl = await env.RATE_LIMIT_KV.get(key + ':ttl');
            return {
                exceeded: true,
                retryAfter: ttl ? parseInt(ttl) : window
            };
        }
        
        // 增加计数
        await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: window });
        
        return { exceeded: false };
    } catch (error) {
        console.error('Rate limit check failed:', error);
        return { exceeded: false }; // 出错时允许请求
    }
}

// 记录请求日志
async function logRequest(env, data) {
    // 如果没有KV命名空间，跳过日志
    if (!env.LOGS_KV) {
        return;
    }
    
    try {
        const logKey = `log:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
        await env.LOGS_KV.put(logKey, JSON.stringify(data), { expirationTtl: 86400 }); // 保留1天
    } catch (error) {
        console.error('Log failed:', error);
    }
}
