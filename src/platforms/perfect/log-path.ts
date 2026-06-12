/** 完美对战平台客户端日志目录 */
export function buildLogDir(homeDir: string): string {
  const sep = homeDir.includes('/') ? '/' : '\\';
  return `${homeDir}${sep}AppData${sep}Roaming${sep}Wmpvp${sep}Log`;
}

/** 按当天日期推算的日志路径（目录内无文件时的回退） */
export function buildLogPath(homeDir: string): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const sep = homeDir.includes('/') ? '/' : '\\';
  return `${buildLogDir(homeDir)}${sep}pvpClient.${y}-${mo}-${day}.log`;
}
