/** 完美平台关键指标经验基准，供 AI 判断红绿与强弱 */
export const METRIC_BASELINES_TEXT = `
指标基准线（红绿分界与参考区间，需结合样本量与地图适配综合判断）：
- Rating Pro：1.00 为红绿分界；>=1.10 偏强，>=1.20 明显强；<0.95 偏弱，<0.85 明显低迷
- WE：8 为红绿分界；>=10 影响力较强，>=12 明显 carry；<7 偏低，<6 明显低迷
- ADPR/ADR：80 左右为较好输出；>=85 稳定高伤，>=90 强输出；<70 输出偏低
- K/D：1.00 为基本分界；>=1.15 稳定正贡献；<0.90 偏弱（K/D 为估算值时降权）
- 近期胜率/地图胜率：50% 为基本分界；>=60% 偏好，<45% 偏差
- 地图样本：<3 局必须降权，3-5 局谨慎参考
- 雷达维度：60 可用，70+ 突出，80+ 明显强项，50 以下短板；结合 level 字母评级
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
