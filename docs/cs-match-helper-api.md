# CS 匹配助手评论接口文档

本文档供 [cs-match-helper](https://github.com/qianjiachun/cs-match-helper) 等客户端项目对接使用。

## 基础信息

所有接口的完整地址为 `https://fkbuff.com` + 下文路径（本文档中的路径均为相对路径）。

| 项目 | 说明 |
|------|------|
| 基础域名 | `https://fkbuff.com` |
| 接口前缀 | `/api/v1/cs-match-helper/` |
| 请求方法 | 全部为 `POST` |
| Content-Type | `application/json` |
| 认证 | 无需登录；除 `batch` 外，其余写操作与读列表/历史接口需携带客户端身份 Header |
| 响应格式 | 统一 JSON 包装 |

### 统一响应结构

成功：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

失败（HTTP 状态码仍为 500，需根据 `code` 判断）：

```json
{
  "code": -1,
  "msg": "错误说明",
  "data": null
}
```

---

## 客户端身份（重要）

除 `comment/batch` 外，以下接口均要求请求头携带：

```http
x-cs-client-key: <64位十六进制字符串>
```

### 生成规则

1. 客户端首次启动时生成并持久化本地 `clientId`（推荐 UUID）。
2. 每次请求前计算：`clientKey = sha256(clientId)`。
3. 将 `clientKey` 放入 Header `x-cs-client-key`。
4. **不要**在请求 body 中传输明文 `clientId`。

### 示例（JavaScript）

```javascript
import { createHash, randomUUID } from "crypto";

// 首次启动生成并保存
const clientId = localStorage.getItem("clientId") || randomUUID();
localStorage.setItem("clientId", clientId);

const clientKey = createHash("sha256").update(clientId).digest("hex");

const API_BASE = "https://fkbuff.com/api/v1/cs-match-helper";

await fetch(`${API_BASE}/comment/add`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-cs-client-key": clientKey
  },
  body: JSON.stringify({ steamid, text })
});
```

### 注意事项

- `clientKey` 必须是 **64 位小写十六进制**（`a-f0-9`）。
- 卸载软件并清除本地配置后，会生成新的 `clientId`，历史点赞状态与编辑权限不会保留。
- 同一 `clientKey` 对同一玩家（`steamid`）**24 小时内最多发表 3 条新评论**；编辑不占用次数。

---

## 数据类型

### SteamID

- 格式：`^7656\d{13}$`（17 位 SteamID64，以 `7656` 开头）

### 评论项 `CommentItem`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 评论 ID |
| text | string | 评论内容 |
| likes | number | 点赞数 |
| createTime | number | 创建时间（毫秒时间戳） |
| liked | boolean? | 当前客户端是否已点赞 |
| self | boolean? | 当前客户端是否为作者 |
| editedAt | number? | 最后编辑时间（毫秒时间戳） |

### 历史评论项 `HistoryItem`

继承 `CommentItem`，额外包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| steamid | string | 被评论玩家的 SteamID |
| self | boolean | 恒为 `true` |

### 游标 `Cursor`

用于深翻页，比 `page` 性能更好：

```json
{
  "createTime": 1718612345678,
  "id": "674a1b2c3d4e5f6789012345"
}
```

下一页请求时，将上一页响应中的 `nextCursor` 原样传入即可。

---

## 接口列表

| 接口 | 需要 Header | 说明 |
|------|-------------|------|
| `comment/add` | 是 | 发表评论 |
| `comment/update` | 是 | 编辑自己的评论 |
| `comment/list` | 是 | 查询某玩家的评论列表 |
| `comment/history` | 是 | 查询当前客户端发表的评论历史 |
| `comment/like` | 是 | 点赞 |
| `comment/batch` | 否 | 批量查询玩家评论数量 |

---

## 1. 发表评论

`POST /api/v1/cs-match-helper/comment/add`

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

```json
{
  "steamid": "76561198000000000",
  "text": "这把很强"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| steamid | string | 是 | 被评论玩家 SteamID |
| text | string | 是 | 评论内容，1-200 字 |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "674a1b2c3d4e5f6789012345"
  }
}
```

### 业务规则

- 敏感词检测：命中则拒绝发表。
- 限频：同一客户端 5 秒内不可重复提交（防刷）。
- 限额：同一 `clientKey` 对同一 `steamid`，24 小时内最多 **3 条**新评论。

### 常见错误

| msg | 说明 |
|-----|------|
| 缺少或无效的 x-cs-client-key | Header 未传或格式错误 |
| SteamID 格式不正确 | steamid 不符合规则 |
| 24小时内对同一玩家最多评论3条 | 触发日限额 |
| 发言过于频繁，请稍后再试 | 5 秒 CD |
| 发送消息失败，包含敏感词：... | 敏感词拦截 |

---

## 2. 编辑评论

`POST /api/v1/cs-match-helper/comment/update`

仅评论作者可编辑，无时间限制。

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

```json
{
  "commentId": "674a1b2c3d4e5f6789012345",
  "text": "修改后的评论内容"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| commentId | string | 是 | 评论 ID |
| text | string | 是 | 新内容，1-200 字 |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": "674a1b2c3d4e5f6789012345"
  }
}
```

### 常见错误

| msg | 说明 |
|-----|------|
| 评论不存在或无权限编辑 | 评论不存在，或非当前客户端发表 |
| 发送消息失败，包含敏感词：... | 敏感词拦截 |

---

## 3. 查询玩家评论列表

`POST /api/v1/cs-match-helper/comment/list`

查询指定玩家的评论，按时间倒序，支持分页。

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

```json
{
  "steamid": "76561198000000000",
  "limit": 20,
  "cursor": {
    "createTime": 1718612345678,
    "id": "674a1b2c3d4e5f6789012345"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| steamid | string | 是 | 玩家 SteamID |
| limit | number | 否 | 每页条数，默认 20，最大 50 |
| page | number | 否 | 页码，从 1 开始（浅翻页可用） |
| cursor | object | 否 | 游标翻页，优先于 page |
| before | number | 否 | 旧版游标（仅时间戳），建议改用 cursor |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": "674a1b2c3d4e5f6789012345",
        "text": "这把很强",
        "likes": 3,
        "createTime": 1718612345678,
        "liked": false,
        "self": true,
        "editedAt": 1718612400000
      }
    ],
    "more": true,
    "nextCursor": {
      "createTime": 1718612345678,
      "id": "674a1b2c3d4e5f6789012345"
    }
  }
}
```

### 翻页建议

**首屏：**

```json
{ "steamid": "76561198000000000", "limit": 20 }
```

**加载更多：**

```json
{
  "steamid": "76561198000000000",
  "limit": 20,
  "cursor": { "createTime": 1718612345678, "id": "674a1b2c3d4e5f6789012345" }
}
```

将上一页 `data.nextCursor` 传入下一页请求的 `cursor` 字段。当 `more` 为 `false` 时表示没有更多数据。

---

## 4. 查询我的评论历史

`POST /api/v1/cs-match-helper/comment/history`

查询当前客户端发表过的所有评论，按时间倒序。

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

```json
{
  "limit": 20,
  "cursor": {
    "createTime": 1718612345678,
    "id": "674a1b2c3d4e5f6789012345"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 每页条数，默认 20，最大 50 |
| page | number | 否 | 页码，从 1 开始 |
| cursor | object | 否 | 游标翻页，优先于 page |
| before | number | 否 | 旧版游标，建议改用 cursor |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": "674a1b2c3d4e5f6789012345",
        "steamid": "76561198000000000",
        "text": "这把很强",
        "likes": 3,
        "createTime": 1718612345678,
        "self": true,
        "editedAt": 1718612400000
      }
    ],
    "more": false,
    "nextCursor": null
  }
}
```

---

## 5. 点赞

`POST /api/v1/cs-match-helper/comment/like`

同一客户端对同一条评论只能点赞一次。

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

```json
{
  "commentId": "674a1b2c3d4e5f6789012345"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| commentId | string | 是 | 评论 ID |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "likes": 4,
    "alreadyLiked": false
  }
}
```

| 字段 | 说明 |
|------|------|
| likes | 当前点赞总数 |
| alreadyLiked | 是否已点过赞（`true` 时 likes 不会增加） |

### 限频

同一客户端对同一评论，800ms 内不可重复请求。

---

## 6. 批量查询评论数量

`POST /api/v1/cs-match-helper/comment/batch`

对局准备页使用：一次查询多个玩家的评论总数，**不需要** `x-cs-client-key`。

### 请求体

```json
{
  "steamids": [
    "76561198000000000",
    "76561198000000001"
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| steamids | string[] | 是 | 玩家 SteamID 数组，1-50 个 |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "76561198000000000": { "count": 42 },
    "76561198000000001": { "count": 0 }
  }
}
```

无评论的玩家也会返回 `{ "count": 0 }`。

---

## 典型对接流程

### 对局准备页

1. 调用 `comment/batch` 获取 10 名玩家的评论数量。
2. 用户点击某玩家时，调用 `comment/list` 查看评论详情。

### 发表评论

1. 确保本地已持久化 `clientId` 并计算 `clientKey`。
2. 调用 `comment/add`，Header 带 `x-cs-client-key`。
3. 若返回限额错误，提示用户 24 小时内已达上限。

### 编辑自己的评论

1. 在 `comment/list` 响应中，当 `self === true` 时展示编辑入口。
2. 调用 `comment/update` 提交新内容。

### 我的评论

1. 调用 `comment/history` 分页加载当前客户端发表过的所有评论。
2. 可通过 `steamid` 字段跳转回对应玩家详情。

---

## 错误处理建议

客户端应统一处理：

```javascript
const res = await fetch(url, options);
const json = await res.json();

if (json.code !== 0) {
  // 展示 json.msg
  return;
}

// 使用 json.data
```

注意：业务失败时 HTTP 状态码可能为 `500`，**不要仅依赖 HTTP 状态码**，务必检查 `code` 字段。
