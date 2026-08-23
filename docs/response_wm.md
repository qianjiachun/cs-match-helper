# 完美平台用户概览与赛季统计结构

本文记录 2026-08 起使用的完美平台玩家数据流程。生产代码由 Rust 持有登录态，并按玩家串行请求 `overview` 和 `season-stats`；前端继续通过 `fetch_perfect_player_stats(steamId)` 接收聚合结果。

## 1. 请求顺序

### 1.1 用户概览

```http
GET https://pwaweblogin.wmpvp.com/user-info/overview
Referer: https://client.wmpvp.com
PwaSteamId: {登录账号 SteamID}

access_token={登录凭据}&recent_ladder_match=1&uid={目标玩家 SteamID}
```

`overview` 提供玩家身份、头像、昵称、`user.zqId`、当前匹配分和基础资料。应用先用该响应确定当前赛季；响应中没有赛季时，再读取赛季列表取得最新的 `Sxx`。

### 1.2 当前赛季发现

```http
GET https://pwaweblogin.wmpvp.com/user-info/season-ladder-score-list
Referer: https://client.wmpvp.com
PwaSteamId: {登录账号 SteamID}

access_token={登录凭据}&uid={目标玩家 SteamID}&ignore_season=
```

该接口的成功响应是普通 JSON，不包含 `data.e/data.t`。应用直接读取 `data`，递归选择编号最大的 `Sxx`；不能复用 `overview` 和 `season-stats` 的 AES 解密分支。

### 1.3 当前赛季统计

```http
POST https://pwaweblogin.wmpvp.com/user-info/season-stats
Content-Type: application/x-www-form-urlencoded
Referer: https://client.wmpvp.com
PwaSteamId: {登录账号 SteamID}

access_token={登录凭据}
&current_season=S24
&need_max_score=1
&season=S24
&stats_list=ladder,map,weapon,individual_peak
&uid={目标玩家 SteamID}
```

`season-stats` 是赛季战斗数据的主来源。它补充历史最高段位、当前赛季统计、地图、武器、能力雷达和峰值记录。该请求失败但 `overview` 成功时，应用保留基础资料并标记为部分加载失败。

## 2. 加密响应

`overview` 和 `season-stats` 的成功外层结构为：

```json
{
  "code": 0,
  "data": { "e": "Base64 ciphertext", "t": 569525 },
  "msg": ""
}
```

解密规则固定为：

- AES-256-ECB。
- PKCS#7 padding。
- 密文为 `Base64(data.e)`。
- key 为 `G#r%*VCDYj6P5$mny0838MhH8d` 与十进制 `String(data.t)` 拼接。
- 解密结果必须依次通过 UTF-8 和 JSON 校验。

未加密的错误响应先检查 `code`。`1002/1033` 表示登录态失效；网络错误不会清除登录态；解密或字段结构变化记为兼容性错误。

## 3. `overview` 重点结构

```text
user
  steamId / uid / userId
  name / nickname
  avatar
  zqId
  perfectPower.perfectPower
matchmaking
  score
avatar_frame[] / medals[] / guild / team
```

| 应用字段 | 接口字段 | 说明 |
|---|---|---|
| SteamID | `user.steamId` | 必须与请求目标完全一致 |
| 昵称 / 头像 | `user.name` / `user.avatar` | 不读取 `guild.name` 或 `team.name` 作为用户名 |
| 留言板实体 ID | `user.zqId` | 写入 `platformBoardId`，只供完美留言板使用 |
| 基础当前分 | `matchmaking.score` | `season-stats.ladder.score` 到达后可补全 |

## 4. `season-stats` 顶层与段位

顶层字段：

| 字段 | 含义 |
|---|---|
| `all_season_max_score` | 历史所有赛季最高分 |
| `all_season_max_score_season` | 取得历史最高分的赛季 |
| `all_season_max_star` | 历史所有赛季最高 S 星数 |
| `ladder.score` | 当前赛季分数 |
| `ladder.curr_s_stars` | 当前赛季 S 星数 |
| `ladder.season` / `season_show_name` | 当前赛季 ID / 展示名 |

历史峰值必须读取顶层字段。`ladder.max_score/max_star` 是当前赛季内部字段，`ladder.all_season_max_score/all_season_max_star` 在实采中可能为 `null`，都不能覆盖顶层历史值。

段位显示规则：

```text
score < 2400：显示分数
score >= 2400 且 stars >= 0：显示 S 图标与星数

0-9 星：普通 S
10-24 星：黄金 S
25-49 星：钻石 S
50 星及以上：魔王 S
```

当前段位使用 `ladder.score + ladder.curr_s_stars`；历史最高段位使用顶层 `all_season_max_score + all_season_max_star`。历史最高段位只表示曾达到的上限，不能作为当前段位或当前水平。

## 5. `ladder` 当前赛季字段

| 数据组 | 字段 |
|---|---|
| 基础 | `score`、`score_change`、`match_count`、`win_num`、`draw_num`、`win_rate`、`round_count` |
| Rating / 输出 | `pw_rating_avg`、`pw_rating_ct_avg`、`pw_rating_t_avg`、`rating_avg`、`adpr`、`rws_avg`、`pri_avg`、`kill_num`、`death_num`、`assist_num`、`kast_total` |
| 爆头 / 首杀 | `hs_kill_rate`、`headshot_kill_num`、`first_kill_num`、`first_death_num`、`first_kill_win_round` |
| 急停 / 反应 | `rapid_stop_success_count`、`rapid_stop_try_count`、`reaction_time_total`、`reaction_time_count`、`time_to_kill_total`、`time_to_kill_count` |
| 残局 | `1v1_num..1v5_num`、`1v1_total..1v5_total`、`1vx_rate`、`only_alive_count` |
| 多杀 / MVP | `two_kill_num`、`three_kill_num`、`four_kill_num`、`five_kill_num`、`mvp_num`、`match_mvp_num` |
| 狙击 | `sniper_kill_num`、`sniper_first_kill`、`sniper_reaction_time_total/count`、`awp_kill_total`、`ssg_kill_total` |
| 补枪 / 道具 | `trade_frag_count/try_count`、`flash_assist_count`、烟闪火雷的购买、投掷、伤害和击杀字段 |
| S 段 | `curr_s_stars`、`curr_s_level`、`prev_s_stars`、`prev_s_level`、`changed_stars` |

派生字段：

```text
K/D = kill_num / death_num
KAST = kast_total / round_count
补枪成功率 = trade_frag_count / trade_frag_try_count
1v1 胜率 = 1v1_num / 1v1_total（必须带 attempts）
残局胜率 = 1vx_rate（全部残局，不是 1v1）
首杀转化率 = first_kill_win_round / first_kill_num
急停成功率 = rapid_stop_success_count / rapid_stop_try_count
平均反应时间 = reaction_time_total / reaction_time_count
击杀耗时 = time_to_kill_total / time_to_kill_count
突破率 = first_kill_num / round_count
```

分母为 0 或缺失时不生成派生值；数值 0 本身是有效数据。

`mvp_num` 是回合 MVP；表格「MVP」使用 `match_mvp_num`（场次 MVP）。`pw_rating_ct_avg` / `pw_rating_t_avg` 只表示赛季 CT/T Rating，不能写成当前地图分侧水平。`pri_avg` 是 PRI，不是 WE。

## 6. `map[]` 地图结构

每项由赛季地图统计与 `map_info` 元数据组成：

| 数据组 | 字段 |
|---|---|
| 身份 / 样本 | `map`、`season`、`season_show_name`、`total_num`、`round_count` |
| 胜负 | `win_num`、`win_round_count`、`ct_rounds_num/ct_win_rounds`、`t_rounds_num/t_win_rounds` |
| 输出均值 | `adpr`、`pw_rating_avg`、`rws_avg`、`pri_avg`、`fire_power` |
| 击杀 | `kill_num`、`death_num`、`headshot_kill_num`、`first_kill_num`、`first_death_num` |
| 多杀 / 残局 | `two_kill_num..five_kill_num`、`1v1_num..1v5_num`、`match_mvp_num` |
| 其他 | `sniper_kill_num`、`team_kill_num`、`win_dmg_health`、`dmg_health_total` |
| 地图元数据 | `map_info.name_cn/name_en`、`image`、`background`、`logo` 及 BP 图片 |

重要语义：新接口的 `adpr`、`pw_rating_avg` 和 `rws_avg` 已经是地图均值，应用直接使用，不能再除以 `total_num`。旧历史记录中的 `totalAdr/ratingSum/rwsSum` 仍按累计值除以场次作为兼容回退。

地图熟练度仍只由当前赛季场次和赛季占比生成；胜率、Rating、ADR、CT/T 回合胜率和火力仅用于表现说明，不混入熟练度分数。

## 7. `weapon[]` 武器结构

| 数据组 | 字段 |
|---|---|
| 身份 / 样本 | `name`、`match_num`、`kill_num`、`avg_kill_num` |
| 伤害 / 爆头 | `damage_sum`、`avg_damage`、`headshot_sum`、`headshot_rate` |
| 首发命中 | `first_shot_hit_count`、`first_shot_shot_count`、`first_shot_accuracy` |
| 扫射命中 | `spray_hit_count`、`spray_shot_count`、`spray_accuracy` |
| 急停 | `weapon_rapid_stop_hit_count`、`weapon_rapid_stop_shot_count`、`rapid_stop_success_rate` |
| 击杀耗时 | `time_to_kill_total`、`time_to_kill_count`、`avg_time_to_kill` |
| 平台评级 | `level_accuracy`、`level_avg_damage`、`level_avg_kill_num`、`level_avg_time_to_kill`、`level_headshot_rate`、`level_rapid_stop_success_rate` |
| 武器元数据 | `weapon_info.name_cn/name_en`、`image`、`user_page_image` |

应用按 `kill_num` 降序保留前 8 把，紧凑表格展示第一把；AI 只接收前两把的名称、击杀、场均击杀、爆头率、首发命中率、扫射命中率、急停成功率和平均 TTK。

## 8. `radar_new` 与其他顶层数据

`radar_new` 的有效维度为 `fire_power`、`marksmanship`、`follow_up_shot`、`first`、`item`、`1vn`、`sniper` 和 `app`。每个维度可包含 `score`、`score_base`、`level` 与 `detail`；应用只把有数值 `score` 的维度写入雷达列，并把 `description` 作为打法摘要。雷达 `detail` 只抽取 `*_raw` 进入赛季战斗摘要，不把整棵树写入 `MatchPlayer` 或 prompt。

当前赛季 WE 取自 `radar_new.fire_power.detail.we_raw`，映射到 `MatchPlayer.seasonWe`。`ladder.pri_avg` 是 PRI，不得作为 WE 使用；旧响应顶层 `avgWe` 仅作为兼容回退。

`individual_peak`、`prize_peak`、`online_time`、`ban_status`、道具 buy/throw/pickup 计数、空的 `recent_score_list` 和旧 `radar` 不进入表格或 AI。历史最高段位只表示上限，不能当作当前水平。

## 9. 默认列与 AI 数据边界

完美平台默认列为：玩家、ELO、最高分、Rating、ADR、爆头率、急停成功率、反应时间、地图熟练度、擅长武器、WE。其中“WE”表示当前赛季 WE，“最高分”表示历史最高段位。K/D 与 RWS 保留为可选列，但不再默认显示。新接口不再稳定提供旧 `historyRatings/weList`，因此“近期 Rating”和“近期 WE”同样保留为可选兼容列。

列与 AI 分流：

- **列**只放全场能横比的单值。默认隐藏的新增列为 KAST、补枪成功率、1v1 胜率（副标题带样本）、场次 MVP，以及雷达火力 / 枪法 / 补枪 / 突破 / 道具 / 残局 / 狙击。
- **AI** 放成分组摘要：赛季 CT/T Rating、开局链、道具效果、对枪结构、狙击、残局样本、赛季 `_change`。当前地图只有 CT/T 回合胜率与回合样本，没有分侧 Rating。
- **不加列**：CT Rating、T Rating、手枪 Rating、闪白助攻、扫射命中、击杀耗时、狙击占比、最后存活、开局链。这些只进 AI。

AI 输入明确区分：

- `currentRank`：当前分数或当前 S 星，只表示当前赛季。
- `peakRank`：历史最高分或历史最高 S 星，只作为长期上限证据。
- `sides`：赛季 CT/T Rating；当前地图叠加 CT/T 回合胜率与回合数。
- `currentMap` / `representativeMaps`：传入地图均值、PRI、手枪 WE、狙击占比、回合胜率和样本量。
- `hotWeapons`：最多两把武器的紧凑摘要，可含场均每回合击杀。
- `1vx_rate` 是全部残局；`1v1_num / 1v1_total` 才是 1v1 胜率。

原始长数组、雷达 `detail` 全量、道具 buy/throw/pickup、登录凭据、`zqId`、评论数量和留言正文均不进入 AI。

## 10. 完美用户搜索与留言板

评论接口和留言板行为没有变化。`overview.user.zqId` 可直接提供留言板实体 ID；缺失时继续通过现有用户搜索接口按 SteamID 精确查找。只接受字符串 SteamID 完全相同的用户项，不使用会丢失精度的数值型 SteamID。

## 11. 并发、缓存与失败语义

- 最多同时处理 4 名玩家；每名玩家的 `overview -> season-stats` 串行执行。
- 同 SteamID 的进行中请求合并，聚合结果缓存 5 分钟。
- `season-stats` 临时失败时保留 `overview` 数据，并写入 `partialFailure`。
- 登录失效停止新的玩家请求和日志监听；网络错误保留凭据并允许重试。
- 日志统一脱敏 `access_token`、40 位 token、Steam 回调 token 与 `phoneToken`。
