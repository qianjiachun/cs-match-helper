/** 5E 平台关键指标经验基准，供 AI 判断强弱与样本可信度 */
export const P5E_METRIC_BASELINES_TEXT = `
5E 指标基准线（需结合赛季场次、地图样本量综合判断）：
- ELO（score）：优先排位当前赛季 ELO；分差 50 以内接近，50-100 有差距，100+ 明显差距；低赛季场次（<5 场）必须降权
- Rating：1.00 为基本线；>=1.10 偏强，>=1.20 明显强；<0.95 偏弱。有当局 fight.rating 时优先参考当局，否则多为当前地图 Rating
- RWS：8 左右为较好影响力；>=10 强，<7 偏低
- ADR：75-80 为正常输出；>=85 稳定高伤，<70 偏低
- K/D：1.00 为基本线；>=1.15 稳定正贡献，<0.90 偏弱
- 地图胜率：50% 为基本线；>=60% 地图偏好，<45% 地图偏差；地图样本 <3 局必须降权
- 近期 ELO 变化（recentRatings）：连续正增长代表状态上升，连续负 growth 代表下滑；单局大加减分不能单独等同强弱
- 近期胜负（recentForm）：连胜/连败可反映短期状态，但需结合 ELO 波动幅度
`.trim();

export const P5E_MAP_FIT_HINTS: Record<string, string> = {
  de_dust2: '长枪线、中路控制、狙击与首杀权重高',
  de_mirage: '中路默认、道具协同、信息战',
  de_inferno: '香蕉道道具、近点交火、补枪残局',
  de_nuke: '垂直协同、外场控制、道具与残局',
  de_ancient: '中路争夺、道具压制',
  de_vertigo: '近距离交火、首杀补枪',
  de_overpass: '道具信息、长枪狙击',
  de_anubis: '中路控制、道具默认',
  de_train: '内外场转换、道具协同',
  de_cache: '中路控制、快攻节奏',
  de_mills: '狭窄通道、道具与补枪',
  de_thera: '多层结构、信息战',
};

export function p5eMapFitHint(mapName?: string): string | undefined {
  if (!mapName) return undefined;
  const key = mapName.toLowerCase().replace(/^cs_/, 'de_');
  return P5E_MAP_FIT_HINTS[key];
}
