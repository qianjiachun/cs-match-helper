/** 5e 客户端常见安装路径（Windows） */
export const P5E_CLIENT_CANDIDATES = [
  'D:\\Game\\5E\\5EClient',
  'C:\\5E\\5EClient',
  'D:\\5E\\5EClient',
  'E:\\Game\\5E\\5EClient',
] as const;

export const P5E_DEFAULT_CDP_PORT = 9222;
/** 首选端口被占用时由后端在 9222 起自动递增扫描 */

export function buildP5eClientExe(root: string): string {
  return `${root.replace(/[/\\]+$/, '')}\\5EClient.exe`;
}
