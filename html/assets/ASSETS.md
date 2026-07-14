# 官网素材准备说明

把素材放到 `html/assets/` 下即可。页面已写好本地路径；若本地文件缺失，会自动回退到 README 中的 GitHub 图床链接。

## 目录结构

```text
html/
├── index.html
├── css/styles.css
├── js/main.js
└── assets/
    ├── brand/
    │   └── logo.png          ← 品牌 Logo（必须）
    └── screenshots/
        ├── match-panel.png       ← Hero + 预览 01：对局数据面板
        ├── comment.png           ← 预览：留言板
        ├── team-compare.png      ← 预览 02：队伍对比
        ├── ai-analysis.png       ← 预览 03：AI 赛前分析
        └── counter-strafing.png  ← 急停助手 / Game Bar 小组件
```

## 建议规格

| 文件 | 建议尺寸 | 格式 | 说明 |
|------|----------|------|------|
| `brand/logo.png` | 256×256 或 512×512 | PNG（透明底） | 圆角由 CSS 处理，原图尽量方形 |
| `match-panel.png` | 宽 ≥ 1600px，约 16:10 | PNG / WebP | 主 Hero 与预览首图，最重要 |
| `comment.png` | 宽 ≥ 1400px | PNG / WebP | 留言板侧栏截图 |
| `team-compare.png` | 宽 ≥ 1400px | PNG / WebP | 队伍对比界面 |
| `ai-analysis.png` | 宽 ≥ 1400px | PNG / WebP | AI 分析界面 |
| `counter-strafing.png` | 宽 ≥ 900px，竖图更佳 | PNG / WebP | Game Bar / HUD 截图 |

### 截图技巧

1. 使用真实软件界面，避免马赛克与多余桌面杂物。
2. 窗口最大化或固定窗口比例截取，保证边缘干净。
3. 优先导出 **WebP**（体积更小）；若兼容性顾虑大，用 PNG 即可，文件名保持 `.png` 或同步改 `index.html` 中的扩展名。
4. 日间模式下界面本身是浅色，截图也请用浅色主题，和官网一致。
5. 单张建议控制在 **300–800 KB**（WebP 可更小），过大影响首屏。

### 现成素材来源

仓库 README 已有可用截图，可直接下载后改名放入对应路径：

- Logo：README 顶部图标
- 对局数据 / 队伍对比 / AI 分析 / 急停助手：README「界面预览」「急停助手」小节

## 下载链接

下载按钮当前指向：

- CDN：`https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download`
- GitHub：`https://github.com/qianjiachun/cs-match-helper/releases/latest`

发版后若 CDN 路径变化，只需改 `index.html` 里 `#download` 区域的 `href`。

## 本地预览

用任意静态服务器打开 `html` 目录，例如：

```bash
npx --yes serve html
```

或直接用浏览器打开 `html/index.html`（部分环境对本地路径回退图可能受限，推荐用静态服务器）。
