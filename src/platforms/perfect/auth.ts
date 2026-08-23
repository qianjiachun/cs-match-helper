export type PerfectAuthPhase =
  | 'idle'
  | 'requesting'
  | 'waiting_scan'
  | 'scanned'
  | 'confirming'
  | 'validating'
  | 'authenticated'
  | 'expired'
  | 'cancelled'
  | 'error';

export type PerfectAuthMethod = 'qr' | 'steam';

export interface PerfectAuthStatus {
  phase: PerfectAuthPhase;
  method?: PerfectAuthMethod;
  uid?: string;
  name?: string;
  avatar?: string;
  error?: string;
  qrImageDataUrl?: string;
  expiresAt?: number;
}

export interface PerfectDecryptInput {
  response?: string;
  e?: string;
  t?: string | number;
}

export interface PerfectDecryptOutput {
  value: unknown;
  formattedJson: string;
}
