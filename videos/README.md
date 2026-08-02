# CS Match Helper — Remotion videos

单一 Remotion 包，多支产品成片。  
**一支片子 = `src/<topic>/` 一个文件夹**（代码 + `assets/` 同目录）。

## Commands

```bash
npm run studio                         # Remotion Studio（可切换 Composition）
npm run render                         # 默认导出 CounterStrafingDemo
npm run render -- CounterStrafingDemo  # → out/counter-strafing-demo.mp4
npm run render -- StabilitySlice       # → out/stability-slice.mp4
```

仓库根目录：

```bash
npm run video:studio
npm run video:render -- CounterStrafingDemo
```

## 目录约定

```text
src/
  shared/                 # 品牌色、字体、通用组件、共用素材
    assets/app-icon.svg
  counter-strafing/       # 急停 HUD 这一支（整夹自包含）
    assets/               # 本片录屏、截图
    meta.ts
    composition.tsx
    register.tsx
    scenes/
    captions/
    components/
public/                   # 可空（大文件已进各 topic/assets）
out/
```

## 新增一支视频

1. 新建 `src/<topic>/`（含 `assets/`、`meta.ts`、`composition.tsx`、`register.tsx`、`scenes/`）
2. 素材放进 `src/<topic>/assets/`，用 `import x from "../assets/..."` 引用
3. 在 `src/Root.tsx` 注册
4. `npm run video:studio` → `npm run video:render -- <CompositionId>`

## 当前 Compositions

- `CounterStrafingDemo` — 急停 HUD 完整演示（约 33s，字幕已按配音节奏对齐）
- `StabilitySlice` — 开枪稳定垂直切片（样式锁定用）

## 配音

旁白按 [`src/counter-strafing/captions/zh.json`](src/counter-strafing/captions/zh.json) 的 `startMs` / `endMs` 录制，句间可留 0.2–0.4s 气口。音轨后期用 Remotion `<Audio />` 叠加即可。
