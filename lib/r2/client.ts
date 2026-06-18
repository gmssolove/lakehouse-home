const pending: Promise<unknown>[] = [];

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

async function postFormData(file: File, folder: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);

  const headers: HeadersInit = {};
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('lakehouse_r2_upload_token')?.trim();
    if (token) headers['X-Upload-Token'] = token;
  }

  const res = await fetch('/api/r2-upload', {
    method: 'POST',
    body: form,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    const msg = data.error || '업로드에 실패했습니다.';
    if (res.status === 401 && msg === 'unauthorized') {
      throw new Error('업로드 토큰이 올바르지 않습니다. localStorage의 lakehouse_r2_upload_token을 삭제하거나 R2_UPLOAD_TOKEN과 맞춰 주세요.');
    }
    throw new Error(msg);
  }
  if (!data.url) {
    throw new Error('R2 응답에 url이 없습니다.');
  }
  return data.url;
}

export async function uploadMediaFile(file: File, folder: string): Promise<string> {
  return track(postFormData(file, folder));
}

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
