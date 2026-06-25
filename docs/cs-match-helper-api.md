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
- 同一 `clientKey` 对同一玩家（`steamid`）**24 小时内最多发表 3 条顶级评论**；回复不受此限，编辑不占用次数。

---

## 评论与回复模型

评论采用**单表自引用**：字段 `replyId` 指向被回复的**顶级评论** `_id`。

| 类型 | 判定 | 说明 |
|------|------|------|
| 顶级评论 | `replyId` 为 `null` 或不存在 | 对某玩家的直接评论 |
| 回复 | 带 `replyId`，指向父评论 | 仅支持回复顶级评论，**不可回复的回复** |

**设计约束：**

- 仅支持**一层回复**（扁平结构，非嵌套树）。
- 顶级列表与回复列表**分开加载**；`comment/list` 不返回回复，回复通过 `comment/reply/list` 单独拉取。
- `replyId` 始终指向顶级评论 ID，而非「回复的回复」。

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
| color | string? | 作者标识色（十六进制，如 `#5a8fd3`）；由作者 `clientKey` 确定性生成，同一匿名用户的多条评论颜色一致 |
| liked | boolean? | 当前客户端是否已点赞 |
| self | boolean? | 当前客户端是否为作者 |
| editedAt | number? | 最后编辑时间（毫秒时间戳） |
| replyCount | number? | 回复数；**仅 `comment/list` 的顶级评论**在 `> 0` 时返回 |
| replyId | string? | 父评论 ID；**仅 `comment/reply/list` 的回复项**返回 |

> **说明：** `color` 仅在有 `clientKey` 的评论上返回；缺少 `clientKey` 的旧评论不会包含该字段。客户端可用此颜色区分不同匿名作者，无需展示真实身份。

### 历史评论项 `HistoryItem`

继承 `CommentItem`，额外包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| steamid | string | 被评论玩家的 SteamID |
| self | boolean | 恒为 `true` |

历史列表**同时包含顶级评论与回复**（扁平，不嵌套）。

### 游标 `Cursor`

用于深翻页，比 `page` 性能更好。

**`comment/list` 的游标形态取决于 `sort` 参数：**

**时间排序（`sort: "time"`，默认）：**

```json
{
  "createTime": 1718612345678,
  "id": "674a1b2c3d4e5f6789012345"
}
```

**热评排序（`sort: "hot"`）：**

```json
{
  "likes": 5,
  "createTime": 1718000000000,
  "id": "665f..."
}
```

下一页请求时，将上一页响应中的 `nextCursor` 原样传入 `cursor` 即可。**时间流与热评的游标不可混用。**

**`comment/reply/list` 的游标（仅时间倒序）：**

```json
{
  "createTime": 1718612345678,
  "id": "674a1b2c3d4e5f6789012345"
}
```

---

## 接口列表

| 接口 | 需要 Header | 说明 |
|------|-------------|------|
| `comment/add` | 是 | 发表顶级评论或回复 |
| `comment/update` | 是 | 编辑自己的评论（含回复） |
| `comment/list` | 是 | 查询某玩家的**顶级评论**列表（支持按时间或热评排序） |
| `comment/reply/list` | 是 | 查询某条顶级评论下的回复列表 |
| `comment/history` | 是 | 查询当前客户端发表的评论历史（含顶级评论与回复） |
| `comment/like` | 是 | 点赞/取消点赞（切换，对回复同样适用） |
| `comment/batch` | 否 | 批量查询玩家**顶级评论**数量 |

---

## 1. 发表评论 / 回复

`POST /api/v1/cs-match-helper/comment/add`

不传 `replyId` 时发表**顶级评论**；传 `replyId` 时回复指定顶级评论。

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

**顶级评论：**

```json
{
  "steamid": "76561198000000000",
  "text": "这把很强"
}
```

**回复：**

```json
{
  "steamid": "76561198000000000",
  "text": "同意",
  "replyId": "674a1b2c3d4e5f6789012345"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| steamid | string | 是 | 被评论玩家 SteamID |
| text | string | 是 | 评论内容，1-200 字 |
| replyId | string | 否 | 父评论 ObjectId；传则为回复，不传则为顶级评论 |

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

| 场景 | 行为 |
|------|------|
| 不传 `replyId` | 发表顶级评论 |
| 传 `replyId` | 回复指定顶级评论 |

**回复校验：**

- `replyId` 必须是合法 ObjectId。
- 父评论必须存在且 `valid=1`。
- 父评论的 `steamid` 必须与请求 `steamid` 一致。
- 父评论本身不能是回复（不能回复的回复）。

**限频与限额：**

- 敏感词检测：命中则拒绝发表。
- 顶级评论：5 秒 CD（key: `add:c:{clientKey}:{steamid}`）。
- 回复：5 秒 CD（key: `add:r:{clientKey}:{replyId}`）。
- 24 小时 3 条限制：**仅针对顶级评论**，回复不受此限。

**副作用：**

- 顶级评论：玩家 `stats.commentCount +1`。
- 回复：不增加玩家 `commentCount`，父评论 `replyCount +1`。

### 常见错误

| msg | 说明 |
|-----|------|
| 缺少或无效的 x-cs-client-key | Header 未传或格式错误 |
| SteamID 格式不正确 | steamid 不符合规则 |
| 24小时内对同一玩家最多评论3条 | 触发顶级评论日限额 |
| 发言过于频繁，请稍后再试 | 5 秒 CD |
| 被回复的评论不存在 | `replyId` 无效或父评论已失效 |
| 不支持回复的回复 | 父评论本身是回复 |
| 发送消息失败，包含敏感词：... | 敏感词拦截 |

---

## 2. 编辑评论

`POST /api/v1/cs-match-helper/comment/update`

仅评论作者可编辑，且评论创建后 **30 天内** 可修改。请求/响应 schema 未变，**对回复同样适用**（传回复的 `commentId` 即可）。

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

### 业务规则

- **作者校验：** 服务端在更新时将请求头 `x-cs-client-key` 写入查询条件，必须与评论发表时的 `clientKey` 一致才会更新。编辑他人评论时更新结果为 `null`，统一返回「评论不存在或无权限编辑」（不区分评论是否存在，避免信息泄露）。
- **编辑窗口：** 自 `createTime` 起 **30 天内** 可编辑；超过 30 天返回「评论超过30天不可编辑」。
- 编辑不占用「24 小时内对同一玩家最多 3 条新评论」的发表限额。

| 场景 | 结果 |
|------|------|
| 30 天内且为本人评论 | 编辑成功 |
| 超过 30 天 | `评论超过30天不可编辑` |
| 非本人（含评论不存在） | `评论不存在或无权限编辑` |

> 失败时服务端可能额外查询一次文档，用于区分「超期」与「无权限」；成功路径仍为一次原子 `findOneAndUpdate`。

### 常见错误

| msg | 说明 |
|-----|------|
| 评论不存在或无权限编辑 | 评论不存在，或非当前客户端发表 |
| 评论超过30天不可编辑 | 评论创建已超过 30 天 |
| 发送消息失败，包含敏感词：... | 敏感词拦截 |

---

## 3. 查询玩家顶级评论列表

`POST /api/v1/cs-match-helper/comment/list`

查询指定玩家的**顶级评论**（不含回复），支持按时间或热评排序，并分页返回。有回复时列表项带 `replyCount`，用于展示「N 条回复」。

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

```json
{
  "steamid": "76561198000000000",
  "sort": "time",
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
| sort | string | 否 | 排序方式，默认 `time`；见下表 |
| limit | number | 否 | 每页条数，默认 20，最大 50 |
| page | number | 否 | 页码，从 1 开始；**仅 `sort: "time"` 可用** |
| cursor | object | 否 | 游标翻页，优先于 page；形态见「游标 Cursor」 |
| before | number | 否 | 旧版游标（仅时间戳）；**仅 `sort: "time"` 可用**，建议改用 cursor |

**`sort` 取值：**

| 值 | 含义 |
|---|---|
| `time` | 按发布时间倒序（默认，原有行为） |
| `hot` | 按点赞数倒序；点赞相同则较新的在前 |

### 分页规则

**`sort: "time"`（默认）**

行为与之前一致，支持三种翻页方式：`page`、`before`、`cursor`（`createTime` + `id`）。

**`sort: "hot"`**

- 仅支持游标分页，**不支持** `page` 和 `before`（传入会返回错误）。
- 首屏不传 `cursor`；翻页时将上一页 `nextCursor` 原样传回，且游标必须包含 `likes`。
- 排序规则：`likes` 从高到低 → 相同则 `createTime` 从新到旧 → 再相同则 `id` 倒序。

### 成功响应

单条评论字段：`id`、`text`、`likes`、`createTime`、`color`、`liked`、`self`、`editedAt`，以及可选的 `replyCount`（回复数 `> 0` 时返回）。

**时间排序示例：**

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
        "color": "#5a8fd3",
        "liked": false,
        "self": true,
        "editedAt": 1718612400000,
        "replyCount": 3
      },
      {
        "id": "674a1b2c3d4e5f6789012346",
        "text": "又一条",
        "likes": 0,
        "createTime": 1718612000000,
        "color": "#5a8fd3",
        "liked": false,
        "self": false
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

**热评排序时，`nextCursor` 会多一个 `likes` 字段：**

```json
{
  "more": true,
  "nextCursor": {
    "likes": 5,
    "createTime": 1718000000000,
    "id": "665f..."
  }
}
```

`more` 表示是否还有下一页。

### 翻页建议

**时间流 — 首屏：**

```json
{ "steamid": "76561198000000000", "limit": 20 }
```

**时间流 — 加载更多：**

```json
{
  "steamid": "76561198000000000",
  "limit": 20,
  "cursor": { "createTime": 1718612345678, "id": "674a1b2c3d4e5f6789012345" }
}
```

**热评 — 首屏：**

```json
{
  "steamid": "76561198000000000",
  "sort": "hot",
  "limit": 20
}
```

**热评 — 加载更多：**

```json
{
  "steamid": "76561198000000000",
  "sort": "hot",
  "limit": 20,
  "cursor": {
    "likes": 5,
    "createTime": 1718000000000,
    "id": "665f..."
  }
}
```

将上一页 `data.nextCursor` 传入下一页请求的 `cursor` 字段。当 `more` 为 `false` 时表示没有更多数据。

同一 `clientKey` 发表的评论会返回相同的 `color`，便于在列表中识别同一匿名用户的多条发言。

### 常见错误

| msg | 说明 |
|-----|------|
| 热评排序仅支持游标分页 | `sort: "hot"` 时传了 `page` 或 `before` |
| 热评游标缺少 likes 字段 | `sort: "hot"` 翻页时 `cursor` 未包含 `likes` |

---

## 4. 查询评论回复列表

`POST /api/v1/cs-match-helper/comment/reply/list`

查询某条顶级评论下的回复，**仅按时间倒序**分页，不支持热评排序。

### 请求头

```http
x-cs-client-key: <clientKey>
Content-Type: application/json
```

### 请求体

```json
{
  "commentId": "674a1b2c3d4e5f6789012345",
  "limit": 20,
  "cursor": {
    "createTime": 1718612345678,
    "id": "674a1b2c3d4e5f6789012346"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| commentId | string | 是 | 父评论（顶级评论）ObjectId |
| limit | number | 否 | 每页条数，默认 20，最大 50 |
| page | number | 否 | 页码，从 1 开始 |
| cursor | object | 否 | 游标翻页，优先于 page；形态见「游标 Cursor」 |
| before | number | 否 | 旧版游标（仅时间戳），建议改用 cursor |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": "674a1b2c3d4e5f6789012347",
        "text": "同意",
        "likes": 1,
        "createTime": 1718612500000,
        "color": "#c47a5a",
        "liked": false,
        "self": false,
        "replyId": "674a1b2c3d4e5f6789012345"
      }
    ],
    "more": false,
    "nextCursor": null
  }
}
```

### 业务规则

- `commentId` 必须是有效的顶级评论（存在、有效、自身不是回复）。
- 无效父评论时返回空列表：`{ "list": [], "more": false }`。
- 分页模式与 `comment/list` 的时间排序一致（`page` / `before` / `cursor`）。

### 翻页建议

**首屏：**

```json
{ "commentId": "674a1b2c3d4e5f6789012345", "limit": 20 }
```

**加载更多：**

```json
{
  "commentId": "674a1b2c3d4e5f6789012345",
  "limit": 20,
  "cursor": { "createTime": 1718612500000, "id": "674a1b2c3d4e5f6789012347" }
}
```

---

## 5. 查询我的评论历史

`POST /api/v1/cs-match-helper/comment/history`

查询当前客户端发表过的所有评论（**含顶级评论与回复**），按时间倒序。

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
        "color": "#5a8fd3",
        "self": true,
        "editedAt": 1718612400000
      },
      {
        "id": "674a1b2c3d4e5f6789012346",
        "steamid": "76561198000000001",
        "text": "又一条",
        "likes": 0,
        "createTime": 1718612000000,
        "color": "#5a8fd3",
        "self": true
      }
    ],
    "more": false,
    "nextCursor": null
  }
}
```

---

## 6. 点赞 / 取消点赞

`POST /api/v1/cs-match-helper/comment/like`

同一客户端对同一条评论**切换**点赞状态：未点赞则点赞，已点赞则取消。请求/响应 schema 未变，**对回复同样适用**（传回复的 `commentId` 即可）。

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

### 行为

| 当前状态 | 调用后 |
|---------|--------|
| 未点赞 | 点赞，`likes + 1` |
| 已点赞 | 取消点赞，`likes - 1`（不低于 0） |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "likes": 4,
    "liked": true
  }
}
```

| 字段 | 说明 |
|------|------|
| likes | 操作后的点赞总数 |
| liked | 操作后是否处于已点赞状态（`true` 已赞，`false` 未赞） |

客户端可根据 `liked` 更新 UI（如实心/空心赞图标）。

### 限频

同一客户端对同一评论，800ms 内不可重复请求。

---

## 7. 批量查询评论数量

`POST /api/v1/cs-match-helper/comment/batch`

对局准备页使用：一次查询多个玩家的**顶级评论**总数（**不含回复**），**不需要** `x-cs-client-key`。

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

1. 调用 `comment/batch` 获取 10 名玩家的顶级评论数量。
2. 用户点击某玩家时，调用 `comment/list` 查看顶级评论（可按时间或热评切换）。

### 评论与回复

1. 调用 `comment/list` 拉取顶级评论，根据 `replyCount` 展示「N 条回复」。
2. 用户展开回复时，调用 `comment/reply/list`，传父评论 `id` 作为 `commentId`。
3. 用户发回复时，调用 `comment/add`，传 `steamid` + `text` + `replyId`（父评论 id）。
4. 点赞/编辑回复：复用 `comment/like`、`comment/update`，传回复的 `id`。
5. **不要**期望 `comment/list` 返回嵌套回复树；回复与顶级列表分开加载。

### 时间流与热评

1. 时间流（`sort: "time"`）与热评（`sort: "hot"`）是两个独立列表，游标不能混用。
2. 切换 tab 时重新请求首屏，不要沿用另一种排序的 `cursor`。
3. `comment/reply/list` 仅支持时间倒序；`comment/history` 也只按时间排序。

### 发表评论

1. 确保本地已持久化 `clientId` 并计算 `clientKey`。
2. 顶级评论：调用 `comment/add`，Header 带 `x-cs-client-key`。
3. 若返回限额错误，提示用户 24 小时内对该玩家的顶级评论已达上限（回复不受此限）。

### 编辑自己的评论

1. 在 `comment/list` 或 `comment/reply/list` 响应中，当 `self === true` 且 `createTime` 距今未超过 30 天时展示编辑入口（客户端也可本地按 `createTime` 预判，最终以 `comment/update` 返回为准）。
2. 调用 `comment/update` 提交新内容；Header 须携带与发表评论时相同的 `x-cs-client-key`。
3. 若返回「评论超过30天不可编辑」，隐藏或禁用编辑入口并提示用户。

### 我的评论

1. 调用 `comment/history` 分页加载当前客户端发表过的所有评论（含顶级评论与回复）。
2. 可通过 `steamid` 字段跳转回对应玩家详情。

### 评论作者颜色

1. `comment/list`、`comment/reply/list` 与 `comment/history` 的列表项可能包含 `color` 字段。
2. 客户端可用 `color` 渲染头像边框、用户名或左侧色条，区分不同匿名作者。
3. 无 `color` 时使用默认样式（兼容旧数据）。

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
