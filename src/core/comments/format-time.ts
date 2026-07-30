function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / N天前 / N个月前 / N年前 */
export function formatCommentRelativeTime(timestamp: number, now = Date.now(), locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = now - timestamp;
  if (diffMs < 0) return locale === 'en-US' ? 'just now' : '刚刚';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return locale === 'en-US' ? 'just now' : '刚刚';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return locale === 'en-US' ? `${diffMin}m ago` : `${diffMin}分钟前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return locale === 'en-US' ? `${diffHour}h ago` : `${diffHour}小时前`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return locale === 'en-US' ? `${diffDay}d ago` : `${diffDay}天前`;

  const nowDate = new Date(now);
  const monthDiff =
    (nowDate.getFullYear() - date.getFullYear()) * 12 + (nowDate.getMonth() - date.getMonth());
  if (monthDiff < 12) return locale === 'en-US' ? `${Math.max(monthDiff, 1)}mo ago` : `${Math.max(monthDiff, 1)}个月前`;

  const yearDiff = nowDate.getFullYear() - date.getFullYear();
  return locale === 'en-US' ? `${Math.max(yearDiff, 1)}y ago` : `${Math.max(yearDiff, 1)}年前`;
}

/** 绝对时间：带年、不带秒，如 2025/6/18 14:30 */
export function formatCommentDateTime(timestamp: number, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  if (locale === 'en-US') {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatCommentTimeMeta(
  timestamp: number,
  now = Date.now(),
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
): { relative: string; absolute: string; iso: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { relative: '', absolute: '', iso: '' };
  }

  return {
    relative: formatCommentRelativeTime(timestamp, now, locale),
    absolute: formatCommentDateTime(timestamp, locale),
    iso: date.toISOString(),
  };
}
