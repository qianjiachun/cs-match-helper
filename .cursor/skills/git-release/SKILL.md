---
name: git-release
description: >-
  CS 匹配助手项目的 GitHub Release 发版流程。含主程序 exe 与 Widget 独立版本号、构建、Lunaris CDN
  上传、README 更新、推送与 gh release 发布；支持断点续跑（继续发版）。首次发版须同时指定 exe 与
  widget 版本。Release 说明必须中文。Use when the user asks to release, 发版, 继续发版, publish,
  tag, version bump, build exe to release/, or mentions @git-release / release folder.
---

# CS 匹配助手 — GitHub Release 发版

> **提交规范**见同目录下的 `git-commit` skill。发版流程中的 commit 步骤遵循该规范。

## Skill 使用方法（版本号必填）

主程序与 Widget **版本号相互独立**，但**每次首次发版都必须由用户同时明确给出**，缺一不可。

| 版本 | 含义 | 写入位置 | GitHub / Lunaris |
|------|------|----------|------------------|
| **exe 版本** | 主程序发版版本 | `package.json` → `npm run version:set X.Y.Z` | GitHub tag `vX.Y.Z`；Lunaris `cs-match-helper@X.Y.Z` |
| **widget 版本** | Widget zip 版本 | `widget-version.json` → `npm run widget:version:set A.B.C` | zip 文件名 `CSMatchHelperGameBarWidget-A.B.C.zip`；Lunaris `cs-match-helper-widget@A.B.C` |

**推荐触发格式：**

```
@git-release exe发版 v1.0.1 widget发版 v1.1.0
```

也接受等价表述，例如：

- `@git-release 发版 exe v2.3.0 widget v1.0.0`
- `@git-release 主程序 v2.3.0，Widget v1.0.0，提交并发布 GitHub Release`

Agent 须从用户消息中解析出两个版本号（可带或不带 `v` 前缀）。Widget 未变更时，用户仍须**显式写出**当前 Widget 版本（可与上次相同），不得省略或让 Agent 自行猜测。

### 版本号门禁（硬性，首次发版）

用户触发**首次发版**（非「继续发版」）时，Agent **必须先做版本号校验**，再执行 `npm run release:status` 或任何构建/上传：

1. **exe 版本**：用户是否明确给出主程序目标版本？
2. **widget 版本**：用户是否明确给出 Widget 目标版本？

**若任一缺失**（只写一个、只写「发版」、只写「latest」、只写 exe 版本等）：

- **立即终止**发版流程
- **不得**执行 `version:set`、`build:release`、`build:widget`、Lunaris 上传、`gh release create` 等任何发版步骤
- **不得**用 `package.json` / `widget-version.json` 当前值代替用户未声明的版本
- 向用户说明须同时提供两个版本，并给出示例：

  > 请同时指定主程序与 Widget 版本，例如：`@git-release exe发版 v1.0.1 widget发版 v1.0.0`

**例外：续跑**

用户明确说「继续发版」「接着发」「重试发版」时，**不适用**上述门禁；直接 `npm run release:status` 从断点续跑，版本以 status 与仓库配置为准。

## 项目约定

| 项 | 值 |
|---|---|
| 仓库 | `qianjiachun/cs-match-helper` |
| 远程 | `origin` → `git@github.com:qianjiachun/cs-match-helper.git` |
| 主分支 | `main` |
| 发版产物目录 | `release/`（已在 `.gitignore`，不上传 Git，只附到 Release） |
| 主程序发版产物 | **`cs-match-helper.exe`**（固定，不可改名） |
| Widget 发版产物 | **`release/gamebar-widget/CSMatchHelperGameBarWidget-X.Y.Z.zip`**（仅此一个 zip） |
| 主程序产物路径 | `release/cs-match-helper.exe` |
| Widget 产物路径 | `release/gamebar-widget/` |
| 主程序版本真源 | **`package.json`**；`scripts/version.mjs` 同步至 `Cargo.toml`、`tauri.conf.json`、`package-lock.json` |
| Widget 版本真源 | **`gamebar-widget/widget-version.json`**；`scripts/widget-version.mjs` 同步至 `Package.appxmanifest` |
| Lunaris 主程序 project | `cs-match-helper` |
| Lunaris Widget project | `cs-match-helper-widget` |
| Lunaris CDN 用户名 | `qianjiachun` |
| Lunaris API Key | 本地环境变量 `LUNARIS_API_KEY`（**仅发版脚本使用，不打包进客户端**） |

**硬性规则：**

1. 主程序永远只发单文件 exe，禁止 NSIS/MSI 安装包
2. 主程序构建产物**必须命名为 `cs-match-helper.exe`**
3. Game Bar Widget 以独立 **zip 单文件** 分发，命名 **`CSMatchHelperGameBarWidget-X.Y.Z.zip`**（校验由 Lunaris CDN `X-Checksum-SHA256` 响应头提供，不单独发 txt/json）
4. GitHub Release **必须包含**：`cs-match-helper.exe` 与 Widget zip
5. **`npm run build` / `npm run build:release` 只构建主程序 exe，绝不调用 `build:widget` 或打包 Widget**
6. **GitHub Release `--notes`** 必须中文（应用内更新弹窗读取 `body` 展示给用户），且**不得写入调试/开发向 commit 内容**
7. **Lunaris CDN**：主程序上传到 `cs-match-helper@X.Y.Z`；Widget 上传到 `cs-match-helper-widget@A.B.C`（Widget 独立版本 tag）
8. **版本发现**：主程序与 Widget 均读取 GitHub latest release；主程序版本取 release `tag_name`；Widget 版本从附件名 `CSMatchHelperGameBarWidget-A.B.C.zip` 解析
9. Widget 未变更时，新主程序 release 仍须附带当前 Widget zip（可 `npm run widget:ensure-zip` 从历史 release 复用，**不得**通过 `npm run build` 生成）

## 产物命名

Tauri/Rust 编译中间产物为 `src-tauri/target/release/cs-match-helper.exe`（crate 名）。

`scripts/release.mjs` **仅**将主程序 exe 复制到 `release/cs-match-helper.exe`，不创建、不列出、不打包 Widget 目录。

Widget 由**独立命令**构建，与 `npm run build` / `npm run build:release` **完全解耦**：

```
src-tauri/target/release/cs-match-helper.exe
        ↓  copy (npm run build 或 npm run build:release)
release/cs-match-helper.exe

npm run build:widget          ← 单独执行，发版或 Widget 源码变更时
        ↓
release/gamebar-widget/CSMatchHelperGameBarWidget-A.B.C.zip
```

其中 `A.B.C` 来自 `gamebar-widget/widget-version.json`，**不必与主程序版本相同**。

**日常 `npm run build` 完成后，`release/` 下应只有 `cs-match-helper.exe`**（若存在旧的 `gamebar-widget/` 目录，那是历史产物，与本次 build 无关）。

**发版时主程序只认 `cs-match-helper.exe`：**

- `release/` 根目录中必须是此文件名
- `gh release create` / `gh release upload` 上传主程序时用此文件名
- Widget zip 放在 `release/gamebar-widget/`，一并附到 GitHub Release

## 版本号管理

### 主程序

**真源：`package.json` 的 `version` 字段。**

```bash
npm run version:set 2.3.0
npm run version:verify
```

### Widget

**真源：`gamebar-widget/widget-version.json` 的 `version` 字段。**

```bash
npm run widget:version:set 1.0.2
npm run widget:version:verify
```

仅 Widget 源码有变更时才**提升** Widget 版本；若与上次相同，用户仍须在发版指令中**写明**该版本号，发版时仍将对应 zip 附到新的 GitHub Release。

`npm run dev` / `npm run build` 会通过 `predev` / `prebuild` 自动执行 `version:sync`，确保 `Cargo.toml` 与 `package.json` 一致后再编译。

应用内版本展示均来自 `Cargo.toml`（编译进 exe 的 `CARGO_PKG_VERSION`）：

| 位置 | 说明 |
|------|------|
| 标题栏版本号 | `TitleBar` 旁 `vX.Y.Z` |
| 关于页「版本」 | `AboutSettingsSection` |
| 系统窗口标题 | 启动时 Rust 设置为 `CS 匹配助手 -By 小淳 vX.Y.Z` |
| 更新检查 | 与 GitHub Release `tag_name` 对比 |
| 自动更新下载 | 优先 Lunaris CDN `cs-match-helper`；失败时回退 GitHub Release |

Widget 应用内安装/更新：

| 位置 | 说明 |
|------|------|
| 更新发现 | GitHub latest release 中 `CSMatchHelperGameBarWidget-*.zip` 附件名 |
| 版本比较 | 附件名解析出的 Widget 版本 vs 本机已安装 UWP 包版本 |
| 自动下载 | 优先 Lunaris CDN `cs-match-helper-widget`；失败时回退 GitHub Release 附件 |

### 版本 tag 映射（自动归类）

| 平台 | tag 格式 | 示例 |
|------|----------|------|
| GitHub Release | `vX.Y.Z`（主程序版本） | `v2.3.0` |
| Lunaris 主程序 | `X.Y.Z`（无 `v`） | `2.3.0` |
| Lunaris Widget | `A.B.C`（Widget 独立版本） | `1.0.2` |

`scripts/lunaris-upload.mjs` 从 `package.json` 读取主程序版本；`scripts/widget-upload.mjs` 从 `widget-version.json` 读取 Widget 版本。

客户端 CDN 下载地址（指定版本，应用内自动更新使用）：

```
https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download&v=X.Y.Z
```

README 展示的 CDN 直链（始终指向 latest，**不带版本号**）：

```
https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download
```

## README.md 更新

发版时须同步更新根目录 `README.md` 的下载区域，与本次 Release 一并提交（可合入 `release: vX.Y.Z` commit）。

**硬性规则：**

1. README **不写版本号**（不写「当前版本 vX.Y.Z」等）
2. 提供**两个**下载入口，链接固定、无需随版本改 URL：
   - **软件下载**（国内推荐，走 Lunaris CDN）：`https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download`
   - **GitHub Release**：`https://github.com/qianjiachun/cs-match-helper/releases/latest`
3. 「使用」章节的第一步也应指向上述两个来源之一

**标题区示例：**

```markdown
[**软件下载**](https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download) · [**GitHub Release 下载**](https://github.com/qianjiachun/cs-match-helper/releases/latest)
```

发版前打开 `README.md` 核对：链接可点击、文案为中文、无版本号残留。

## 发版前检查

1. **（首次发版）** 用户已同时给出 exe 版本与 widget 版本（见上文「版本号门禁」）
2. 已执行 `npm run version:set X.Y.Z`，且 `npm run version:verify` 通过；Git tag 使用 `v` 前缀
3. 已执行 `npm run widget:version:set A.B.C`，且 `npm run widget:version:verify` 通过
4. 确认无敏感文件（`.env`、密钥等）将被提交；`.env` 已在 `.gitignore`
5. 确认 `release/` 不在 Git 跟踪中
6. 本地已配置 `LUNARIS_API_KEY`（复制 `.env.example` 为 `.env` 并填写，或写入系统环境变量）

## 构建

主程序与 Widget **分两条独立构建链路**，禁止混用。

### 主程序（仅 exe）

**日常开发构建**（仅主程序 exe，不上传 Lunaris）：

```bash
npm run build
```

等价于 `tauri build --no-bundle && node scripts/release.mjs`：

- `--no-bundle`：只产出单文件 exe
- `scripts/release.mjs`：仅复制 exe 到 `release/cs-match-helper.exe`，**不涉及 Widget**

**发版构建主程序**（构建完成后**自动上传主程序 Lunaris CDN**）：

```bash
npm run build:release
```

等价于 `tauri build --no-bundle && node scripts/release.mjs --upload-lunaris`（同样**只处理 exe**）。

### Widget（仅 zip）

**单独构建 Widget zip**（需 VS UWP 工作负载；**不得**在 `npm run build` 中隐式调用）：

```bash
npm run build:widget
```

**发版 Widget**（构建 zip 后单独上传）：

```bash
npm run build:widget
npm run release:widget
```

若 Widget 源码未变、仅需附到新的 GitHub Release，可复用已有 zip：

```bash
npm run widget:ensure-zip
```

**完整发版顺序**（版本号须已在用户指令中明确；Agent 先设版本再构建）：

1. **门禁**：确认用户已给出 exe 版本 `X.Y.Z` 与 widget 版本 `A.B.C`（续跑除外）
2. `npm run version:set X.Y.Z` → `npm run version:verify`
3. `npm run widget:version:set A.B.C` → `npm run widget:version:verify`
4. `npm run build:release`（主程序 exe + 主程序 CDN）
5. `npm run widget:ensure-zip` 或 `npm run build:widget`（确保当前 Widget zip 存在；Widget 有源码变更时必须 `build:widget`）
6. `npm run release:widget`（Widget CDN，使用 Widget 版本 tag）
7. commit / push / `gh release create`（同一 `vX.Y.Z` release 附 exe + widget zip）

> **断点续跑**：发版中断后，用户再次 `@git-release 继续发版` 时，Agent **必须先** `npm run release:status` 检测进度，**只执行未完成步骤**，禁止从头重跑已完成步骤（尤其禁止在 exe 已存在时重跑 `build:release`）。

构建成功后验证：

```bash
# PowerShell — 主程序 build 后应只有 exe
Test-Path "release/cs-match-helper.exe"
Get-Item "release/cs-match-helper.exe"

# Widget 需单独 build:widget 或 widget:ensure-zip 后才有 zip
Test-Path "release/gamebar-widget/CSMatchHelperGameBarWidget-*.zip"
```

- `npm run build` / `npm run build:release` 完成后：确认 `release/cs-match-helper.exe` 存在即可
- 发版前还需确认 Widget zip 存在（`build:widget` 或 `widget:ensure-zip`），二者**独立**完成

若构建失败，先单独跑 `npm run build:frontend` 排查前端，再检查 Rust 工具链。

## GitHub Release notes（发版说明）

应用通过 GitHub Release API 拉取 `body` 字段，在客户端「更新内容」区域展示；`gh release create --notes` **必须中文**。

发版 commit 建议使用 `release: vX.Y.Z` 类型，格式见 `git-commit` skill。

### 更新内容撰写规则

Release `--notes` 面向**最终用户**，只写用户可感知的功能改进、修复与体验优化。

**禁止写入更新说明的内容：**

- 与**调试**相关的事项（如：调试面板、DevTools、模拟数据、日志增强、开发环境配置、`MatchDebugPanel`、mock、simulate 等）
- 仅开发者可见的内部重构、CI/脚本、skill 文档、`.cursor` 配置等
- 直接从 git commit 复制、但未过滤上述内容的条目

**允许写入的示例：**

- 新增自动更新与 Lunaris CDN 下载
- 修复 5E 对局数据偶发不显示
- 优化设置页布局与加载速度

撰写 `--notes` 时：可参考 `git log` 归纳摘要，但须**改写为用户语言**并**剔除所有调试/开发向描述**。

## 发布 GitHub Release

使用 `gh` CLI，tag 与 Release 标题使用 `v<version>`：

```bash
gh release create v1.0.0 \
  --title "v1.0.0" \
  --notes "$(cat <<'EOF'
## 更新内容

- （用中文填写本次更新摘要，会显示在应用内更新弹窗）

EOF
)" \
  "release/cs-match-helper.exe" \
  "release/gamebar-widget/CSMatchHelperGameBarWidget-1.0.2.zip"
```

其中 exe 对应主程序版本 `v1.0.0`，Widget zip 文件名中的 `1.0.2` 为 Widget 独立版本。

**要点：**

- `--notes` **必须中文**，内容会原样展示在客户端更新提醒中
- `--notes` **不得包含**调试、开发工具、内部脚本等与用户无关的 commit 内容（见上文「更新内容撰写规则」）
- Release **必须附**：主程序 exe 与 Widget zip
- 附件来自 `release/` 目录，不是 `dist/` 或 `src-tauri/target/`
- 若 tag 已存在，先删除旧附件再上传：

```bash
gh release upload v1.0.0 \
  release/cs-match-helper.exe \
  release/gamebar-widget/CSMatchHelperGameBarWidget-1.0.0.zip \
  --clobber
```

- 发版前必须先 `npm run build:release` 确保 exe 为最新且 Lunaris 已上传

## 上传 Lunaris CDN（发版构建自动完成）

发版时 **主程序与 Widget 分步上传**：

```bash
npm run release:lunaris    # 仅主程序 exe
npm run release:widget     # 仅 Widget zip
```

**上传流程：**

1. `npm run build:release` → 仅构建并上传主程序 `release/cs-match-helper.exe`
2. `npm run build:widget` 或 `npm run widget:ensure-zip` → 确保 Widget zip 存在（**与步骤 1 独立**）
3. `npm run release:widget` → 上传 Widget zip

**Widget CDN 地址（应用内安装/更新使用）：**

```
https://cdn.lunaris.win/qianjiachun/cs-match-helper-widget/CSMatchHelperGameBarWidget-A.B.C.zip?download&v=A.B.C
```

Widget 版本从 GitHub Release 附件名解析；下载校验使用 CDN 响应头 `X-Checksum-SHA256`。

**CDN 直链验证：**

```bash
# PowerShell
curl -I "https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download&v=2.1.0"
```

响应应包含 `X-Checksum-SHA256` 头。

**失败处理：**

- **Lunaris 上传失败应中止发版**；用户修复后再次 `@git-release 继续发版`，Agent 自动从断点续跑（见下文），**不要求用户手动执行任何 npm 命令**
- 必须在 Lunaris CDN 就绪后，再执行 `gh release create`
- 若版本已存在，脚本会复用该版本并覆盖上传文件

详细 API 见 [docs/lunaris-api.md](../../../docs/lunaris-api.md)。

## 断点续跑（继续发版）

用户说「继续发版」「接着发」「重试发版」或再次 `@git-release 继续发版` 时，**一律视为续跑**，不得从零开始，**不适用**「版本号门禁」。

### 第一步：检测发版进度（必须）

```bash
npm run release:status
```

输出 JSON，含 `steps`（各步是否完成）与 `nextStep`（下一步代号）。Agent 解析后**只执行 `nextStep` 对应动作**。

| `nextStep` | 含义 | Agent 应执行（用户无需手动） |
|------------|------|------------------------------|
| `version` | 主程序版本未设置或未同步 | `npm run version:set X.Y.Z`（X.Y.Z 来自用户指令或续跑上下文）→ `npm run version:verify` |
| `widget-version` | Widget 版本未设置或未同步 | `npm run widget:version:set A.B.C` → `npm run widget:version:verify` |
| `build` | exe 不存在 | `npm run build:release`（**仅主程序**，不构建 Widget） |
| `widget-ensure` | Widget zip 不存在 | `npm run widget:ensure-zip`，失败则 `npm run build:widget`（**单独**构建 Widget） |
| `lunaris` | exe 已有，主程序 CDN 未就绪 | **`npm run release:lunaris` only** |
| `widget-lunaris` | Widget zip 已有，Widget CDN 未就绪 | **`npm run release:widget` only** |
| `commit` | 未提交或工作区脏 | 确认 `README.md` 下载区已更新 → 按 git-commit skill 提交（含版本配置 + README） |
| `push` | 有未推送 commit | `git push origin main`（用户未要求则可询问） |
| `github-release` | GitHub Release 缺失或 asset 不完整 | `gh release create vX.Y.Z`（附 exe + widget zip） |
| `done` | 全部完成 | 汇报发版已完成 |

### 续跑规则（硬性）

1. **每次**调用本 skill（含首次发版与继续发版），先跑 `npm run release:status`
2. **跳过** `steps.* === true` 的步骤，不得重复 `version:set`、`build:release`、commit 等
3. exe 已存在且仅 Lunaris 失败 → **只跑** `npm run release:lunaris` 或 `npm run release:widget`（按 `nextStep`），**禁止** `npm run build:release`
4. **禁止**在 `npm run build` / `npm run build:release` 中隐式构建 Widget；Widget 缺失时只走 `widget-ensure` / `build:widget`
5. Lunaris 与 GitHub Release 均完成后，向用户汇报；若 `nextStep === done`，说明发版已结束
6. **禁止**让用户自行执行 `npm run build:release` 或 `npm run release:lunaris`；由 Agent 在续跑流程内自动调用

### 状态检测说明

`release:status` 通过以下方式判断：

- **buildDone**：`release/cs-match-helper.exe` 存在
- **widgetBuildDone**：`release/gamebar-widget/CSMatchHelperGameBarWidget-{widgetVersion}.zip` 存在
- **lunarisUploaded**：主程序 CDN `HEAD` 返回 200，且 `X-Checksum-SHA256` 与本地 exe 一致
- **widgetLunarisUploaded**：Widget CDN（`cs-match-helper-widget`）`HEAD` 返回 200，且校验与本地 zip 一致
- **committed**：存在 `release: vX.Y.Z` 类 commit 且工作区干净
- **pushed**：相对 `origin/main` 无未推送 commit
- **githubRelease**：`gh release view vX.Y.Z` 成功，且同时包含 `cs-match-helper.exe` 与当前 Widget zip

## 完整发版清单

Agent 执行时以 `npm run release:status` 为准，已完成项跳过。

```
发版进度：
- [ ] 0. （首次发版）确认用户已同时给出 exe 与 widget 版本；缺一即终止并提示用户
- [ ] 1. npm run release:status（检测断点，决定从哪步继续）
- [ ] 2. npm run version:set X.Y.Z（若 status 显示未完成）
- [ ] 3. npm run version:verify
- [ ] 4. npm run widget:version:set A.B.C（若 status 显示未完成）
- [ ] 5. npm run widget:version:verify
- [ ] 6. npm run build:release（**仅**主程序 exe，不构建 Widget）
- [ ] 7. npm run widget:ensure-zip 或 build:widget（**单独**确保 Widget zip）
- [ ] 8. npm run release:lunaris / release:widget（按 status，见断点续跑表）
- [ ] 9. 验证 release/cs-match-helper.exe、Widget zip 与 Lunaris CDN 校验一致
- [ ] 10. 更新 README.md（软件下载 + GitHub Release 双下载链接，不写版本号）
- [ ] 11. git status / diff / log（按 git-commit skill 分析变更）
- [ ] 12. git add + commit（英文前缀 + 中文说明，含版本配置文件与 README.md）
- [ ] 13. git push origin main（仅用户明确要求时推送）
- [ ] 14. gh release create vX.Y.Z（中文 --notes，附 exe + Widget zip）
- [ ] 15. 再次 npm run release:status 确认 nextStep 为 done
```

## 用户触发示例

**首次发版（须同时写 exe 与 widget 版本）：**

> @git-release exe发版 v2.3.0 widget发版 v1.0.0，build 单文件 exe，提交并发布 GitHub Release

**版本未写全时（Agent 必须拒绝执行）：**

> @git-release 发版 v2.3.0

Agent 应回复：缺少 Widget 版本，请补充，例如 `widget发版 v1.0.0`。

**中断后继续（用户只需说这一句，无需自己跑命令，无需重复版本号）：**

> @git-release 继续发版

Agent 流程：

1. `npm run release:status` → 读 `nextStep`
2. 仅执行未完成步骤（例如 Lunaris 失败则只 `npm run release:lunaris`）
3. 逐步推进直至 `nextStep === done`

**禁止**在发版/续跑流程中让用户手动执行 `npm run build:release` 或 `npm run release:lunaris`；**禁止**在 exe 已存在时重复完整构建。
