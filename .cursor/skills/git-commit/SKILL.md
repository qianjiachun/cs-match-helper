---
name: git-commit
description: CS 匹配助手仓库的 Git 提交流程与 Conventional Commits 规范。用于用户要求提交、commit、git commit 或明确要求提交并推送但没有发版意图时；只处理 5E、完美、对局历史、AI 分析、玩家评论及匹配助手工程变更，不执行构建或发布。
---

# CS 匹配助手 Git 提交

## 产品与仓库边界

- 仓库：`qianjiachun/cs-match-helper`
- 主分支：`main`
- 产品范围：5E、完美、对局历史、AI 分析、玩家评论及匹配助手公共能力
- 禁止把 HUD、GSI、桌面悬浮窗或 Game Bar Widget 功能提交到本仓库
- 发版、构建 EXE、Lunaris 上传和 GitHub Release 使用 `git-release` skill

## 提交规则

1. 仅在用户明确要求提交时执行 `git commit`；仅在用户明确要求推送时执行 `git push`。
2. 使用 Conventional Commits：英文类型前缀，冒号后的摘要和正文使用中文。
3. 每个提交只包含一个清晰职责；存在互不相关的改动时拆分提交。
4. 保留用户已有的未提交修改，不覆盖、不回退、不擅自纳入当前提交。
5. 不提交 `.env`、密钥、token、证书、`release/`、`dist/`、`node_modules/` 或 `src-tauri/target/`。
6. 不修改 Git 配置，不使用 `--no-verify`、force push、`reset --hard` 或其他破坏性命令。
7. 除非用户明确要求且提交尚未推送，不使用 `git commit --amend`；失败时修复后创建新提交。

提交格式：

```text
<type>[可选作用域]: <中文摘要>

- <可选中文说明>
```

常用类型和示例：

```text
feat: 支持 5E 对局数据采集
fix: 修复完美平台日志断流后无法恢复
refactor: 拆分匹配历史与 AI 分析状态
perf: 优化历史对局列表查询
docs: 补充玩家评论使用说明
build: 调整匹配助手单文件构建配置
chore: 更新匹配助手依赖
```

版本发布提交统一使用：

```text
release: vX.Y.Z
```

## 执行流程

1. 并行检查 `git status --short --branch`、`git diff`、`git diff --cached` 和 `git log -3 --oneline`。
2. 阅读全部相关差异，确认产品边界、文件归属、敏感信息和是否存在用户的无关修改。
3. 按职责选择文件执行 `git add <files>`，不得使用会误收无关文件的宽泛暂存方式。
4. 检查 `git diff --cached --check` 和 `git diff --cached`。
5. 使用英文类型前缀和中文说明创建提交。Windows 下若命令行中文编码不可靠，使用 UTF-8 无 BOM 临时消息文件并在提交后删除。
6. 检查 `git status --short --branch` 和最新提交，确认提交内容正确。
7. 仅在用户明确要求时推送当前分支；不要自动推送到 `main`。

提交完成后向用户报告提交哈希、提交标题、包含的职责、验证结果，以及仍然保留的未提交修改。
