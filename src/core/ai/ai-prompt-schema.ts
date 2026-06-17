/** 共享 AI 输出 JSON schema 说明（完美 / 5E 通用） */
export const AI_USER_PROMPT_SCHEMA = `请在 30 秒确认场景下快速给出赛前判断。
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
