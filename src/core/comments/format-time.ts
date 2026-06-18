function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / N天前 / N个月前 / N年前 */
export function formatCommentRelativeTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = now - timestamp;
  if (diffMs < 0) return '刚刚';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return '刚刚';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}天前`;

  const nowDate = new Date(now);
  const monthDiff =
    (nowDate.getFullYear() - date.getFullYear()) * 12 + (nowDate.getMonth() - date.getMonth());
  if (monthDiff < 12) return `${Math.max(monthDiff, 1)}个月前`;

  const yearDiff = nowDate.getFullYear() - date.getFullYear();
  return `${Math.max(yearDiff, 1)}年前`;
}

/** 绝对时间：带年、不带秒，如 2025/6/18 14:30 */
export function formatCommentDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatCommentTimeMeta(
  timestamp: number,
  now = Date.now(),
): { relative: string; absolute: string; iso: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { relative: '', absolute: '', iso: '' };
  }

  return {
    relative: formatCommentRelativeTime(timestamp, now),
    absolute: formatCommentDateTime(timestamp),
    iso: date.toISOString(),
  };
}
