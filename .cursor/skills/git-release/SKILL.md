---
name: git-release
description: >-
  CS 匹配助手的单文件 EXE 发版流程。负责版本号、构建、Lunaris CDN、GitHub Release
  与断点续跑。Release 说明必须使用中文。Use when the user asks to release, 发版,
  publish, GitHub Release, Lunaris, or mentions @git-release.
---

# CS 匹配助手发版

## 产品边界

CS 匹配助手只发布匹配助手主程序，不包含 HUD、Game Bar Widget、GSI 或急停数据采集。

| 项 | 值 |
| --- | --- |
| 仓库 | `qianjiachun/cs-match-helper` |
| 版本真源 | `package.json` |
| 发版产物 | `release/cs-match-helper.exe` |
| Lunaris project | `cs-match-helper` |
| GitHub Release tag | `vX.Y.Z` |

GitHub Release 只能附带 `cs-match-helper.exe`。不得要求、构建或上传 Widget 产物。

## 安全规则

- 用户必须明确给出目标主程序版本；不得自行猜测或提升版本。
- 未经用户明确授权，不执行 commit、push、Lunaris 上传或 GitHub Release。
- 不提交 `.env`、密钥、`release/`、`dist/`、`node_modules/` 或 `src-tauri/target/`。
- 不使用 force push，不移动既有 tag，不跳过 hooks。
- Release 标题与说明使用中文。

## 发版流程

1. 确认用户给出的目标版本 `X.Y.Z`。
2. 检查 `git status`、当前分支、远程与现有 tag。
3. 执行 `npm run version:set X.Y.Z` 和 `npm run version:verify`。
4. 执行质量门禁：
   - `npm run audit:product-boundary`
   - `npm exec vue-tsc -- --noEmit`
   - `npm test`
   - `npm run build:frontend`
   - `cargo test --manifest-path src-tauri/Cargo.toml`
   - `cargo check --manifest-path src-tauri/Cargo.toml`
5. 执行 `npm run build`，确认仅生成 `release/cs-match-helper.exe`。
6. 仅在用户授权发版时执行 `npm run release:lunaris`。
7. 按 git-commit 规范提交并推送。
8. 创建 `vX.Y.Z` GitHub Release，只附 `release/cs-match-helper.exe`。
9. 校验 GitHub 下载与 Lunaris CDN 指向同一版本。

## 断点续跑

先执行：

```powershell
npm run release:status -- X.Y.Z
```

根据 `nextStep` 只执行缺失步骤：

| nextStep | 操作 |
| --- | --- |
| `version` | `npm run version:set X.Y.Z` |
| `build` | `npm run build` |
| `lunaris` | `npm run release:lunaris` |
| `commit` | 按 git-commit skill 提交 |
| `push` | 推送当前发版提交 |
| `github-release` | 创建 Release，仅附 EXE |
| `done` | 不重复执行任何发版步骤 |

构建已完成而上传失败时，不得重新构建；只重试相应上传步骤。
