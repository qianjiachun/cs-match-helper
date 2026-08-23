/** Shared AI output-language constraints for Perfect and 5E. */
export const AI_OUTPUT_LANGUAGE_RULES = `输出语言（硬性，面向中国玩家）：
- 所有展示文案使用简体中文，表达简洁、具体，像赛前队友交流
- headline、decisiveFactors[].title/summary、playerSignals[].title/summary、teamPlans.*.*[].text、uncertainties[] 必须使用中文
- JSON 键名、枚举值和证据 ID 保持英文
- 允许使用 Rating、ADR、RWS、ELO、K/D、MVP、AWP 等通用 CS 术语
- 严禁全英文输出或英文长段落
- 称呼对局参与者一律用「玩家」，禁止使用「球员」`;

export const AI_OUTPUT_LANGUAGE_RULES_EN = `Output language (strict, for English-speaking CS2 players):
- Write every user-facing field in concise, natural English
- headline, decisiveFactors[].title/summary, playerSignals[].title/summary, teamPlans.*.*[].text, and uncertainties[] must be English
- Keep JSON keys, enum values, and evidence IDs in English
- Use established CS terminology such as Rating, ADR, RWS, ELO, K/D, AWP, opening kills, utility, and clutching
- Refer to match participants as players, never athletes`;

export type AiOutputLocale = 'zh-CN' | 'en-US';

export function getAiOutputLanguageRules(locale: AiOutputLocale): string {
  return locale === 'en-US' ? AI_OUTPUT_LANGUAGE_RULES_EN : AI_OUTPUT_LANGUAGE_RULES;
}

const SCHEMA = `{
  "schemaVersion": 3,
  "predictedWinner": "A|B|Even|Unknown",
  "modelWinProbability": { "A": number, "B": number },
  "confidence": number,
  "headline": string,
  "decisiveFactors": [{
    "id": string,
    "dimension": "strength|aim|opening|utility|clutch|map|form|party",
    "advantage": "A|B|Even",
    "impact": 1|2|3,
    "title": string,
    "summary": string,
    "evidenceIds": string[]
  }],
  "playerSignals": [{
    "steamId": string,
    "side": "A|B",
    "kind": "carry|anchor|specialist|weakLink|volatile",
    "impact": 1|2|3,
    "title": string,
    "summary": string,
    "evidenceIds": string[]
  }],
  "teamPlans": {
    "A": {
      "winConditions": [{ "text": string, "evidenceIds": string[] }],
      "risks": [{ "text": string, "evidenceIds": string[] }]
    },
    "B": {
      "winConditions": [{ "text": string, "evidenceIds": string[] }],
      "risks": [{ "text": string, "evidenceIds": string[] }]
    }
  },
  "uncertainties": string[]
}`;

export const AI_USER_PROMPT_SCHEMA = `请给出直接、可行动且受证据约束的赛前判断，重点回答谁强、谁弱、为什么，以及会怎样影响本局。

${AI_OUTPUT_LANGUAGE_RULES}

严格规则：
- 只输出 JSON，不要 Markdown
- 只能引用 evidenceCatalog 中存在的 evidence ID，不得自行输出或编造指标值
- direction=positive/negative/mixed/neutral 已由客户端按全场中位数、队内中位数和指标方向计算；反应时间等越低越好的指标已经反向处理
- playerSignals 只能使用 allowedPlayers 中的 SteamID；最多 4 人、每队最多 2 人
- 只要某名玩家有至少两项不同维度、中高可靠度且 direction 为 positive 或 negative 的证据，就必须输出玩家信号；优先覆盖双方各至少 1 人
- 仅当双方都没有足够正负对比证据时，playerSignals 才允许为空；不要因为谨慎而整表留空
- carry/weakLink 必须引用两个不同维度、中高可靠度且分别为 positive/negative 的玩家证据；sides/openingProfile 等 direction=neutral 的摘要只能作补充，不能单独充当强弱
- anchor 至少引用两项 opening、utility、clutch 或 form 的 positive 证据
- specialist 必须引用充足地图样本或明确武器专项证据
- volatile 必须同时引用中高可靠度的 positive 与 negative 证据；低样本不能单独成立
- watch 只用于客户端转换旧历史，新模型禁止输出
- 每个 decisiveFactor、playerSignal 和 teamPlans claim 至少引用 1 个有效证据 ID
- 不要把所有值得关注的玩家归为同一类型；必须明确区分强项、支点、专长、短板和波动
- 低样本只能写入 uncertainties，不能单独作为负面玩家信号
- 每队最多 2 条取胜条件和 2 条隐患；decisiveFactors 最多 4 条；uncertainties 最多 4 条
- modelWinProbability 两项必须可归一化；不要自行按覆盖率收敛，客户端会做最终校准
- confidence 为 0-100 的模型自评数据把握度
- perspective 存在时，selfSide 是当前登录玩家所在队；判断时按我方视角组织重点，但所有 JSON 枚举和展示文案仍使用 A 队/B 队，禁止直接输出“我方/对方”，客户端会动态映射
- headline 不超过 32 个汉字；title 不超过 12 个汉字；summary、取胜条件和隐患不超过 50 个汉字；uncertainties 单项不超过 40 个汉字

按以下顺序输出，以便先流式显示结论：
${SCHEMA}

匹配数据与允许引用的证据：
`;

export const AI_USER_PROMPT_SCHEMA_EN = `Give a direct, actionable, evidence-constrained pre-match assessment. Explain who is strong or weak, why, and how that changes this matchup.

${AI_OUTPUT_LANGUAGE_RULES_EN}

Strict rules:
- Return JSON only, without Markdown
- Reference only IDs present in evidenceCatalog; never invent metric values
- direction is computed locally from lobby median, team median, and metric semantics; lower-is-better metrics are already reversed
- playerSignals may use only SteamIDs in allowedPlayers; return at most four total and two per side
- If a player has at least two medium/high-reliability positive or negative metrics across distinct dimensions, you must emit a player signal; cover at least one player per side when possible
- Leave playerSignals empty only when neither side has enough directional evidence; do not omit the array out of caution
- carry/weakLink must cite two distinct-dimension, medium/high-reliability player evidence items whose direction is already positive/negative; neutral summaries such as sides or openingProfile are supporting context only
- anchor requires two positive opening, utility, clutch, or form metrics
- specialist requires a sufficient map sample or explicit weapon specialty sample
- volatile requires both positive and negative medium/high-reliability evidence; low sample size alone never qualifies
- watch is reserved for legacy conversion and must never be returned by the model
- Every decisive factor, player signal, and team-plan claim must cite a valid evidence ID
- Distinguish strengths, anchors, specialists, weaknesses, and volatility instead of labeling every notable player the same way
- Low sample size belongs only in uncertainties and cannot by itself create a negative signal
- Return at most two win conditions and two risks per side, four decisive factors, four signals, and four uncertainties
- modelWinProbability must be normalizable; the client applies coverage calibration
- confidence is the model's 0-100 assessment of data certainty
- When perspective is present, selfSide identifies the signed-in player's team. Reason from that viewpoint, but keep all enums and prose canonically labeled Team A/Team B; the client maps viewer-facing labels
- Keep headlines under 32 words, titles under 12 words, summaries and team-plan claims under 50 words, and each uncertainty under 40 words

Return fields in this order so the conclusion streams first:
${SCHEMA}

Match data and allowed evidence:
`;

export function getAiUserPromptSchema(locale: AiOutputLocale): string {
  return locale === 'en-US' ? AI_USER_PROMPT_SCHEMA_EN : AI_USER_PROMPT_SCHEMA;
}
