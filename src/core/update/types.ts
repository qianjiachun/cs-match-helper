export interface UpdateCheckResult {
  currentVersion: string;
  hasUpdate: boolean;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
}
