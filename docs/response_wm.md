# 完美平台当前赛季数据与用户搜索接口

本文记录 2026-07-31 起使用的逐玩家补全接口。生产代码只通过固定 Tauri 命令访问这两个地址，不提供任意 URL 代理。

## 1. 当前赛季统计

```http
POST https://api.wmpvp.com/api/v2/csgo/pvpDetailDataStats
Content-Type: application/json;charset=UTF-8
User-Agent: okhttp/4.11.0
appversion: 4.0.9.215
device: vGPSv{unix-time}{process-random-suffix}
gameType: 2
gameTypeStr: 2
platform: h5_android
appTheme: 0

{"steamId64":"76561198104088654","csgoSeasonId":"","accessToken":""}
```

成功响应外层为 `{ statusCode: 0, errorMessage: "", data: {...} }`。`data.steamId` 必须与请求 SteamID 完全一致。

| 应用字段 | 接口字段 | 说明 |
|---|---|---|
| ELO | `pvpScore` | `game_info.players[].score` 到达后以后者为准 |
| PW Rating | `pwRating` | 当前赛季平台 Rating |
| 标准 Rating | `rating` | 与 PW Rating 分开保存 |
| 近期标准 Rating | `historyRatings` | 最新 10 个有效数字的算术平均 |
| 近期 PW Rating | `historyPwRatings` | 最新 10 个有效数字的算术平均 |
| ADR / K/D / 爆头率 / RWS | `adr` / `kd` / `headShotRatio` / `rws` | 0 是有效值，不能按空值丢弃 |
| 胜率 / 场次 | `winRate` / `cnt` | 胜率为 0-1 小数 |
| 突破率 / 残局胜率 | `entryKillRatio` / `vs1WinRate` | 0-1 小数 |
| 近期 WE | `weList` | 最新 10 个有效值的算术平均，默认表格最后一列 |
| 赛季 WE | `avgWe` | 当前赛季均值，与近期 WE 分开保存 |
| 近期 RWS | `historyRws` | 最新 10 个有效值的算术平均 |
| 通用 Rating | `commonRating` | 平台提供的跨模式基准值；不替代 PW Rating |
| ELO 趋势 | `historyScores` | 最新有效 ELO 减去近 10 条中最早的有效 ELO；过滤 0 占位值 |
| K/A/D、MVP | `kills/assists/deaths/mvpCount` | 赛季累计值 |
| 多杀 | `k2/k3/k4/k5` | 赛季二杀至五杀累计次数 |
| 残局胜场 | `endingWin`、`vs1..vs5` | 总胜场及 1v1 至 1v5 的胜场分布；与 `vs1WinRate` 分开 |
| 五维能力 | `shot/victory/breach/snipe/prop` | 平台风格标签，不等同旧七维雷达 |
| 打法特点 | `summary` | 平台生成的简短描述 |
| 擅长武器 | `hotWeapons2` | 按击杀降序，保留爆头率、首发命中率、TTK、扫射命中率、伤害和平台评级；缺失时回退 `hotWeapons` |
| 图池 | `hotMaps` | 见下文派生规则 |

`historyRatings`、`historyPwRatings`、`historyScores`、`historyRws`、`historyDates` 和 `weList` 必须分别解析。服务端不保证数组等长，禁止按相同索引拼接。应用只保留界面与 AI 所需的最近 10 个有效片段和派生值，不把百场数组送入 AI。`hitRate` 当前语义无法由样本可靠确认（大量响应为 `1.00`），暂不作为命中率展示。

## 2. 完美用户搜索与 `zq_id`

```http
POST https://gwapi.pwesports.cn/acty/api/v1/search
Content-Type: application/json;charset=UTF-8
User-Agent: okhttp/4.11.0
appversion: 4.0.9.215
device: vGPSv{unix-time}{process-random-suffix}
gameType: 2
gameTypeStr: 2
platform: android
appTheme: 0

{"text":"76561198104088654","searchType":"ALL","circleId":"0","page":1,"pageSize":20,"gameTypeStr":"2","platform":"android","sortType":1}
```

`device` 在单次应用进程内保持稳定，重启后重新生成。抓包中的 `token`、`accessToken`、`t` 和 `tdSign` 属于认证或签名上下文；匿名接口调用不复制这些值，也不把实采凭据写入代码或 fixture。`t` 与 `tdSign` 必须由同一签名流程成对产生，不能只伪造时间戳。

只检查 `result[]` 中 `itemType === "USER"` 的分组，并只接受 `steamId64Str` 与请求 SteamID 完全相同的记录。不得使用数值型 `steamId64`，因为 17 位 ID 会超过 JavaScript 安全整数范围。

精确结果中的 `wanmeiId` 与旧 CreateGame `playerlist_extrainfo.data[steamId].zq_id` 是同一留言板实体 ID。样本 SteamID `76561198104088654` 的两个值均为 `29668019`。应用把它以字符串写入 `platformBoardId`，留言板请求使用该值作为 `entityId`。

- 多条精确结果的 `wanmeiId` 相同：接受。
- 多条精确结果 ID 冲突：歧义错误。
- 没有精确结果：视为未绑定，不长期缓存。
- 非法、0 或非安全整数 ID：忽略。
- 成功结果写入版本化本地缓存；临时错误和空结果不写缓存。

## 3. 图池熟练度与表现

当前地图存在时显示地图 Logo、熟练度分数、场次、赛季占比、胜率和平均 Rating。悬停详情补充 ADR、地图 K/D、地图 RWS、首杀对枪率和地图爆头率。地图未知时按场次显示前两张代表地图及各自熟练度。

接口只能提供当前赛季数据，因此这里的熟练度是“当前赛季熟练度证据”，不能解释为跨赛季或生涯熟练度。它不把胜率或 Rating 混入熟悉程度；场次是主要证据，赛季占比用于判断玩家是否在本赛季集中使用该地图：

```text
rawFamiliarity = round(
  80 * min(totalMatch / 20, 1)
  + 20 * min(mapShare / 0.35, 1)
)
```

- `专精`：原始熟练度不低于 80，并满足“至少 25 场且赛季占比不低于 25%”或“单图至少 40 场”之一。
- `熟练`：至少 10 场，且原始熟练度不低于 50。
- `有经验`：至少 4 场，且原始熟练度不低于 25；只说明已有一定本赛季样本。
- `本季少玩`：有记录，但当前赛季场次或投入不足以上门槛；不推断玩家真实水平。
- `无记录`：当前地图没有数据。

最终显示分数会限制在对应等级区间（专精 80-100、熟练 50-79、有经验 25-49、本季少玩 1-24），避免出现“分数很高但标签很低”的矛盾。

`强图` 使用独立的表现判定，不覆盖熟练度等级；界面上会合并进同一个标签（如 `熟练·强图`）：至少 10 场，并满足以下任一条件：

- 地图 Rating 高于赛季 PW Rating 至少 `0.08`。
- 地图胜率高于赛季胜率至少 `15` 个百分点，且地图 Rating 不得低于赛季水平超过 `0.03`。

这样可以区分“玩得多”和“打得好”，也不会因少量场次或单一高胜率被误判。

地图平均值公式：

```text
mapRating = ratingSum / totalMatch
mapAdr = totalAdr / totalMatch
mapWinRate = winCount / totalMatch
mapShare = totalMatch / cnt
mapKd = totalKill / deathNum
mapRws = rwsSum / totalMatch
openingDuelRate = firstKillNum / (firstKillNum + firstDeathNum)
mapHeadshotRate = headshotKillNum / totalKill
```

## 4. 武器字段

`hotWeapons2` 的前两把武器用于紧凑表格展示，完整解析字段包括 `killNum`、`matchNum`、`headshotRate`、`firstShotAccuracy`、`avgTimeToKill`、`sprayAccuracy`、`avgDamage` 与 `level*` 平台评级。图片加载失败时回退为武器图标和名称，不改变表格行高。AI 只接收前两把武器的名称、击杀、爆头率、首发命中率和平均 TTK。

## 5. 请求与失败语义

- ready 后立即启动该玩家的统计、软件内部留言计数和身份搜索，不等待第十名玩家。
- 最多同时处理四名玩家；同 SteamID 的进行中统计或搜索请求会合并。
- 后端单次超时 12 秒。传输错误、超时和 5xx 重试一次；4xx 与数据校验错误不重试。
- 统计、内部留言、身份和完美留言分别维护加载状态，一项失败不阻塞其他项、分队或历史保存。
- 新会话产生后，旧会话异步响应通过会话令牌丢弃。
- 留言只预取数量；正文在抽屉打开时分页加载，且不进入 AI prompt。

## 6. 离线实采

- 日志 fixture：`src/platforms/perfect/fixtures/perfect-9220102482485790732-log.json`
- API fixture：`src/platforms/perfect/fixtures/perfect-9220102482485790732-api.json`

日志 fixture 保留原始密文、解密文本、真实 SteamID、ready 顺序、`de_dust2` 与 `game_info` 阵营。API fixture 保留 10 人统计、搜索、完美留言首屏及软件内部留言计数的原始成功、空结果或错误。调试回放完全离线。
