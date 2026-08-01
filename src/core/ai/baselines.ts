/** 完美平台关键指标经验基准，供 AI 判断红绿与强弱 */
export const METRIC_BASELINES_TEXT = `
指标基准线（红绿分界与参考区间，需结合样本量与地图适配综合判断）：
- Rating：1.00 为参考分界；>=1.10 偏强，>=1.20 明显强；<0.95 偏弱，<0.85 明显低迷
- 近期 Rating：仅比较最近 10 个有效值与赛季 Rating 的差异，不假设历史数组等长
- RWS：8 为参考分界；>=10 影响力较强；<7 偏低，但必须结合 ADR 与 K/D
- ADPR/ADR：80 左右为较好输出；>=85 稳定高伤，>=90 强输出；<70 输出偏低
- K/D：1.00 为基本分界；>=1.15 稳定正贡献；<0.90 偏弱（K/D 为估算值时降权）
- 当前地图：地图 Rating、ADR、胜率都需结合场次；相对玩家赛季均值的偏差优先于绝对值
- 地图样本：<3 局必须降权，3-5 局谨慎参考
- 五维能力（shot/victory/breach/snipe/prop）只表示平台风格标签，不与旧七维雷达互换，也不直接换算胜率
- 组排：同 troopTeamId 可能提升协同，但若组排成员 Rating/WE 低不应简单判优势
`.trim();

export const MAP_FIT_HINTS: Record<string, string> = {
  de_dust2: '长枪线、中路/A大控制、狙击与首杀权重高',
  de_mirage: '中路控图、道具协同、默认战术执行',
  de_inferno: '香蕉道道具、近点交火、补枪与残局',
  de_nuke: '垂直协同、外场控制、道具与残局',
  de_ancient: '中路争夺、道具压制、信息战',
  de_vertigo: '近距离交火、首杀与补枪',
  de_overpass: '道具、信息、长枪与狙击',
};

export function mapFitHint(mapName?: string): string | undefined {
  if (!mapName) return undefined;
  const key = mapName.toLowerCase().replace(/^cs_/, 'de_');
  return MAP_FIT_HINTS[key];
}
