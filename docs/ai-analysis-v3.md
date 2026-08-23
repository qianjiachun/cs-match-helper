# AI 分析 V3

AI 分析 V3 保留校准胜率与独立报告页，将 V2 的“重点玩家”改为有明确方向的玩家信号。

## 输出契约

当前结果统一归一化为 `AiAnalysisResultV3`：

- `modelWinProbability`：模型原始概率。
- `winProbability`：按本地数据覆盖率向 50% 收敛后的展示概率。
- `decisiveFactors`：最多 4 项决定本局的因素。
- `playerSignals`：最多 4 人、每队最多 2 人。
- `teamPlans`：双方各最多 2 条取胜条件与 2 条隐患。
- `uncertainties`：集中记录地图未知、缺失数据与低样本等边界。

玩家信号类型：

| kind | 含义 | 新模型门槛 |
|---|---|---|
| `carry` | 强点 | 两个不同维度的中高可靠度正面证据 |
| `anchor` | 支点 | 两项首杀、道具、残局或状态正面证据 |
| `specialist` | 专长 | 充足地图样本或明确武器专项样本 |
| `weakLink` | 短板 | 两个不同维度的中高可靠度负面证据 |
| `volatile` | 变量 | 同时存在中高可靠度正面与负面证据 |
| `watch` | 旧关注 | 仅用于 V1/V2 历史兼容，新模型禁止输出 |

## 本地证据

玩家数值证据在发送给模型前由本地计算：

- 原始值、全场中位数、队内中位数。
- 相对全场和队内的差值。
- `positive / negative / mixed / neutral` 方向。
- 样本量和 `high / medium / low` 可靠度。
- 反应时间等越低越好的指标会反向计算。

模型只能引用证据 ID。未知 ID、非本局 SteamID、重复玩家、超额信号以及不满足分类门槛的信号会在本地丢弃。

## 胜率校准

数据覆盖率仍按基础统计 65%、当前地图样本 25%、阵容完整度 10% 计算：

```text
calibratedA = round(50 + (modelA - 50) * dataCoverage)
calibratedB = 100 - calibratedA
```

最终可信度为 70% 本地覆盖率加 30% 模型自评。双方差距不超过 4% 时显示均势。

## 历史兼容

历史结果只在读取时转换，不改写旧文件：

- V2：`threat → carry`、`risk → weakLink`、`key → watch`。
- V1：`role=risk → weakLink`，其他玩家说明转为 `watch`。
- V2 `matchupEdges` 转为 `decisiveFactors`，`winConditions` 转入双方取胜路径。

AI 历史 section 当前版本为 3，新结果只保存 V3。

## 界面

主表格固定保留 40px AI 信号列。信号只显示图标，完整点击区域为 40×40px；悬停或键盘聚焦后展示结论和最多两项真实指标，点击可定位到 AI 报告中的对应玩家。

首次出现的信号只播放一次图标入场与类型色行扫光，不循环，也不读取系统动画设置。
