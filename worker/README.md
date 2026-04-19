# GitMD Worker 部署指南

## 功能说明

GitMD Worker 是一个统一的 Cloudflare Worker，提供以下功能：

1. **GitHub API 代理** - 安全地代理 GitHub API 请求
2. **R2 图片上传** - 上传图片到 Cloudflare R2 存储
3. **CORS 支持** - 跨域请求支持

## 部署步骤

### 方式一：使用 Cloudflare Dashboard（推荐）

#### 1. 创建 Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 `Workers & Pages`
3. 点击 `Create application`
4. 选择 `Create Worker`
5. 名称输入：`gitmd-worker`
6. 点击 `Deploy`

#### 2. 编辑 Worker 代码

1. 部署后点击 `Edit code`
2. 将 `worker/worker.js` 的内容复制粘贴进去
3. 点击 `Save and Deploy`

#### 3. 配置环境变量

1. 进入 Worker 详情页
2. 点击 `Settings` → `Variables`
3. 添加环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `GITHUB_TOKEN` | `ghp_xxxx` | GitHub Personal Access Token |

#### 4. 配置 R2（可选）

如果需要图片上传功能：

1. 创建 R2 存储桶
   - 进入 `R2` → `Create bucket`
   - 名称：`gitmd-images`
   - 点击 `Create bucket`

2. 绑定 R2 到 Worker
   - 进入 Worker `Settings` → `Bindings`
   - 点击 `Add binding` → `R2 bucket binding`
   - Variable name: `R2_BUCKET`
   - R2 bucket: 选择 `gitmd-images`

3. 添加 R2 环境变量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `R2_PUBLIC_URL` | `https://gitmd-images.your-subdomain.r2.dev` | R2 公共访问 URL |
| `R2_BUCKET_NAME` | `gitmd-images` | R2 存储桶名称 |

#### 5. 配置自定义域名（可选）

1. 进入 Worker `Settings` → `Triggers`
2. 点击 `Add custom domain`
3. 输入：`md.yourdomain.com`

### 方式二：使用 Wrangler CLI

#### 1. 安装 Wrangler

```bash
npm install -g wrangler
```

#### 2. 登录 Cloudflare

```bash
wrangler login
```

#### 3. 配置 wrangler.toml

编辑 `worker/wrangler.toml`：

```toml
name = "gitmd-worker"
main = "worker.js"
compatibility_date = "2024-01-01"

# R2存储桶绑定（如果使用R2图片上传）
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "gitmd-images"

# 环境变量
[vars]
R2_PUBLIC_URL = "https://gitmd-images.your-subdomain.r2.dev"
R2_BUCKET_NAME = "gitmd-images"
```

**注意**：`GITHUB_TOKEN` 不要写在配置文件中，使用命令设置：

```bash
wrangler secret put GITHUB_TOKEN
# 然后输入你的 GitHub Token
```

#### 4. 部署

```bash
cd /var/www/html/gitmd/worker
wrangler deploy
```

## 使用配置

### config.js 配置

部署完成后，更新 `config.js`：

```javascript
// API代理配置
api: {
    proxyUrl: 'https://gitmd-worker.your-subdomain.workers.dev',
    // 或使用自定义域名
    // proxyUrl: 'https://md.yourdomain.com',
    useProxy: true
},

// 图片上传配置（如果使用R2）
imageUpload: {
    provider: 'r2',
    maxSize: 5 * 1024 * 1024,
    r2: {
        workerUrl: 'https://gitmd-worker.your-subdomain.workers.dev'
        // 或使用自定义域名
        // workerUrl: 'https://md.yourdomain.com'
    }
}
```

## API 端点

### GitHub API 代理

```
GET/POST/PUT/DELETE https://your-worker.workers.dev/repos/{owner}/{repo}/contents/{path}
```

### 健康检查

```
GET https://your-worker.workers.dev/health
```

响应：
```json
{
    "status": "ok",
    "timestamp": "2024-04-19T12:00:00.000Z"
}
```

### R2 图片上传

```
POST https://your-worker.workers.dev/upload
Content-Type: multipart/form-data

file: [图片文件]
```

响应：
```json
{
    "success": true,
    "url": "https://your-bucket.r2.dev/1713520000000-abc123.jpg",
    "filename": "1713520000000-abc123.jpg"
}
```

### R2 图片删除

```
DELETE https://your-worker.workers.dev/delete/{filename}
```

### R2 图片列表

```
GET https://your-worker.workers.dev/list
```

响应：
```json
{
    "files": [
        {
            "key": "1713520000000-abc123.jpg",
            "size": 123456,
            "uploaded": "2024-04-19T12:00:00.000Z"
        }
    ]
}
```

## 环境变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `GITHUB_TOKEN` | ✅ | GitHub Personal Access Token |
| `R2_BUCKET` | ❌ | R2 存储桶绑定（通过 Binding 设置） |
| `R2_PUBLIC_URL` | ❌ | R2 公共访问 URL |
| `R2_BUCKET_NAME` | ❌ | R2 存储桶名称 |

## 费用说明

### Cloudflare Workers

- **免费额度**：每天 100,000 次请求
- **超出费用**：$0.50 / 百万次请求

### Cloudflare R2

- **免费额度**：
  - 存储：10 GB
  - Class A 操作：每月 100 万次
  - Class B 操作：每月 1000 万次
- **超出费用**：
  - 存储：$0.015 / GB / 月
  - Class A 操作：$4.50 / 百万次
  - Class B 操作：$0.36 / 百万次

## 故障排查

### 1. GitHub API 请求失败

**症状**：返回 401 或 403 错误

**解决**：
- 检查 `GITHUB_TOKEN` 是否正确设置
- 检查 Token 权限是否包含 `repo` 权限
- 检查 Token 是否过期

### 2. R2 上传失败

**症状**：返回 "R2未配置" 错误

**解决**：
- 检查 R2 存储桶是否创建
- 检查 Worker 是否绑定了 R2 存储桶
- 检查 `R2_BUCKET` binding 是否正确

### 3. CORS 错误

**症状**：浏览器控制台显示 CORS 错误

**解决**：
- Worker 已内置 CORS 支持
- 检查请求是否包含正确的 headers

### 4. 图片无法访问

**症状**：上传成功但图片 URL 无法访问

**解决**：
- 检查 R2 存储桶是否开启公共访问
- 检查 `R2_PUBLIC_URL` 是否正确
- 或配置 R2 自定义域名

## 安全建议

1. **不要在代码中硬编码 Token**
   - 使用 Cloudflare 环境变量
   - 使用 `wrangler secret` 命令

2. **限制 Token 权限**
   - 只授予必要的 `repo` 权限
   - 定期轮换 Token

3. **启用 Rate Limiting**
   - Cloudflare Workers 自动提供 Rate Limiting
   - 可在 Dashboard 中配置额外限制

4. **监控使用情况**
   - 定期检查 Workers 使用统计
   - 设置使用量告警

## 更新 Worker

### Dashboard 方式

1. 进入 Worker 详情页
2. 点击 `Edit code`
3. 修改代码
4. 点击 `Save and Deploy`

### CLI 方式

```bash
cd /var/www/html/gitmd/worker
wrangler deploy
```

## 回滚

### Dashboard 方式

1. 进入 Worker 详情页
2. 点击 `Deployments`
3. 找到之前的版本
4. 点击 `Rollback`

### CLI 方式

```bash
wrangler rollback
```
