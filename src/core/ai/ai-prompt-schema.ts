/** 共享：AI 输出语言约束（完美 / 5E 通用） */
export const AI_OUTPUT_LANGUAGE_RULES = `输出语言（硬性，面向中国玩家）：
- 所有展示给用户的文案必须使用简体中文，通俗易懂，像开黑时简要点评
- 必须用中文的字段：headline、quickReasons、stabilityReason、teamSummary.A、teamSummary.B、keyFactors[].text、playerNotes[].text、risks[]、dataQuality
- 仅 JSON 键名、predictedWinner 枚举（A/B/Even/Unknown）、playerNotes.role（entry/awp/lurk 等）保持英文
- 允许句中夹杂少量 CS 专业名词或缩写：Rating、ADR、RWS、ELO、K/D、MVP、AWP 等；不要把整句或整段写成英文
- 严禁全英文输出；严禁用英文写 headline、理由、队伍总结、风险提示等可读内容
- 禁止英文长句、英文段落、英文标题式表达；不要直译英文分析腔
- 称呼对局参与者一律用「玩家」，禁止使用「球员」`;

export const AI_OUTPUT_LANGUAGE_RULES_EN = `Output language (strict, for English-speaking CS2 players):
- Write every user-facing field in natural, concise English used by CS2 players and analysts
- English is required for headline, quickReasons, stabilityReason, teamSummary.A/B, keyFactors[].text, playerNotes[].text, risks[], and dataQuality
- Keep JSON keys, predictedWinner values (A/B/Even/Unknown), and playerNotes.role values in English
- Use established CS terminology: counter-strafing, opening kill, trade fragging, utility, entry fragging, clutch, AWP, ADR, RWS, ELO, K/D, and HS%
- Refer to match participants as "players", never "athletes"
- Preserve player nicknames and platform-provided raw names exactly as supplied
- Do not output Chinese sentences, headings, or explanations`;

export type AiOutputLocale = 'zh-CN' | 'en-US';

export function getAiOutputLanguageRules(locale: AiOutputLocale): string {
  return locale === 'en-US' ? AI_OUTPUT_LANGUAGE_RULES_EN : AI_OUTPUT_LANGUAGE_RULES;
}

/** 共享 AI 输出 JSON schema 说明（完美 / 5E 通用） */
export const AI_USER_PROMPT_SCHEMA = `请在 30 秒确认场景下快速给出赛前判断。

${AI_OUTPUT_LANGUAGE_RULES}

重要：JSON 字段请按以下顺序输出，把结论字段放在最前面以便尽快展示：
{
  "predictedWinner": "A|B|Even|Unknown",
  "winProbability": { "A": number, "B": number },
  "headline": string,
  "quickReasons": string[],
  "confidence": number,
  "stabilityReason": string,
  "teamSummary": { "A": string, "B": string },
  "keyFactors": [{ "side": "A|B|Both", "type": "strength|risk|map|party|form", "text": string, "weight": number }],
  "playerNotes": [{ "steamId": string, "nickname": string, "side": "A|B", "text": string, "role": string }],
  "risks": string[],
  "dataQuality": string
}

匹配数据摘要：
`;

export const AI_USER_PROMPT_SCHEMA_EN = `Give a fast pre-match assessment suitable for a 30-second ready-check window.

${AI_OUTPUT_LANGUAGE_RULES_EN}

Return the JSON fields in this order so the conclusion can stream first:
{
  "predictedWinner": "A|B|Even|Unknown",
  "winProbability": { "A": number, "B": number },
  "headline": string,
  "quickReasons": string[],
  "confidence": number,
  "stabilityReason": string,
  "teamSummary": { "A": string, "B": string },
  "keyFactors": [{ "side": "A|B|Both", "type": "strength|risk|map|party|form", "text": string, "weight": number }],
  "playerNotes": [{ "steamId": string, "nickname": string, "side": "A|B", "text": string, "role": string }],
  "risks": string[],
  "dataQuality": string
}

Match data summary:
`;

export function getAiUserPromptSchema(locale: AiOutputLocale): string {
  return locale === 'en-US' ? AI_USER_PROMPT_SCHEMA_EN : AI_USER_PROMPT_SCHEMA;
}
