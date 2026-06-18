const STEAM_ID64_RE = /^7656\d{13}$/;

export function isValidSteamId64(steamId: string | undefined | null): steamId is string {
  return typeof steamId === 'string' && STEAM_ID64_RE.test(steamId);
}

export function filterValidSteamIds(steamIds: string[]): string[] {
  return [...new Set(steamIds.filter(isValidSteamId64))];
}
