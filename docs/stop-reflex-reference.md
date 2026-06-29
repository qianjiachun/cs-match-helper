# 急停功能开发参考

这份文档记录本轮「急停」功能探索中值得保留的核心设计。后续如果还原代码，可按本文重新实现；Game Bar 相关只作为路线参考，不视为当前可用实现。

## 功能目标

急停训练的核心目标是测量玩家在反向移动时的按键衔接时间：

- 从 `A` 切到 `D`、从 `D` 切到 `A` 属于横向急停。
- 从 `W` 切到 `S`、从 `S` 切到 `W` 属于纵向急停。
- 记录「松开原方向」与「按下反方向」之间的时间差。
- 差值越接近 `0ms`，说明急停越干净。

建议沿用的语义：

- `diffMs < 0`：按早了，反方向已经按下后才松开原方向。
- `diffMs > 0`：按晚了，松开原方向后才按下反方向。
- `abs(diffMs) <= perfectThresholdMs`：完美急停。
- `abs(diffMs) <= successThresholdMs`：成功急停。

默认阈值建议：

- `perfectThresholdMs = 2.0`
- `successThresholdMs = 10.0`
- `historyLimit = 100`
- 过滤 `abs(diffMs) > 200ms` 的动作
- 过滤 `50ms` 内重复触发，避免抖动和重复事件

## 核心数据模型

建议保持模型简单，所有字段都使用 camelCase 方便前端和外部 HUD 读取。

```rust
enum MovementKey {
    A,
    D,
    W,
    S,
}

enum Axis {
    Horizontal,
    Vertical,
}

enum TimingKind {
    Early,
    Late,
    Perfect,
}
```

`MovementKey` 至少需要两个方法：

```rust
impl MovementKey {
    fn axis(self) -> Axis {
        match self {
            MovementKey::A | MovementKey::D => Axis::Horizontal,
            MovementKey::W | MovementKey::S => Axis::Vertical,
        }
    }

    fn opposite(self) -> MovementKey {
        match self {
            MovementKey::A => MovementKey::D,
            MovementKey::D => MovementKey::A,
            MovementKey::W => MovementKey::S,
            MovementKey::S => MovementKey::W,
        }
    }
}
```

单条记录建议包含：

```rust
struct StopReflexRecord {
    axis: Axis,
    from_key: String,
    to_key: String,
    diff_ms: f64,
    timing: TimingKind,
    timing_label: String,
    is_perfect: bool,
    is_success: bool,
    timestamp_ms: u64,
}
```

快照建议包含：

```rust
struct StopReflexSnapshot {
    active: bool,
    listening: bool,
    hud_visible: bool,
    cs2_foreground: bool,
    records: Vec<StopReflexRecord>,
    avg_diff_ms: f64,
    success_rate: f64,
    std_dev_ms: f64,
    tendency: String,
    tendency_label: String,
    last_record: Option<StopReflexRecord>,
}
```

## 判定算法

引擎内部维护两类状态：

- `KeyState`：每个方向键当前是否按下，以及最近一次按下时间。
- `AxisState`：某条轴上是否正在等待反方向按下，以及原方向松开时间。

核心逻辑分为两条路径。

### 路径一：先松开，再按反方向

例子：`A down` -> `A up` -> `D down`

1. `A up` 时发现 `D` 当前没按下。
2. 横轴进入 `waitingForOpposite` 状态，记录：
   - `releasedKey = A`
   - `releaseTime = A up time`
3. 后续 `D down` 时，如果横轴正在等待且 `D` 是 `A` 的反方向：
   - `diff = D down time - A up time`
   - 得到正数，表示按晚了。

伪代码：

```rust
fn on_key_up(key, time) {
    let opposite = key.opposite();
    if key_state[opposite].pressed {
        record(key, opposite, key_state[opposite].time - time);
    } else {
        axis_state[key.axis()] = Waiting {
            released_key: key,
            release_time: time,
        };
    }
}

fn on_key_down(key, time) {
    let axis = key.axis();
    if axis_state[axis].waiting_for_opposite
        && axis_state[axis].released_key.opposite() == key
    {
        record(axis_state[axis].released_key, key, time - axis_state[axis].release_time);
        axis_state[axis] = Idle;
    }
}
```

### 路径二：先按反方向，再松开原方向

例子：`A down` -> `D down` -> `A up`

1. `D down` 会先更新 `D` 的按下时间。
2. `A up` 时发现 `D` 当前已经按下。
3. `diff = D down time - A up time`
4. 因为 `D down time < A up time`，差值为负数，表示按早了。

这个路径很重要，因为真实玩家急停常常会出现重叠按键。如果只处理「松开后再按」会漏掉按早的情况。

## 记录过滤与统计

记录前建议做两个过滤：

```rust
const MAX_DIFF_SECS: f64 = 0.2;
const MIN_RECORD_INTERVAL_SECS: f64 = 0.05;
```

- `abs(diffSecs) > MAX_DIFF_SECS`：不是一次有效急停，丢弃。
- 距离上一条记录小于 `MIN_RECORD_INTERVAL_SECS`：视为重复触发，丢弃。

记录生成时：

```rust
let diff_ms = (diff_secs * 1000.0 * 10.0).round() / 10.0;
let timing = if diff_ms.abs() <= perfect_threshold {
    TimingKind::Perfect
} else if diff_ms < 0.0 {
    TimingKind::Early
} else {
    TimingKind::Late
};
```

快照统计：

- `avgDiffMs`：历史 `diffMs` 平均值，保留 1 位小数。
- `successRate`：`isSuccess` 数量 / 总记录数量，百分比保留 1 位小数。
- `stdDevMs`：历史 `diffMs` 标准差。
- `tendency`：
  - 平均值 `< -5ms`：整体偏早。
  - 平均值 `> 5ms`：整体偏晚。
  - 其他：正常。

## 运行时结构

建议把功能拆成四层：

1. `types`：纯数据结构，不依赖 Tauri 或 Windows API。
2. `engine`：纯算法，只接收按键事件并产出记录，可单元测试。
3. `runtime`：Tauri 状态管理、设置读写、事件广播、HUD 开关。
4. `win_input`：Windows 低级键盘 Hook、CS2 前台检测、HUD 窗口定位。

这样做的好处是：算法可独立测试，Windows 相关问题不会污染核心逻辑。

建议 Tauri 命令：

- `load_stop_reflex_settings`
- `save_stop_reflex_settings`
- `get_stop_reflex_snapshot`
- `clear_stop_reflex_records`
- `start_stop_reflex`
- `stop_stop_reflex`
- `show_stop_reflex_hud`
- `hide_stop_reflex_hud`

设置建议写入现有设置文件的独立字段，例如：

```json
{
  "stopReflex": {
    "enabled": true,
    "displayMode": "transparentWindow",
    "horizontalEnabled": true,
    "verticalEnabled": true,
    "perfectThresholdMs": 2,
    "successThresholdMs": 10,
    "onlyWhenCs2Foreground": true
  }
}
```

## Windows 输入采集

推荐方案仍是 `WH_KEYBOARD_LL` 低级键盘 Hook：

- 只监听 `A/D/W/S`。
- Hook 回调里不要做复杂逻辑，只把事件发送到 channel。
- 在普通线程里消费 channel，再调用引擎。
- 每条事件记录：
  - `key`
  - `isDown`
  - `timeSecs`
  - `timestampMs`

注意事项：

- Hook 回调必须尽快返回，并调用 `CallNextHookEx`。
- 不要在 Hook 回调中直接锁 Tauri state。
- `onlyWhenCs2Foreground` 建议在 runtime 层判断，而不是 Hook 层判断。
- 停止训练时需要释放 Hook，并停止前台窗口轮询线程。

CS2 前台检测可用：

1. `GetForegroundWindow`
2. `GetWindowThreadProcessId`
3. `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`
4. `GetModuleBaseNameW`
5. 判断进程名是否为 `cs2.exe`

## 透明窗口 HUD

透明窗口是当前更稳的路线，适合先做可用版本。

实现建议：

- 使用独立 Tauri Webview Window，例如 label：`stop-reflex-hud`。
- 窗口属性：
  - `decorations(false)`
  - `transparent(true)`
  - `always_on_top(true)`
  - `skip_taskbar(true)`
  - `resizable(false)`
  - `focused(false)`
  - 初始 `visible(false)`
- 创建后设置鼠标穿透：
  - Tauri 层：`set_ignore_cursor_events(true)`
  - Win32 扩展样式：`WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE`

位置逻辑：

- 优先查找 `cs2.exe` 可见窗口矩形。
- 找不到 CS2 时使用主屏幕矩形。
- 根据 `hudAnchor` 计算位置：
  - `topLeft`
  - `topCenter`
  - `topRight`
  - `bottomLeft`
  - `bottomCenter`
  - `bottomRight`
- 每 `250ms` 更新一次位置即可。

已知限制：

- 透明窗口无法覆盖 CS2 独占全屏。
- 对无边框全屏/窗口化全屏可用。
- 多显示器和 DPI 需要实机验证。

## 本机 IPC

如果未来需要外部 HUD（例如 Game Bar Widget、独立 overlay 进程），建议主程序提供一个只读本机 HTTP 快照接口。

本轮验证过的简单方案：

- 监听 `127.0.0.1:39281`
- 返回最新 `StopReflexSnapshot`
- `Content-Type: application/json; charset=utf-8`
- `Access-Control-Allow-Origin: *`
- 只读，无控制命令

最小响应示意：

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Access-Control-Allow-Origin: *
Connection: close
Content-Length: ...

{"active":true,"listening":true,"records":[]}
```

这个接口的职责应保持很窄：只给外部显示层读数据，不负责启动训练、改设置或写入状态。

## Game Bar 路线建议

Game Bar 的方向理论上适合解决 CS2 独占全屏 HUD，但本轮实现不稳定，不建议保留当前代码细节。

后续如果重做，建议按路线而不是沿用现有实现：

1. 先用微软官方 `XboxGameBarSamples` 创建一个最小可运行 Widget，确认系统、证书、开发者模式、Game Bar 版本都正常。
2. 不要一开始接入急停数据，先只显示静态文本并验证：
   - 开始菜单启动不崩
   - Win+G 能加载 Widget
   - Widget 能固定
   - 关闭/重新打开稳定
3. 再接入本机 HTTP 快照接口。
4. UWP Widget 中优先使用系统 API：
   - HTTP：`Windows.Web.Http.HttpClient`
   - JSON：`Windows.Data.Json`
5. 谨慎处理 UWP UI 线程：
   - UI 更新必须在 UI 线程。
   - 定时器建议用 `DispatcherTimer`。
   - 不要把异常静默吞掉，否则容易只看到 Game Bar 占位提示或启动图。
6. 安装脚本必须处理：
   - 开发人员模式
   - 证书信任
   - 旧包卸载
   - loopback exemption

Game Bar 风险点：

- 侧载 UWP 对开发者模式、证书、包版本、Game Bar 版本非常敏感。
- 开始菜单可运行不等于 Game Bar 宿主能运行。
- UWP app container 访问 `127.0.0.1` 需要 loopback exemption。
- 崩溃日志经常只有 `0xe0434352`，需要用最小样例逐步排查。

如果目标是尽快交付功能，建议先发布透明窗口 HUD；Game Bar 作为后续兼容独占全屏的单独实验分支。

## 单元测试建议

核心算法必须有单元测试，且不依赖 Windows API。

至少覆盖：

- 松开后再按反方向，生成正数 `diffMs`，标记 `Late`。
- 先按反方向再松开，生成负数 `diffMs`，标记 `Early`。
- `abs(diffMs) <= perfectThresholdMs` 标记 `Perfect`。
- `abs(diffMs) > 200ms` 被过滤。
- `50ms` 内重复事件被过滤。
- `successRate`、`avgDiffMs`、`stdDevMs` 计算正确。
- 横向和纵向开关分别生效。
- `onlyWhenCs2Foreground` 为 true 且 CS2 非前台时不记录。

## 实机验证清单

按键：

- `A -> D` 可记录。
- `D -> A` 可记录。
- `W -> S` 可记录。
- `S -> W` 可记录。
- 按早显示负值。
- 按晚显示正值。
- 极端间隔不记录。
- 高频重复不刷屏。

透明 HUD：

- 无边框全屏可见。
- 普通桌面可见。
- HUD 不拦截鼠标。
- HUD 跟随 CS2 窗口移动。
- CS2 非前台时可按配置暂停记录。

性能：

- 长时间开启 CPU 占用稳定。
- 按键到 HUD 更新延迟应接近实时。
- 停止训练后 Hook 和后台线程能释放。

## 下次重做建议

建议开发顺序：

1. 先实现 `types` 和 `engine`，补齐单元测试。
2. 接入 Tauri runtime 和设置读写。
3. 接入 Windows 键盘 Hook。
4. 做透明窗口 HUD。
5. 增加本机只读 IPC。
6. 最后再单独开分支探索 Game Bar。

最核心的原则：急停算法必须保持纯净，Game Bar、Tauri 窗口、Windows Hook 都只是输入/输出适配层。
