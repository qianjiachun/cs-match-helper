export interface UpdateCheckResult {
  currentVersion: string;
  hasUpdate: boolean;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
  downloadUrl?: string;
}

export interface DownloadUpdateResult {
  filePath: string;
  sha256: string;
  sizeBytes: number;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'failed'
  | 'manual';

export interface UpdateProgressEvent {
  phase: string;
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
}
