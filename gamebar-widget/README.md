# Game Bar 小组件（CS匹配助手）

独立于主程序的 UWP Xbox Game Bar Widget，通过本机 HTTP 接口读取急停评估与开枪稳定快照。

## 用户安装（推荐）

在 CS 匹配助手主程序中打开「急停助手」→「HUD 显示」→「Game Bar 全屏 HUD」，点击 **安装 CS匹配助手 小组件**。主程序会自动下载、校验并请求一次 UAC 完成安装。

## 高级用户：手动安装

从 GitHub Release 或 CDN 下载 `CSMatchHelperGameBarWidget-A.B.C.zip`，解压后以管理员身份运行 `install.ps1`。

`dist/` 内含：

- `CSMatchHelperWidget.msix` — 预编译安装包
- `CSMatchHelperWidget.cer` — 签名证书（安装时自动信任）
- `Dependencies/x64/*.appx` — 运行时依赖
- `install.ps1` — 一键安装（证书 + 卸载旧包 + 装包 + loopback 豁免）

发版产物仅为 **`CSMatchHelperGameBarWidget-A.B.C.zip`**（zip 内包含上述安装文件）。

安装脚本会自动卸载旧包名 `CSMatchHelper.CounterStrafingHudWidget`。

## 版本管理

Widget 使用独立版本，真源为 `gamebar-widget/widget-version.json`：

```bash
npm run widget:version:get
npm run widget:version:set 1.0.2
npm run widget:version:verify
```

构建前会自动同步到 `Package.appxmanifest` 的 `Identity Version`（四段版本，如 `1.0.2.0`）。

Widget 版本**不必与主程序 exe 版本相同**。每次主程序 GitHub Release `vX.Y.Z` 都会附带当前 Widget zip；若 Widget 未变更，发版时可复用已有 zip：

```bash
npm run widget:ensure-zip
```

## 开发者：构建发版包

前置：安装 Visual Studio **「通用 Windows 平台开发」** 工作负载。

以管理员身份运行：

```powershell
cd gamebar-widget
.\build-release.ps1
```

或从仓库根目录：

```bash
npm run build:widget
```

输出：

- `gamebar-widget/dist/` — 本地分发目录
- `release/gamebar-widget/CSMatchHelperGameBarWidget-A.B.C.zip` — 发版 zip（由 `package-release.ps1` 生成）

单独打包 zip（需先构建 dist）：

```powershell
.\package-release.ps1
```

发版时 Widget 上传到 Lunaris project `cs-match-helper-widget`；GitHub Release 与主程序 exe 共用同一 tag `vX.Y.Z`，但 zip 文件名中的版本为 Widget 独立版本。

## 开发者：本地调试安装

不打包 msix，直接从源码 loose-file 注册（需开发者模式）：

```powershell
cd gamebar-widget
.\install.ps1
```

## 使用

1. 启动 CS 匹配助手，进入「急停助手」并开始记录
2. 进入 CS2（默认 DX11 全屏即可）
3. 按 `Win+G` 打开 Xbox Game Bar
4. 在小组件库中找到「**CS匹配助手**」，点击固定（Pin）

## 卸载

```powershell
cd gamebar-widget
.\uninstall.ps1
```

或在主程序侧调用 `uninstall_gamebar_widget`（后续可在设置页暴露）。

## 能力边界

- **支持**: CS2 默认 DX11 全屏（flip-model / FSO）
- **不支持**: Vulkan 全屏（`-vulkan`）、极少数真 legacy 独占全屏

## 与主程序的耦合

- HTTP：`GET /snapshot` JSON 契约（camelCase）；默认 `127.0.0.1:39281`，端口冲突时主程序自动选用 `39281-39290` 并写入 `%LOCALAPPDATA%\CSMatchHelper\gamebar-widget\ipc-port.json`，Widget 自动发现
- 安装/更新：由主程序 Tauri commands 代管（`get_gamebar_widget_status`、`check_gamebar_widget_update`、`install_or_update_gamebar_widget`）
- 更新发现：读取 GitHub latest release 中的 Widget zip 附件名；下载优先 Lunaris `cs-match-helper-widget`，失败回退 GitHub Release 附件
