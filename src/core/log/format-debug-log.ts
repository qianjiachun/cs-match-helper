import type { DebugLogEntry } from './types';

function formatLogEntryBlock(entry: DebugLogEntry, index: number): string {
  const headerParts = [
    `[${index + 1}]`,
    entry.receivedAt,
    entry.parsed.time,
    entry.parsed.level,
    entry.parsed.category,
    entry.isMatchEvent ? '匹配事件' : '',
  ].filter(Boolean);

  const lines = [headerParts.join(' | '), entry.parsed.decoded];
  if (entry.parsed.raw && entry.parsed.raw !== entry.parsed.decoded) {
    lines.push('', `raw: ${entry.parsed.raw}`);
  }
  return lines.join('\n');
}

/** 将调试日志条目格式化为可复制的纯文本（含完整 decoded，不截断）。 */
export function formatDebugLogEntriesForCopy(
  entries: DebugLogEntry[],
  options: { title: string; metaLines?: string[] },
): string {
  const exportedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const header = [
    options.title,
    ...(options.metaLines ?? []),
    `共 ${entries.length} 条`,
    `导出时间: ${exportedAt}`,
    '',
  ].join('\n');

  if (!entries.length) return header;

  const body = entries.map((entry, index) => formatLogEntryBlock(entry, index)).join('\n\n');
  return `${header}${body}\n`;
}
