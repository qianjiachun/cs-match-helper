---
name: git-commit
description: >-
  CS 匹配助手项目的 Git 提交规范与流程。Conventional Commits 英文前缀 + 中文说明。
  仅负责分析变更、暂存、commit，可选 push；不涉及发版、构建 exe 或 GitHub Release。
  Use when the user asks to commit, 提交, git commit, or mentions @git-commit without
  release/发版 intent.
---

# CS 匹配助手 — Git 提交

> **发版、构建 exe、GitHub Release** 请使用 `git-release` skill，本 skill 不涵盖。

## 项目约定

| 项 | 值 |
|---|---|
| 仓库 | `qianjiachun/cs-match-helper` |
| 远程 | `origin` → `git@github.com:qianjiachun/cs-match-helper.git` |
| 主分支 | `main` |

**硬性规则：**

1. **仅在用户明确要求时** 才执行 `git commit`（及 push）
2. **Git commit** 使用 Conventional Commits：**英文类型前缀** + 冒号 + **中文说明**；正文条目也用中文
3. 不提交 `release/`、`dist/`、`src-tauri/target/`、`node_modules/` 等忽略目录
4. 不提交敏感文件（`.env`、密钥、token 等）
5. 本 skill **不执行** `npm run build`、`npm run version:set`、`gh release create` 等发版操作

## 提交信息规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：**前缀必须是英文**，冒号后及正文用中文。

```
<英文类型>[可选作用域]: <中文简要说明>

<可选正文，中文条目列表>
```

**硬性规则：**

- 前缀类型只用英文：`feat` / `fix` / `chore` / `docs` / `refactor` / `perf` / `build` / `ci` / `release` 等
- **禁止**中文前缀（如 `功能：`、`修复：`、`发版：`）
- 冒号后第一行摘要、正文 bullet **一律中文**

常用类型：

| 类型 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 支持 5E 平台 CDP 数据采集` |
| `fix` | Bug 修复 | `fix: 修复从设置返回时重复触发 AI 分析` |
| `refactor` | 重构 | `refactor: 拆分 5E 与完美平台 AI prompt` |
| `perf` | 性能 | `perf: 优化匹配数据表渲染` |
| `docs` | 文档 | `docs: 补充 5E 接口字段说明` |
| `chore` | 杂项/工具 | `chore: 更新依赖版本` |
| `build` | 构建配置 | `build: 调整 Tauri capabilities` |
| `ci` | CI 相关 | `ci: 添加前端单测 workflow` |
| `release` | 版本号发布提交 | `release: v1.1.0`（通常与发版一起，见 git-release） |

### 示例

```
feat: 5E 平台独立 AI 分析 prompt

- 按 platformId 分流完美/5E system prompt
- 新增 buildP5eMatchSummary 结构化摘要
```

```
fix: 顶部 AI 胶囊 Even 显示改为中文「势均力敌」
```

```
refactor: 主页面与设置页切换改用 view-shell 动画
```

## Git Safety Protocol

- **不修改** git config
- **不执行** destructive 命令（`push --force`、`reset --hard` 等），除非用户明确要求
- **不 skip hooks**（`--no-verify`），除非用户明确要求
- **不 force push** 到 `main` / `master`；若用户要求则先警告
- **避免** `git commit --amend`，仅当：用户明确要求、HEAD 为本会话创建、且未 push 远程
- commit 失败或被 hook 拒绝时，**新建 commit**，不要 amend
- **不 push** 到远程，除非用户在本次请求中明确要求

## 提交流程

**1. 并行收集上下文：**

```bash
git status
git diff
git log -3 --oneline
```

**2. 分析变更：**

- 区分已暂存与未暂存
- 不暂存 `release/`、`target/`、密钥等
- 根据变更性质选择 Conventional Commits 类型
- 摘要聚焦「为什么」，1–2 句中文说明

**3. 暂存并提交：**

```bash
git add <相关文件>
git commit -m "$(cat <<'EOF'
feat: 简要中文说明

- 变更要点一
- 变更要点二
EOF
)"
```

**4. 验证：**

```bash
git status
```

**5. 推送（仅用户明确要求时）：**

```bash
git push -u origin HEAD
```

### Windows PowerShell 中文乱码

将 message 写入 **UTF-8 无 BOM** 文件后提交：

```powershell
git commit -F .commitmsg.txt
```

提交完成后删除临时文件。

## 与发版的边界

| 用户意图 | 使用 skill |
|---------|-----------|
| 「帮我 commit」「提交一下」 | **git-commit** |
| 「发版 v1.2.0」「build exe 并 release」 | **git-release** |
| 「commit 并 push」（无发版） | **git-commit** + push |
| 「发版并提交」 | **git-release**（内含 commit 步骤，格式仍遵循本 skill） |

## 用户触发示例

> @git-commit 提交当前改动

Agent 应：status / diff / log → 起草英文前缀 + 中文 message → `git add` + `git commit` → `git status` 确认；**不**自动 push 或发版。
