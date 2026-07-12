<div align="center">

<img src="https://github.com/user-attachments/assets/10ae99ab-5738-4780-a9c4-87ea0cdca1ba" width="128" height="128" alt="CS 匹配助手" />

# CS 匹配助手

<p>
  <a href="https://github.com/qianjiachun/cs-match-helper/stargazers"><img src="https://img.shields.io/github/stars/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=FFF3C4&color=EAB308&logoColor=333" alt="GitHub stars" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/releases"><img src="https://img.shields.io/github/downloads/qianjiachun/cs-match-helper/total?style=flat-square&logo=github&labelColor=D1FAE5&color=16A34A&logoColor=333" alt="All releases downloads" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/releases/latest"><img src="https://img.shields.io/github/v/release/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=E9E0FF&color=7C3AED&logoColor=333" alt="Latest release" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/releases/latest"><img src="https://img.shields.io/github/release-date/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=CFFAFE&color=0891B2&logoColor=333" alt="Release date" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/graphs/commit-activity"><img src="https://img.shields.io/github/commit-activity/m/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=FFEDD5&color=EA580C&logoColor=333" alt="Commit activity" /></a>
  <a href="https://space.bilibili.com/193482"><img src="https://img.shields.io/badge/Bilibili-小淳-FB7299?style=flat-square&logo=bilibili&labelColor=FB7299&color=FB7299&logoColor=white" alt="Bilibili" /></a>
</p>

在匹配准备阶段自动读取对局信息，展示双方选手数据、实力对比与赛前 AI 分析。

[**软件下载**](https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download) · [**GitHub Release 下载**](https://github.com/qianjiachun/cs-match-helper/releases/latest)

</div>

## 界面预览

<p align="center">
  <img src="https://github.com/user-attachments/assets/7b4d7716-20bb-4343-9362-54681fd9867e" width="32%" alt="对局数据面板" />
  <img src="https://github.com/user-attachments/assets/dc70a30e-2c2b-447d-b633-27368f483431" width="32%" alt="队伍对比" />
  <img src="https://github.com/user-attachments/assets/fd436175-01e8-410e-865c-e1b5489b77eb" width="32%" alt="AI 赛前分析" />
</p>

## 功能

- ⚡ **极致轻量**：6 MB、内存占用低、启动迅速，不影响游戏帧数
- 🖱️ **开箱即用**：无需安装，匹配进入准备界面后自动读取并展示数据，无需手动操作或复杂配置
- 🗺️ **对局信息**：地图、倒计时、双方阵容
- 📊 **选手数据**：段位、输出、评分、赛季统计等
- ⚔️ **队伍对比**：雷达图、组排识别
- 🤖 **AI 分析**：胜率预测与赛前评估（需配置 DeepSeek 密钥）
- 💬 **玩家评论**：对局页查看/发表评论，设置页管理我的评论历史
- 🎮 **多平台**：完美对战平台、5E 对战平台
- 🎯 **急停助手**：量化开枪稳定与急停质量，支持游戏内 HUD 与 Game Bar 小组件（详见下文）

## 支持平台

- 完美对战平台
- 5E 对战平台

## 使用

1. 从 [软件下载](https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download) 或 [GitHub Release](https://github.com/qianjiachun/cs-match-helper/releases/latest) 下载 `cs-match-helper.exe` 并运行
2. 启动对战平台并完成匹配
3. 进入准备界面后，应用自动展示对局数据
4. 可选：在设置中配置 DeepSeek API Key 以启用 AI 分析；在「我的评论」中管理历史评论

## 急停助手

通过监听本机**方向键、蹲键与开火键**输入，结合移速模型估算移动状态与按键时机，**不读取游戏内存、不注入游戏进程**。适合在死斗、练枪与实战中持续记录并复盘身法习惯。

**两项独立指标：**

| 指标 | 说明 |
|------|------|
| **开枪稳定** | 评估每次开火瞬间是否已停稳——柱状图展示最近射击记录，统计平均误差与稳定占比 |
| **急停评估** | 评估同轴方向切换（如 A→D）的按键衔接——折线图展示时机偏差，区分完美 / 优秀 / 偏早 / 偏晚 |

> 急停评估灵感来源于 [cs2.keyiu.cn](http://cs2.keyiu.cn/)

**显示方式**（在急停助手「控制台」中选择）：

- **游戏内悬浮窗** — 适用于窗口化、全屏窗口化或无边框全屏
- **Game Bar 小组件** — 适用于独占全屏；需安装 Xbox Game Bar 与 CS 匹配助手小组件，可在应用内一键安装

<p align="center">
  <img src="https://github.com/user-attachments/assets/41a1fc5c-44fc-412a-bd38-3e55aca16e8b" width="36%" alt="急停助手 Game Bar 小组件" />
</p>

**快速上手：**

1. 在顶栏点击 **急停助手** 进入独立页面
2. 在「控制台」选择显示模式，开启记录
3. 首次使用建议以**管理员身份运行**（用于全局键盘监听）；全屏模式需在页面内安装 Game Bar 小组件
4. 进入游戏后即可在 HUD / 小组件中查看实时数据；「数据」页查看汇总统计，「说明」页有完整指标释义

支持自定义键位、HUD 字号/线宽/透明度，以及高级移速模型与判定参数。

## 系统要求

- Windows 10 或更高版本
- 需要安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 通常已预装；若界面空白或动画异常，请先安装/更新 WebView2）
- 急停助手全局键位监听建议以管理员身份运行；Game Bar 全屏模式需安装 [Xbox Game Bar](https://apps.microsoft.com/detail/9NZKPSTSNW4P)

## 安全声明

- 本软件不修改游戏文件，不注入游戏进程，无任何作弊相关操作
- 急停助手仅监听本机键盘输入并结合移速模型估算，不读取游戏内存或网络数据
- AI 分析需用户自行配置 DeepSeek 密钥，密钥仅保存在本机
- 评论功能通过匿名 clientKey 标识作者，不关联真实账号信息

## 作者

小淳 · [GitHub](https://github.com/qianjiachun/) · [Bilibili](https://space.bilibili.com/193482)

MIT License
