export interface ChangelogReleaseSummary {
  tagName: string;
  publishedAt?: string;
  htmlUrl: string;
}

export interface ChangelogReleaseDetail extends ChangelogReleaseSummary {
  body?: string;
}

export function formatChangelogDate(isoDate?: string): string {
  if (!isoDate?.trim()) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

export function releaseTagKey(tagName: string): string {
  return tagName.trim();
}
