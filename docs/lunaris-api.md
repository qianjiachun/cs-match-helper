# Lunaris CDN API 文档

[Lunaris](https://lunaris.win/) 是面向版本化文件的第三方 CDN 服务，适用于在国内分发安装包等大文件。本文档汇总其 REST API 与 CDN 访问方式，供 CS 匹配助手发版与自动更新对接使用。

官方文档：<https://lunaris.win/docs>

---

## 基础信息

| 项目 | 说明 |
|------|------|
| API Base URL | `https://lunaris.win/api/v1` |
| CDN 域名 | `https://cdn.lunaris.win` |
| 认证 | 所有 API 端点均需认证 |
| 默认存储配额 | 100 GB / 账户 |
| 单文件大小上限 | 5 GB |
| 上传分片大小 | 50 MB（最后一片最小 5 MB） |
| 上传会话有效期 | 24 小时 |

### 认证方式

**1. API Key（推荐，用于 CI/CD 与程序化访问）**

在 Dashboard 生成 API Key，请求头携带：

```http
Authorization: Bearer YOUR_API_KEY
```

**2. Session Cookie**

在浏览器登录后自动携带，无需额外 Header。

### 错误响应

所有错误返回 JSON，含 `error` 字段及对应 HTTP 状态码：

```json
{ "error": "Unauthorized" }
```

| HTTP 状态码 | 含义 |
|-------------|------|
| 400 | 校验失败 |
| 401 | 未授权 |
| 403 | 禁止访问（如 Admin 端点权限不足） |
| 404 | 资源不存在 |
| 413 | 超出存储配额 |

---

## 核心概念

- **Project**：版本化文件的容器，由名称自动生成唯一 `slug`。
- **Version**：项目下的版本，以 `tag` 标识（如 `2.1.0`）；同一项目仅有一个 `isLatest: true` 的版本。
- **File**：版本内的文件，可通过 CDN URL 公开访问（项目需 `isPublic: true`）。

---

## Projects

### 列出所有项目

```http
GET /projects
```

**响应 200**

```json
{
  "projects": [
    {
      "id": "abc123",
      "name": "My App",
      "slug": "my-app",
      "description": "Windows installer",
      "isPublic": true,
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

### 创建项目

```http
POST /projects
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 1–100 字符 |
| `description` | string | 否 | 最多 500 字符 |
| `isPublic` | boolean | 否 | 默认 `true` |

**响应 201**：`{ "project": { ... } }`

### 获取项目及版本列表

```http
GET /projects/{slug}
```

**响应 200**

```json
{
  "project": { "id": "abc123", "slug": "my-app", ... },
  "versions": [
    { "id": "v1", "tag": "2.1.0", "isLatest": true, "createdAt": "..." }
  ]
}
```

### 更新项目

```http
PATCH /projects/{slug}
```

请求体字段均为可选：`name`、`description`、`isPublic`。

**响应 200**：`{ "project": { ... } }`

### 删除项目

```http
DELETE /projects/{slug}
```

永久删除项目及其所有版本、文件与存储对象，并回收配额。

**响应 200**：`{ "success": true }`

---

## Versions

### 列出版本

```http
GET /projects/{slug}/versions
```

**响应 200**

```json
{
  "versions": [
    { "id": "v1", "tag": "2.1.0", "isLatest": true, "createdAt": "..." },
    { "id": "v0", "tag": "2.0.0", "isLatest": false, "createdAt": "..." }
  ]
}
```

按创建时间倒序排列。

### 创建版本

```http
POST /projects/{slug}/versions
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `tag` | string | 是 | 1–64 字符，正则 `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` |

首个版本自动设为 `latest`。

**响应 201**：`{ "version": { ... } }`

### 获取版本及文件列表

```http
GET /projects/{slug}/versions/{tag}
```

**响应 200**

```json
{
  "version": { "id": "v1", "tag": "2.1.0", "isLatest": true },
  "files": [
    {
      "id": "f1",
      "fileName": "installer.exe",
      "filePath": "installer.exe",
      "sizeBytes": 298262528,
      "sha256": "a1b2c3...",
      "mimeType": "application/vnd.microsoft.portable-executable",
      "downloadCount": 142,
      "createdAt": "..."
    }
  ]
}
```

文件按 `fileName` 字母序排列。

### 设为最新版本

```http
POST /projects/{slug}/versions/{tag}/set-latest
```

清除同项目其他版本的 `latest` 标记，将当前版本提升为最新。无需请求体。

**响应 200**：`{ "success": true }`

### 删除版本

```http
DELETE /projects/{slug}/versions/{tag}
```

删除版本及其中所有文件。若删除的是 `latest` 版本，则自动将最近创建的剩余版本提升为 `latest`。

**响应 200**：`{ "success": true }`

---

## Upload（三步分片上传）

基于 Cloudflare R2 的多部分上传，支持最大 5 GB 文件。

### Step 1 — 初始化上传

```http
POST /upload/initiate
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `projectSlug` | string | 是 | 目标项目 slug |
| `versionTag` | string | 是 | 目标版本 tag |
| `fileName` | string | 是 | 原始文件名（1–255 字符） |
| `filePath` | string | 否 | 版本内路径，默认等于 `fileName` |
| `totalSize` | number | 是 | 文件总字节数（最大 5 GB） |

**响应 201**

```json
{
  "uploadSessionId": "session_abc123",
  "partSize": 52428800,
  "totalParts": 6,
  "expiresAt": "2024-01-16T10:00:00.000Z"
}
```

### Step 2 — 上传分片

```http
PUT /upload/part
```

**必填 Header**

| Header | 值 |
|--------|-----|
| `x-upload-session-id` | Step 1 返回的 session ID |
| `x-part-number` | 分片序号，从 1 开始 |

请求体为分片的原始二进制数据。分片可乱序上传，但不可重复上传同一分片。

**响应 200**

```json
{
  "partNumber": 1,
  "etag": "abc123def456",
  "uploadedCount": 1,
  "totalParts": 6
}
```

### Step 3 — 完成上传

```http
POST /upload/complete
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `uploadSessionId` | string | 是 | Step 1 返回的 session ID |
| `sha256` | string | 是 | 完整文件的 64 位十六进制 SHA-256 |

所有分片上传完成后调用，服务端组装对象、创建文件记录并更新配额。

**响应 200**

```json
{
  "file": {
    "id": "f1",
    "fileName": "installer.exe",
    "filePath": "installer.exe",
    "sizeBytes": 298262528,
    "sha256": "a1b2c3...",
    "mimeType": "application/vnd.microsoft.portable-executable"
  }
}
```

### 完整上传示例（JavaScript）

```javascript
async function uploadFile(file, projectSlug, versionTag, apiKey) {
  const BASE = 'https://lunaris.win/api/v1';
  const headers = { Authorization: `Bearer ${apiKey}` };

  const { uploadSessionId, partSize, totalParts } = await fetch(`${BASE}/upload/initiate`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectSlug,
      versionTag,
      fileName: file.name,
      totalSize: file.size,
    }),
  }).then((r) => r.json());

  for (let i = 0; i < totalParts; i++) {
    const start = i * partSize;
    const chunk = file.slice(start, start + partSize);
    await fetch(`${BASE}/upload/part`, {
      method: 'PUT',
      headers: {
        ...headers,
        'x-upload-session-id': uploadSessionId,
        'x-part-number': String(i + 1),
      },
      body: chunk,
    });
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const { file: result } = await fetch(`${BASE}/upload/complete`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadSessionId, sha256 }),
  }).then((r) => r.json());

  return result;
}
```

---

## CDN URL 规则

仅 **公开项目**（`isPublic: true`）中的文件可通过 CDN 访问。

URL 格式：

```
https://cdn.lunaris.win/{username}/{project}/{filepath}
```

| 场景 | URL 示例 | 缓存策略 |
|------|----------|----------|
| 指定版本 | `.../installer.exe?v=2.1.0` | `max-age=31536000, immutable` |
| 最新版本 | `.../installer.exe`（省略 `?v=`） | `max-age=300`（5 分钟） |
| 强制直链下载 | 追加 `?download` 或 `?download&v=2.1.0` | 始终返回原始文件流 |

浏览器请求（`Accept: text/html`）默认返回带样式的下载页；加 `?download` 可跳过该页面。

### 响应 Header

| Header | 说明 |
|--------|------|
| `X-Checksum-SHA256` | 文件 SHA-256 十六进制摘要 |
| `ETag` | `"<sha256>"` |
| `Content-Disposition` | `attachment; filename="<name>"` |
| `Cache-Control` | 版本化：`immutable`；最新：`max-age=300` |

### 下载并校验示例（JavaScript）

```javascript
const res = await fetch(
  'https://cdn.lunaris.win/acme/my-app/installer.exe?v=2.1.0&download'
);
const sha256 = res.headers.get('X-Checksum-SHA256');
const buffer = await res.arrayBuffer();
// 本地计算 SHA-256 后与 sha256 比对
```

---

## User

### 设置用户名

```http
POST /user/username
```

```json
{ "username": "my-username" }
```

用户名规则：2–39 字符，小写字母、数字、连字符，不能以连字符开头或结尾。

**响应 200**：`{ "success": true, "username": "my-username" }`

### 上传头像

```http
POST /user/avatar
```

`multipart/form-data`，字段名 `avatar`。支持 PNG / JPEG / GIF / WebP，最大 5 MB。

**响应 200**：`{ "success": true, "imageUrl": "/api/v1/avatar/{userId}" }`

### 删除头像

```http
DELETE /user/avatar
```

**响应 200**：`{ "success": true }`

### 获取头像图片

```http
GET /avatar/{userId}
```

无需认证。缓存 1 小时（CDN 24 小时）。无头像时返回 404。

---

## Quota

### 申请扩容

```http
POST /quota-request
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `requestedGB` | integer | 是 | 1–10,000 |
| `reason` | string | 是 | 1–1,000 字符 |

人工审核后批准或拒绝。

**响应 201**：`{ "success": true }`

---

## Admin 端点

需账户具有 **admin** 角色，否则返回 403。以下为破坏性操作，仅平台管理员使用。

| 方法 | 路径 | 说明 |
|------|------|------|
| `PATCH` | `/admin/users/{id}` | 更新用户（`name`、`username`、`email`、`role`、`storageLimitGB`） |
| `DELETE` | `/admin/users/{id}` | 永久删除用户及全部关联数据 |
| `PATCH` | `/admin/projects/{id}` | 切换项目公开/私有（`{ "isPublic": false }`） |
| `DELETE` | `/admin/projects/{id}` | 永久删除项目（使用内部 UUID，非 slug） |
| `PATCH` | `/admin/quotas/{id}` | 处理扩容申请（`action`: `"approve"` / `"deny"`，可选 `adminNote`） |
| `DELETE` | `/admin/files/{id}` | 删除单个文件并回收配额 |

---

## 与本项目相关的典型流程

### 发版上传（自动）

发版构建命令 `npm run build:release` 会在复制 exe 后自动调用 `scripts/lunaris-upload.mjs`，无需手动上传。需在本地 `.env` 配置 `LUNARIS_API_KEY`。

脚本内部等价于：

1. `POST /projects/{slug}/versions` — 创建版本 tag（如 `2.1.0`）
2. `POST /upload/initiate` → `PUT /upload/part` × N → `POST /upload/complete` — 上传 `cs-match-helper.exe`
3. `POST /projects/{slug}/versions/{tag}/set-latest` — 标记为最新

**必须在创建 GitHub Release 之前完成 Lunaris 上传**，确保用户收到更新提示时 CDN 已可用。

### 客户端自动更新

1. 检测 GitHub Release 或 Lunaris 版本 tag 是否有新版本
2. 从 CDN 下载：`https://cdn.lunaris.win/{username}/{project}/cs-match-helper.exe?v={tag}&download`
3. 读取响应头 `X-Checksum-SHA256` 与本地计算值比对
4. 校验通过后替换可执行文件并重启应用

---

## 快速参考

```bash
# 列出项目
curl https://lunaris.win/api/v1/projects \
  -H "Authorization: Bearer YOUR_API_KEY"

# 创建版本
curl -X POST https://lunaris.win/api/v1/projects/my-app/versions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tag":"2.1.0"}'

# CDN 直链（最新版）
curl -LO "https://cdn.lunaris.win/acme/my-app/cs-match-helper.exe?download"
```
