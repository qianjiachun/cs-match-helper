export const P5E_DEFAULT_CDP_PORT = 9222;
/** 首选端口被占用时由后端在 9222 起自动递增扫描 */

export function buildP5eClientExe(root: string): string {
  return `${root.replace(/[/\\]+$/, '')}\\5EClient.exe`;
}
