import type { MatchRecord } from '@core/match/models';

export type AiSide = 'A' | 'B';

export interface AiViewerPerspective {
  selfSide: AiSide | null;
}

function otherSide(side: AiSide): AiSide {
  return side === 'A' ? 'B' : 'A';
}

export function resolveSelfSide(record: MatchRecord, viewerSteamId?: string | null): AiSide | null {
  const platform = record.platformId ?? record.detail.platformId;
  const normalizedId = viewerSteamId?.trim();
  if (platform !== 'perfect' || !normalizedId) return null;

  const matches = record.detail.teams.flatMap((team) => (
    team.players
      .filter((player) => player.steamId === normalizedId)
      .map(() => team.side)
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function sideRelationshipLabel(
  side: AiSide,
  selfSide: AiSide | null | undefined,
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (!selfSide) return locale === 'en-US' ? `Team ${side}` : `${side} 队`;
  const isSelf = side === selfSide;
  if (locale === 'en-US') return isSelf ? 'My team' : 'Opponents';
  return isSelf ? '我方' : '对方';
}

/** Store AI prose with stable A/B terminology so account changes never stale history. */
export function canonicalizePerspectiveText(text: string, selfSide: AiSide | null | undefined): string {
  if (!selfSide || !text) return text;
  const opponentSide = otherSide(selfSide);
  return text
    .replace(/我方/g, `${selfSide} 队`)
    .replace(/对方/g, `${opponentSide} 队`)
    .replace(/\b(?:my|our) team\b/gi, `Team ${selfSide}`)
    .replace(/\b(?:the )?opponents?\b/gi, `Team ${opponentSide}`);
}

/** Resolve stable A/B prose into the current authenticated viewer perspective. */
export function displayPerspectiveText(
  text: string,
  selfSide: AiSide | null | undefined,
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): string {
  if (!selfSide || !text) return text;
  const opponentSide = otherSide(selfSide);
  const selfToken = '\u0000SELF_SIDE\u0000';
  const opponentToken = '\u0000OPPONENT_SIDE\u0000';
  const replaceSide = (value: string, side: AiSide, token: string) => value
    .replace(new RegExp(`${side}\\s*队`, 'gi'), token)
    .replace(new RegExp(`Team\\s+${side}\\b`, 'gi'), token);
  const withSelf = replaceSide(text, selfSide, selfToken);
  const withOpponent = replaceSide(withSelf, opponentSide, opponentToken);
  const displayed = withOpponent
    .replaceAll(selfToken, locale === 'en-US' ? 'My team' : '我方')
    .replaceAll(opponentToken, locale === 'en-US' ? 'Opponents' : '对方');
  return locale === 'zh-CN'
    ? displayed.replace(/(我方|对方)\s+(?=[\u3400-\u9fff])/g, '$1')
    : displayed;
}
