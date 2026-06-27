const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  weba: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mid: 'audio/midi',
  midi: 'audio/midi',
};

export function guessMimeFromName(name: string, fallback = 'application/octet-stream'): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_MIME[ext] || fallback;
}

export function isAudioMime(type: string): boolean {
  return type.startsWith('audio/');
}

/** Windows 등에서 file.type 이 비어 있을 때 업로드 거부 방지 */
export function normalizeUploadFile(file: File, defaultMime?: string): File {
  const type = file.type?.trim() || guessMimeFromName(file.name, defaultMime || 'application/octet-stream');
  if (!type || type === file.type) return file;
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

/** Node/undici FormData 파서가 비ASCII 파일명에서 실패하는 경우 방지 */
export function sanitizeUploadFileName(name: string): string {
  const raw = String(name || 'upload').split(/[\\/]/).pop() || 'upload';
  const dot = raw.lastIndexOf('.');
  const ext = dot > 0 ? raw.slice(dot) : '';
  const stem = dot > 0 ? raw.slice(0, dot) : raw;
  const safeStem =
    stem
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'upload';
  const safeExt = ext.replace(/[^a-zA-Z0-9.]+/g, '').slice(0, 16);
  return `${safeStem}${safeExt}` || 'upload.bin';
}

export function sanitizeUploadFile(file: File, defaultMime?: string): File {
  const normalized = normalizeUploadFile(file, defaultMime);
  const safeName = sanitizeUploadFileName(normalized.name);
  if (safeName === normalized.name) return normalized;
  return new File([normalized], safeName, {
    type: normalized.type,
    lastModified: normalized.lastModified,
  });
}
