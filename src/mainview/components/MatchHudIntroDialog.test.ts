import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const component = (name: string) =>
  fs.readFileSync(path.resolve(process.cwd(), 'src/mainview/components', name), 'utf8');

describe('MatchHudIntroDialog and TitleBar HUD entry', () => {
  it('renders Match HUD button in TitleBar and emits openMatchHud event', () => {
    const titleBar = component('TitleBar.vue');
    expect(titleBar).toContain("emit('openMatchHud')");
    expect(titleBar).toContain("locale === 'en-US' ? 'Match HUD' : '对局 HUD'");
    expect(titleBar).toContain('<MatchHudIcon');
  });

  it('contains HUD introduction, core features, and official site hyperlink', () => {
    const dialog = component('MatchHudIntroDialog.vue');
    expect(dialog).toContain('http://hud.fkbuff.com/');
    expect(dialog).toContain('CS 对局 HUD');
    expect(dialog).toContain('急停与开枪稳定');
    expect(dialog).toContain('压枪轨迹');
    expect(dialog).toContain('空中加速同步率');
    expect(dialog).not.toContain('压枪轨迹分析');
    expect(dialog).not.toContain('两种显示');
    expect(dialog).toContain('支持全屏模式');
    expect(dialog).not.toContain('独立对局训练工作台');
    expect(dialog).toContain('更多对局 HUD');
    expect(dialog).not.toContain('更多专属对局 HUD');
    expect(dialog).not.toContain('告别身法减速');
    expect(dialog).toContain('openExternalUrl(HUD_OFFICIAL_URL)');
    expect(dialog).toContain('copyText(HUD_OFFICIAL_URL');
    expect(dialog).toContain('ChartSpline');
    expect(dialog).toContain('MoveHorizontal');
    expect(dialog).not.toContain('emerald');
    expect(dialog).toContain('match-hud-intro-dialog__tab-pane');
    expect(dialog).toContain(':kind="activeTab"');
    expect(dialog).toContain('--mh-berry');
    expect(dialog).toContain('<MatchHudDemoStage');
    expect(dialog).toContain('@click.stop="close"');
    expect(dialog).toContain('absolute right-3 top-3 z-20');
  });

  it('replays homepage-style HUD demo with remote blurred map backgrounds', () => {
    const stage = component('MatchHudDemoStage.vue');
    const demo = component('matchHudIntroDemo.ts');
    expect(demo).toContain('https://www.csgo.com.cn/images/maps/jianying/map_dust2.jpg');
    expect(stage).toContain('blur-[3px]');
    expect(stage).toContain('效果示例');
    expect(stage).toContain('appendCounterSample');
    expect(stage).toContain('createRecoilPreviewPoints');
    expect(stage).toContain('scoreAirJump');
    expect(stage).toContain('kz-air-progress');
  });

  it('mounts MatchHudIntroDialog in App.vue', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/mainview/App.vue'), 'utf8');
    expect(app).toContain("import('./components/MatchHudIntroDialog.vue')");
    expect(app).toContain('@open-match-hud="openMatchHudDialog()"');
    expect(app).toContain('<MatchHudIntroDialog');
  });
});
