export function cleanSegment(value: string | null | undefined, fallback = 'upload'): string {
  const text = String(value || fallback)
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/');
  return text || fallback;
}

export function cleanFileName(value: string | null | undefined): string {
  const decoded = decodeURIComponent(String(value || 'image'));
  const name = decoded.split(/[\\/]/).pop() || 'image';
  return name.replace(/[^a-zA-Z0-9가-힣._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
}

export function cleanMetadataValue(value: string | null | undefined): string {
  const ascii = String(value || 'upload')
    .replace(/[^\x20-\x7E]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return ascii || 'upload';
}

export function buildObjectKey(folder: string, fileName: string): string {
  const safeFolder = cleanSegment(folder, 'lakehouse');
  const safeName = cleanFileName(fileName);
  return `${safeFolder}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}

export function buildPublicUrl(key: string, baseUrl?: string): string {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) return `/${key}`;
  return `${base}/${key}`;
}
