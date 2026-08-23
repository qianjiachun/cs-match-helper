---
name: git-release
description: CS 匹配助手的单文件 EXE 发布流程，覆盖版本设置、质量门禁、构建、Lunaris CDN、Git 提交与推送、GitHub Release 和断点续跑。用于用户要求发版、release、publish、GitHub Release、Lunaris、版本发布或继续发布时；发布说明必须使用中文。
---

# CS 匹配助手发版

## 发布契约

| 项目 | 值 |
| --- | --- |
| 仓库 | `qianjiachun/cs-match-helper` |
| 版本真源 | `package.json` |
| GitHub tag | `vX.Y.Z` |
| 本地产物 | `release/cs-match-helper.exe` |
| Lunaris project | `cs-match-helper` |
| 更新通道 | `latest.json`（随 exe 上传到同一 Lunaris 版本） |

本产品只发布匹配助手主程序。GitHub Release 只能附带 `cs-match-helper.exe`，不得构建、检查或上传 HUD、GSI 或 Game Bar Widget 产物。

自动更新检测并行读取 GitHub Releases API 与 CDN `https://cdn.lunaris.win/qianjiachun/cs-match-helper/latest.json?download`。exe 下载仍走 Lunaris。`npm run release:lunaris` 会同时上传 exe 与 `latest.json`，日常发版无需额外操作。

## 发布前提

- 首次发版必须由用户明确给出目标版本 `X.Y.Z`；不得猜测版本或自行决定版本增量。
- “继续发版”“重试发版”属于断点续跑，可从当前版本和 `release:status` 恢复，不要求用户重复版本号。
- 用户明确要求发布即授权执行完成该版本所需的版本修改、构建、Lunaris 上传、提交、推送和 GitHub Release；若用户限制其中某一步，以用户限制为准。
- 不提交 `.env`、密钥、`release/`、构建目录或缓存，不移动既有 tag，不 force push，不跳过 hooks。
- 发布远程操作前确认 `gh` 登录状态和 `LUNARIS_API_KEY` 可用；不要输出凭据内容。

## 命令边界

- `npm run build`：构建并复制单文件 EXE，不上传。
- `npm run build:release`：构建并复制 EXE，随后上传主程序到 Lunaris。
- `npm run release:lunaris`：复用现有 `release/cs-match-helper.exe`，上传 exe 与 `latest.json` 到 Lunaris，不重新构建。
- `npm run release:status -- X.Y.Z`：检查目标版本当前进度并返回 `nextStep`（含 CDN exe 与 `latest.json`）。

README 使用固定 latest 下载地址。发版时只检查链接是否仍指向本仓库和 `cs-match-helper` Lunaris 项目；链接正确时不要为发版制造无意义的 README 改动。

## 首次发布流程

1. 规范化用户版本为 `X.Y.Z`，确认 tag `vX.Y.Z` 不与既有发布冲突。
2. 检查分支、远程、工作区、最近提交和 tags；识别并保留用户无关修改。
3. 运行 `npm run release:status -- X.Y.Z`，从返回的 `nextStep` 开始，不重复已完成步骤。
4. 版本步骤执行 `npm run version:set X.Y.Z` 和 `npm run version:verify`。
5. 在第一次构建或远程上传前执行质量门禁：

```powershell
npm run audit:product-boundary
npm exec vue-tsc -- --noEmit
npm test
npm run build:frontend
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

6. 按 `nextStep` 推进构建、Lunaris、提交、推送和 GitHub Release。
7. 最后再次执行 `npm run release:status -- X.Y.Z`，必须得到 `nextStep: "done"`。

## 断点续跑

每次继续发布都先运行：

```powershell
npm run release:status -- X.Y.Z
```

严格按真实 `nextStep` 执行：

| `nextStep` | 操作 |
| --- | --- |
| `version` | `npm run version:set X.Y.Z`，然后 `npm run version:verify` |
| `build` | 确认质量门禁通过后执行 `npm run build:release` |
| `lunaris` | 只执行 `npm run release:lunaris`，不得重新构建。上传前若有中文发布说明，写入 `release/notes.md`（不提交），供 `latest.json` 与 GitHub Release 复用。 |
| `commit` | 按 `git-commit` skill 创建 `release: vX.Y.Z` 提交 |
| `push` | 推送当前发布提交及 tag 所需历史 |
| `github-release` | 创建 `vX.Y.Z` Release，只附 EXE |
| `done` | 停止操作并报告发布完成 |

已完成步骤不得重跑。尤其是 EXE 已存在而只缺 CDN 上传时，只运行 `release:lunaris`；不要运行 `build:release` 覆盖已校验产物。

## 提交与 GitHub Release

- 发布提交只暂存版本配置、源码和确有必要的文档变更，不暂存 `release/`。
- 提交标题使用 `release: vX.Y.Z`。
- 推送后创建 GitHub Release，标题使用 `vX.Y.Z`，只附：

```text
release/cs-match-helper.exe
```

- Release notes 使用中文，只描述用户可感知的匹配助手功能、修复和体验变化，例如 5E、完美、对局历史、AI 分析或玩家评论。优先复用 `release/notes.md`。
- 排除调试工具、Mock、日志增强、内部重构、脚本、skill、`.cursor` 配置和其他纯开发内容。
- 创建或更新 Release 后校验附件名称、Lunaris 版本、`latest.json` 的 `version`、SHA-256 响应头和 `release:status`。

任一步骤失败时停止后续步骤，保留当前产物和状态，报告失败位置与可重试的 `nextStep`，不要从头重跑。
