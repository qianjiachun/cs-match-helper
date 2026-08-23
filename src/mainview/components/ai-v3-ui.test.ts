import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const component = (name: string) => fs.readFileSync(path.resolve(process.cwd(), 'src/mainview/components', name), 'utf8');

describe('AI V3 table signals and report integration', () => {
  it('overlays a compact signal on the avatar without adding or resizing table columns', () => {
    const table = component('TeamPlayerTable.vue');
    expect(table).toContain('playerSignals?: AiPlayerSignal[]');
    expect(table).not.toContain('<col style="width: 40px" />');
    expect(table).toContain('absolute -left-0.5 -top-0.5');
    expect(table).toContain('h-[15px] w-[15px]');
    expect(table).toContain('class="h-2.5 w-2.5"');
    expect(table).not.toContain('0_0_0_2px_white');
    expect(table).not.toContain('ai-player-marker');
    expect(table).not.toContain('<span>{{ signalLabel');
    expect(table).toContain('class="h-[52px] border-b');
    expect(table).toContain('class="px-2 py-1.5"');
    expect(table).toContain("if (kind === 'carry') return Crown");
    expect(table).toContain("if (kind === 'anchor') return Shield");
    expect(table).toContain("if (kind === 'specialist') return Crosshair");
    expect(table).toContain("if (kind === 'weakLink') return TriangleAlert");
    expect(table).toContain("if (kind === 'volatile') return Zap");
    expect(table).toContain('return Eye');
  });

  it('supports hover, keyboard focus and click navigation for every signal', () => {
    const table = component('TeamPlayerTable.vue');
    const featured = component('MatchFeaturedPanel.vue');
    expect(table).toContain('@mouseenter="signalForPlayer');
    expect(table).toContain('@focus="onSignalRowFocus');
    expect(table).toContain('@keydown="openSignalFromRow');
    expect(table).toContain('data-player-comment-action');
    expect(table).toContain("emit('openAiSignal'");
    expect(featured).toContain(':player-signals="playerSignals"');
    expect(featured).toContain('@open-ai-signal="openAiSignal"');
    expect(featured).toContain("activeTab.value = 'ai'");
  });

  it('uses one-shot type-colored animation values without a reduced-motion branch', () => {
    const table = component('TeamPlayerTable.vue');
    expect(table).toContain('scale: 0.25');
    expect(table).toContain('filter: blur(4px)');
    expect(table).toContain('opacity: 0');
    expect(table).toContain('--ai-signal-rgb');
    expect(table).toContain('forwards');
    expect(table).not.toContain('inset 2px 0 0');
    expect(table).not.toContain('inset 3px 0 0');
    expect(table).not.toMatch(/ai-signal-(?:icon-in|row-sweep)[^}]*infinite/s);
    expect(table).not.toContain('prefers-reduced-motion');
  });

  it('renders the V3 report sections and a focused player anchor', () => {
    const panel = component('AiAnalysisPanel.vue');
    for (const label of ['决定本局的因素', '玩家信号', '双方取胜路径', '数据边界', '运行信息']) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain('scrollIntoView');
    expect(panel).toContain('ai-player-${signal.steamId}');
    expect(panel).toContain('class="ai-report w-full');
    expect(panel).toContain('max-w-3xl');
    expect(panel).toContain('lg:grid-cols-[minmax(0,1fr)_18rem]');
    expect(panel).toContain('lg:grid-cols-2');
    expect(panel).toContain('evidencePillText');
    expect(panel).not.toContain('md:grid-cols-[150px_1fr]');
    expect(panel).not.toContain('{{ l(\'影响\', \'Impact\') }} {{ factor.impact }}/3');
  });

  it('does not restart AI analysis when returning from settings and maps comparison labels', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/mainview/App.vue'), 'utf8');
    const goHome = app.match(/function goHome\(\)[\s\S]*?\n}\n/)?.[0] ?? '';
    const featured = component('MatchFeaturedPanel.vue');
    const compare = component('TeamCompareBoard.vue');
    expect(goHome).not.toContain('maybeAutoAnalyze');
    expect(app).toContain(':active="currentView === \'main\'"');
    expect(featured).toContain('isActiveLivePanel');
    expect(featured).toContain('deferredLiveAnalyze');
    expect(featured).toContain('if (!deferredLiveAnalyze) return');
    expect(compare).toContain('sideRelationshipLabel');
    expect(compare).toContain("sideLabel('A')");
    expect(compare).toContain("sideLabel('B')");
  });
});
