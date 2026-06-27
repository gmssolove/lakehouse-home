export const R2_UPLOAD_URL_KEY = 'lakehouse_r2_upload_url';
export const R2_UPLOAD_TOKEN_KEY = 'lakehouse_r2_upload_token';

export const DEFAULT_R2_WORKER_UPLOAD = 'https://lakehouse-r2-upload.gmssolove.workers.dev/upload';

export type R2UploadConfig = {
  url?: string;
  token?: string;
};

export function applyR2UploadConfig(cfg: R2UploadConfig | null | undefined) {
  if (typeof window === 'undefined' || !cfg) return;
  const url = cfg.url?.trim();
  const token = cfg.token?.trim();
  if (url) localStorage.setItem(R2_UPLOAD_URL_KEY, url);
  if (token) localStorage.setItem(R2_UPLOAD_TOKEN_KEY, token);
}

export function getR2UploadConfig(): { uploadUrl: string; token: string } {
  if (typeof window === 'undefined') {
    return { uploadUrl: DEFAULT_R2_WORKER_UPLOAD, token: '' };
  }
  const rawUrl = localStorage.getItem(R2_UPLOAD_URL_KEY)?.trim() || '';
  const token = localStorage.getItem(R2_UPLOAD_TOKEN_KEY)?.trim() || '';
  const uploadUrl = resolveWorkerUploadUrl(rawUrl);
  return { uploadUrl, token };
}

export function resolveWorkerUploadUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return DEFAULT_R2_WORKER_UPLOAD;
  if (trimmed.includes('/upload')) return trimmed.replace(/\/+$/, '');
  return `${trimmed.replace(/\/+$/, '')}/upload`;
}
