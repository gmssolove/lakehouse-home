import { getR2UploadConfig } from '@/lib/r2/config';
import { compressImageFileForUpload } from '@/lib/r2/compressImage';
import { guessMimeFromName, isAudioMime, normalizeUploadFile, sanitizeUploadFile } from '@/lib/r2/mime';

const pending: Promise<unknown>[] = [];
const MAX_AUDIO_DATA_URL_BYTES = 8 * 1024 * 1024;

export function isDataUrl(s: string): boolean {
  return /^data:(image|audio)\//i.test(s);
}

export function isR2Url(s: string): boolean {
  return (
    typeof s === 'string' &&
    (/\/file\//.test(s) || /lakehouse-r2-upload/i.test(s) || /\/api\/r2-upload/i.test(s))
  );
}

function dataUrlToFile(dataUrl: string, name?: string): File {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) throw new Error('invalid data url');
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const ext = (m[1].split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
  return new File([arr], name || `upload.${ext}`, { type: m[1] });
}

function track<T>(promise: Promise<T>): Promise<T> {
  pending.push(promise);
  promise.finally(() => {
    const idx = pending.indexOf(promise);
    if (idx >= 0) pending.splice(idx, 1);
  });
  return promise;
}

export async function waitR2Pending(): Promise<void> {
  await Promise.all(pending.slice());
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

function uploadHeaders(token: string | undefined, extra: HeadersInit): HeadersInit {
  return token ? { ...extra, 'X-Upload-Token': token } : extra;
}

async function parseUploadResponse(res: Response, usedToken: boolean, retry: () => Promise<string>): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    if (res.status === 401 && usedToken && typeof window !== 'undefined') {
      localStorage.removeItem('lakehouse_r2_upload_token');
      return retry();
    }
    const msg = data.error || '업로드에 실패했습니다.';
    if (res.status === 401 && msg === 'unauthorized') {
      throw new Error('업로드 인증에 실패했습니다. 관리자 R2 설정의 토큰이 맞는지 확인해 주세요.');
    }
    throw new Error(msg);
  }
  if (!data.url) throw new Error('R2 응답에 url이 없습니다.');
  return data.url;
}

async function postRawUpload(file: File, folder: string, skipToken = false): Promise<string> {
  const token = !skipToken && typeof window !== 'undefined' ? getR2UploadConfig().token : '';
  const contentType = file.type?.trim() || guessMimeFromName(file.name, 'application/octet-stream');

  const res = await fetch('/api/r2-upload', {
    method: 'POST',
    body: file,
    headers: uploadHeaders(token, {
      'Content-Type': contentType,
      'X-Folder': folder,
      'X-File-Name': encodeURIComponent(file.name || 'upload'),
    }),
  });

  return parseUploadResponse(res, !!token, () => postRawUpload(file, folder, true));
}

async function postFormData(file: File, folder: string, skipToken = false): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);

  const token = !skipToken && typeof window !== 'undefined' ? getR2UploadConfig().token : '';
  const res = await fetch('/api/r2-upload', {
    method: 'POST',
    body: form,
    ...(token ? { headers: { 'X-Upload-Token': token } } : {}),
  });

  return parseUploadResponse(res, !!token, () => postFormData(file, folder, true));
}

async function postToWorker(file: File, folder: string): Promise<string> {
  const { uploadUrl, token } = getR2UploadConfig();
  const contentType = file.type?.trim() || guessMimeFromName(file.name, 'application/octet-stream');
  const headers: HeadersInit = uploadHeaders(token, {
    'Content-Type': contentType,
    'X-Folder': folder,
    'X-File-Name': encodeURIComponent(file.name || 'upload'),
  });

  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: file,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Worker 업로드 실패 (${res.status})`);
  }
  if (!data.url) {
    throw new Error('Worker 응답에 url이 없습니다.');
  }
  return data.url;
}

async function tryLegacyUpload(file: File, folder: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const legacy = window.LakeR2Upload;
  if (!legacy?.uploadFile) return null;
  try {
    return await legacy.uploadFile(file, folder);
  } catch {
    return null;
  }
}

async function tryAudioDataUrlFallback(file: File): Promise<string | null> {
  const type = file.type?.trim() || guessMimeFromName(file.name);
  const looksAudio = isAudioMime(type) || /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|weba)$/i.test(file.name);
  if (!looksAudio) return null;
  if (file.size > MAX_AUDIO_DATA_URL_BYTES) {
    throw new Error('오디오 파일이 너무 큽니다 (8MB 이하만 임시 저장 가능). R2 업로드 설정을 확인해 주세요.');
  }
  console.warn('[R2] API/Worker 업로드 실패 — data URL로 임시 저장합니다.');
  return readFileAsDataUrl(file);
}

function pickUploadError(errors: string[]): Error {
  const unique = [...new Set(errors.filter(Boolean))];
  const sizeErr = unique.find((e) => /too large|너무 큽/i.test(e));
  if (sizeErr && unique.length === 1) return new Error(sizeErr);
  if (sizeErr) return new Error(sizeErr);
  return new Error(unique.join(' · ') || '업로드에 실패했습니다.');
}

async function uploadMediaFileInner(file: File, folder: string): Promise<string> {
  const errors: string[] = [];

  try {
    return await postToWorker(file, folder);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Worker 업로드 실패');
  }

  try {
    return await postRawUpload(file, folder);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'API 업로드 실패');
  }

  try {
    return await postFormData(file, folder);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'API(FormData) 업로드 실패');
  }

  const legacyUrl = await tryLegacyUpload(file, folder);
  if (legacyUrl) return legacyUrl;

  const dataUrl = await tryAudioDataUrlFallback(file);
  if (dataUrl) return dataUrl;

  throw pickUploadError(errors);
}

export async function uploadMediaFile(file: File, folder: string): Promise<string> {
  const defaultMime = /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|weba)$/i.test(file.name)
    ? 'audio/mpeg'
    : undefined;
  const normalized = sanitizeUploadFile(normalizeUploadFile(file, defaultMime));
  const prepared = await compressImageFileForUpload(normalized);
  return track(uploadMediaFileInner(prepared, folder));
}

export { normalizeUploadFile, sanitizeUploadFile } from '@/lib/r2/mime';

export async function uploadImageFile(file: File, folder: string): Promise<string> {
  return uploadMediaFile(file, folder);
}

export async function uploadImageUrl(url: string, folder: string, name?: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed || !isDataUrl(trimmed) || isR2Url(trimmed)) return trimmed;
  return uploadMediaFile(dataUrlToFile(trimmed, name), folder);
}

/** @deprecated LakeR2Upload 대신 uploadMediaFile을 사용하세요. */
export function getLakeR2() {
  return null;
}

declare global {
  interface Window {
    LakeR2Upload?: {
      uploadFile?: (file: File, folder: string) => Promise<string>;
    };
  }
}
