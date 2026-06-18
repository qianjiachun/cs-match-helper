# 完美世界匹配数据字段参考

## 数据结构总览

```text
MatchResponse
├── platform_game_id          # 对局 ID
├── map_name                  # 地图
├── players[]                 # 基础玩家列表（分队、分数、组排信息）
├── ready_left_time_ms        # 准备倒计时（毫秒）
├── playerlist_extrainfo      # JSON 字符串，内含详细战绩与雷达图
├── is_green / is_single      # 对局级绿色/单排标记
└── is_abs_balance / is_grudge_match / is_black / is_bp_mode
```

`players` 与 `playerlist_extrainfo` 通过 **Steam ID**（`player_id` ↔ `uid`）关联。

---

## 顶层字段

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `platform_game_id` | `string` | `"9222775918321036300"` | 平台对局唯一 ID |
| `map_name` | `string` | `"de_dust2"` | 地图内部名 |
| `players` | `object[]` | — | 10 名玩家基础信息，见下节 |
| `ready_left_time_ms` | `number` | `30000` | 准备阶段剩余时间（毫秒） |
| `playerlist_extrainfo` | `string` | `"{\"success\":true,...}"` | **嵌套 JSON 字符串**，需二次 `JSON.parse` |
| `is_green` | `number` | `1` | 对局是否为绿色匹配（`1` 是，`0` 否） |
| `is_single` | `number` | `1` | 对局是否为单排匹配 |
| `is_abs_balance` | `number` | `0` | 绝对平衡模式标记 |
| `is_grudge_match` | `boolean` | `false` | 是否为恩怨局 |
| `is_black` | `boolean` | `false` | 黑名单相关标记 |
| `is_bp_mode` | `boolean` | `false` | 是否为 BP 选图模式 |

---

## `players[]` 基础玩家字段

每条记录描述一名玩家在**当前对局**中的分队与排位信息，不含昵称、头像等（那些在 `playerlist_extrainfo` 中）。

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `player_id` | `string` | `"76561198348200662"` | Steam64 ID，关联扩展数据的键 |
| `slot_type` | `number` | `1` / `2` | 槽位/阵营侧：`1` 通常为 CT 侧，`2` 为 T 侧（与 `roll_team_id` 一致时用于分队） |
| `player_status` | `number` | `0` | 玩家状态（准备/在线等，具体枚举待确认） |
| `is_lord` | `boolean` | `true` | 是否为房主 |
| `score` | `number` | `2101` | 平台排位分（ELO 类分数） |
| `slot_id` | `number \| null` | `null` | 槽位 ID，样例中均为 `null` |
| `is_green` | `number` | `1` | 绿色账号标记（`1` 是） |
| `roll_team_id` | `number` | `1` / `2` | 掷骰分队后的阵营 ID，**项目内优先用于划分 A/B 队** |
| `is_single` | `number` | `0` / `1` | 是否单排：`1` 单排，`0` 组排 |
| `troop_team_id` | `number` | `946149772` | 组排队伍 ID，**相同 ID 表示同一开黑组** |
| `player_game_role` | `number` | `0` | 游戏内角色（具体枚举待确认） |

### 分队逻辑（本项目）

- 按 `roll_team_id`（回退 `slot_type`）将玩家分为两队，映射为内部 `teamSide` 1 / 2，再标记为 A 队 / B 队。
- `troop_team_id` 相同的多名玩家属于同一组排，可用于识别开黑人数。

---

## `playerlist_extrainfo` 解析结构

该字段是 **JSON 字符串**，解析后结构如下：

```json
{
  "success": true,
  "code": 0,
  "data": {
    "<steam_id>": { /* 玩家扩展信息 */ },
    ...
  }
}
```

- `data` 的键为 Steam ID，与 `players[].player_id` 一一对应。
- 项目解析逻辑见 `parseExtraInfo()`（`match-parser.ts`）。

---

## `data[<steam_id>]` 玩家扩展字段

### 身份与展示

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `uid` | `string` | `"76561198348200662"` | Steam ID（与 `player_id` 相同） |
| `zq_id` | `string` | `"5584408"` | 完美世界平台用户 ID |
| `nickname` | `string` | `"丶Goat"` | 昵称（可能含 Unicode 转义） |
| `avatar` | `string` | URL | 头像图片地址 |
| `csgoRgbAvatar` | `string` | URL | CSGO 彩色头像 |
| `valid_nickname` | `number` | `1` | 昵称是否有效 |
| `valid_avatar` | `number` | `1` | 头像是否有效 |
| `avatarBorder` | `object \| []` | 见下 | 头像框；无框时为 `[]` |
| `nftAvatar` | `array` | `[]` | NFT 头像列表 |
| `identity` | `number` | `20` | 身份类型标识 |
| `status` | `string` | `"0"` | 账号状态 |

### 头像框 `avatarBorder`

当存在时：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 头像框 ID |
| `level` | `string` | 等级 |
| `name` | `string` | 名称，如「PWA一周年头像框」 |
| `image` | `string` | 图片 URL |
| `is_nft` | `number` | 是否 NFT（`0` 否） |

### 排位与分数

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `score` | `number` | `2101` | 排位分（与 `players[].score` 一致） |
| `pre_rank` | `boolean` | `false` | 是否定级赛 |
| `grade` | `number` | `0` | 段位等级 |
| `s_level` | `number` | `0` | S 级段位 |
| `s_stars` | `number` | `0` | S 级星数 |
| `adpr` | `number` | `83` | 场均伤害（ADPR） |
| `continued_wins` | `number` | `0` | 连胜场次 |
| `is_green` | `number` | `1` | 绿色账号 |

### 赛季统计

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `season_rating_pro_average` | `number` | `1.0977778` | 赛季 Rating Pro 均值 |
| `season_win_num` | `number` | `4` | 赛季总胜场 |
| `season_total_num` | `number` | `9` | 赛季总场次 |
| `season_map_win_num` | `string` | `"3"` | **当前地图**赛季胜场（注意可能是字符串） |
| `season_map_total_num` | `string` | `"7"` | **当前地图**赛季总场次 |
| `latest_10_win_num` | `number` | `4` | 近 10 场胜场数 |
| `latest_10_total_num` | `number` | `9` | 近 10 场总场次（含平局） |

### 会员信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `isVip` | `boolean` | 是否 VIP |
| `isYearVip` | `boolean` | 是否年费 VIP |
| `vipLevel` | `number` | VIP 等级 |
| `memberSubType` | `number` | 会员子类型 |
| `isSubscription` | `number` | 是否订阅 |
| `isSuperVip` | `boolean` | 是否超级会员 |
| `isSuperYearVip` | `boolean` | 是否超级年费会员 |
| `superMemberSubType` | `number` | 超级会员子类型 |
| `superIsSubscription` | `number` | 超级会员订阅状态 |

---

## `radar_chart` 雷达图

平台用七维雷达图描述玩家打法风格。每个维度（除 `description` 外）结构相同：

```json
{
  "score": "65",
  "score_base": "100",
  "level": "B",
  "detail": { /* 子指标，见下表 */ }
}
```

| 维度键 | 中文含义 | 等级示例 |
|--------|----------|----------|
| `fire_power` | 火力 | C / B / A / S |
| `marksmanship` | 枪法精准度 | C / B / A / S |
| `follow_up_shot` | 补枪/协作 | C / B / A / S |
| `first` | 开路/首杀 | C / B / A / S / D |
| `item` | 道具使用 | C / B / A / S |
| `1vn` | 残局 1vN | C / B / A / S |
| `sniper` | 狙击 | C / B / A / S / D |
| `description` | `string` | 风格描述文案，如「不懈可击的枪法艺术家」 |

> `score` 在原始数据中为字符串，解析时需转数字。`level` 为字母评级。

### 各维度 `detail` 子指标

子指标命名规律：`{指标名}_raw` 为原始值，`{指标名}` 为百分制得分，`{指标名}_base` 为基准分。

#### `fire_power`（火力）

| 子字段 | 含义 |
|--------|------|
| `kills_per_round_raw` | 场均击杀 |
| `rounds_with_a_kill_raw` | 有击杀回合占比 |
| `kills_per_win_round_raw` | 胜局场均击杀 |
| `we_raw` | WE 值（影响力指数） |
| `damage_per_round_raw` | 场均伤害 |
| `multi_kill_rounds_percentage_raw` | 多杀回合占比 |
| `damage_per_round_win_raw` | 胜局场均伤害 |
| `pistol_round_rating_raw` | 手枪局 Rating |

#### `marksmanship`（枪法）

| 子字段 | 含义 |
|--------|------|
| `headshot_rate_raw` | 爆头率 |
| `kill_time_raw` | 击杀用时（ms） |
| `rapid_stop_rate_raw` | 急停成功率 |
| `sm_hit_rate_raw` | 烟雾穿射命中率 |
| `reaction_time_raw` | 反应时间（ms） |

#### `follow_up_shot`（补枪）

| 子字段 | 含义 |
|--------|------|
| `saved_teammate_per_round_raw` | 场均救队友次数 |
| `trade_kills_per_round_raw` | 场均补枪击杀 |
| `trade_kills_percentage_raw` | 补枪击杀占比 |
| `assist_kills_percentage_raw` | 助攻击杀占比 |
| `damage_per_kill_raw` | 每杀伤害 |

#### `first`（开路）

| 子字段 | 含义 |
|--------|------|
| `first_hurt_raw` | 首伤次数 |
| `first_kill_raw` | 首杀次数 |
| `first_rate_raw` | 首杀率 |
| `first_success_rate_raw` | 首杀成功率 |
| `win_after_opening_kill_raw` | 开路首杀后胜率 |

#### `item`（道具）

| 子字段 | 含义 |
|--------|------|
| `item_rate_raw` | 道具使用率 |
| `utility_damage_per_rounds_raw` | 场均道具伤害 |
| `flashbang_flash_rate_raw` | 闪光弹致盲率 |
| `flash_assist_per_round_raw` | 场均闪光助攻 |
| `time_opponent_flashed_per_round_raw` | 场均致盲对手时长 |

#### `1vn`（残局）

| 子字段 | 含义 |
|--------|------|
| `clutch_points_per_round_raw` | 场均残局得分 |
| `last_alive_percentage_raw` | 最后存活占比 |
| `v1_win_percentage_raw` | 1v1 胜率 |
| `time_alive_per_round_raw` | 场均存活时间 |
| `saves_per_round_loss_raw` | 败局场均保枪次数 |

#### `sniper`（狙击）

| 子字段 | 含义 |
|--------|------|
| `sniper_kill_per_round_raw` | 场均狙击击杀 |
| `sniper_kills_percentage_raw` | 狙击击杀占比 |
| `rounds_with_sniper_kills_percentage_raw` | 有狙击击杀的回合占比 |
| `sniper_multiple_kill_round_percentage_raw` | 狙击多杀回合占比 |
| `sniper_first_kill_percentage_raw` | 狙击首杀占比 |

---

## `recent_10_stats` 近 10 场

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `pw_rating_avg` | `string` | `"1.10"` | 近 10 场 Rating 均值 |
| `pw_rating_list` | `string[]` | `["0.94","0.79",...]` | 近 10 场每场 Rating（字符串数组，共 10 项） |
| `we_avg` | `string` | `"8.9"` | 近 10 场 WE 均值 |
| `we_list` | `string[]` | `["5.9","6.8",...]` | 近 10 场每场 WE |
| `win_stats` | `string[]` | `["lose","win","draw",...]` | 近 10 场结果：`win` / `lose` / `draw` |

---

## `perfectPower` 完美战力

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `perfectPower` | `number` | `3997` | 完美战力值 |
| `steamId` | `string` | Steam ID | 对应玩家 |
| `hidden` | `boolean` | `false` | 是否隐藏战力 |
| `preferredRankType` | `number \| null` | `4` / `null` | 偏好排行榜类型 |
| `achievedRankList` | `array \| null` | 见下 | 已达成地区/高校排名 |

`achievedRankList` 单项结构：

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| `rank` | `number` | `2` | 排名 |
| `rankDesc` | `string` | `"长春中医药大学"` | 排名描述（高校名或地区名） |
| `rankType` | `number` | `4` | 排行榜类型（`3` 地区，`4` 高校等） |

---

## 本项目字段映射速查

原始字段 → 内部 `MatchPlayer` / `MatchDetail` 的对应关系：

| 内部字段 | 来源 |
|----------|------|
| `steamId` | `players.player_id` |
| `nickname` | `extrainfo.nickname` |
| `avatar` | `extrainfo.avatar` / `csgoRgbAvatar`（见 `media-url.ts`） |
| `score` | `players.score` 或 `extrainfo.score` |
| `teamSide` | `players.roll_team_id` → 回退 `slot_type` |
| `isSingle` | `players.is_single` |
| `troopTeamId` | `players.troop_team_id` |
| `isGreen` | `players.is_green` 或 `extrainfo.is_green` |
| `adpr` | `extrainfo.adpr` |
| `rating` | `recent_10_stats.pw_rating_avg`（近期 Rating） |
| `seasonRating` | `season_rating_pro_average`（赛季 Rating） |
| `kd` | 由 `fire_power.kills_per_round_raw` 与 `rounds_with_a_kill_raw` 估算 |
| `hsRate` | `marksmanship.headshot_rate_raw` |
| `firstKillSuccessRate` | `first.first_success_rate_raw` |
| `rapidStopSuccessRate` | `marksmanship.rapid_stop_rate_raw` |
| `clutchWinRate` | `1vn.v1_win_percentage_raw` |
| `weRaw` / `weAvg` | `fire_power.we_raw` / `recent_10_stats.we_avg` |
| `recentWinRate` | 由 `win_stats` 计算（平局不计入分母） |
| `seasonWinRate` | `season_win_num / season_total_num` |
| `mapWinRate` | `season_map_win_num / season_map_total_num` |
| `perfectPower` / `rankDesc` | `perfectPower.perfectPower` / `achievedRankList[0].rankDesc` |
| `radar` | `radar_chart` 各维度的 `score` + `level` |

---

## 注意事项

1. **`playerlist_extrainfo` 是字符串**：必须先 `JSON.parse`，再取 `.data` 对象。
2. **类型不一致**：部分数值字段（如 `season_map_win_num`、雷达 `score`）在原始数据中可能是字符串，解析时需兼容。
3. **`avatarBorder` 可能为空数组**：不能假定始终是对象。
4. **样例来源**：`匹配数据response.txt`（10 人竞技，`de_dust2`，绿色匹配）。
5. **未使用字段**：`player_status`、`player_game_role`、`is_abs_balance`、`is_black`、`is_bp_mode` 等在本项目中暂未消费，保留供后续功能扩展。

---

## 最小可读示例（结构示意）

```json
{
  "platform_game_id": "9222775918321036300",
  "map_name": "de_dust2",
  "players": [
    {
      "player_id": "76561198348200662",
      "slot_type": 1,
      "score": 2101,
      "roll_team_id": 1,
      "is_single": 1,
      "troop_team_id": 946149772,
      "is_green": 1
    }
  ],
  "ready_left_time_ms": 30000,
  "playerlist_extrainfo": "{\"success\":true,\"code\":0,\"data\":{...}}",
  "is_green": 1,
  "is_single": 1,
  "is_grudge_match": false
}
```

完整样例请参阅项目根目录 `匹配数据response.txt`。
