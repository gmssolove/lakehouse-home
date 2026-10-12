/** Server-only: resolve Admin favicon URL from Firebase RTDB */

const FIREBASE_FAVICON_URL =
  'https://llikebread-default-rtdb.asia-southeast1.firebasedatabase.app/lhdata/site/main/favicon.json';

const FALLBACK_PATH = '/favicon.svg';

export async function resolveSiteFaviconRemoteUrl(): Promise<string | null> {
  try {
    const res = await fetch(FIREBASE_FAVICON_URL, {
      next: { revalidate: 60 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    if (typeof raw !== 'string') return null;
    const href = raw.trim();
    if (!href || (href.startsWith('data:') && href.length > 24_000)) return null;
    return href;
  } catch {
    return null;
  }
}

export async function fetchSiteFaviconBytes(): Promise<{
  body: ArrayBuffer;
  contentType: string;
} | null> {
  const remote = await resolveSiteFaviconRemoteUrl();
  if (!remote) return null;

  if (remote.startsWith('data:')) {
    const m = /^data:([^;,]+);base64,(.+)$/i.exec(remote);
    if (!m) return null;
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { body: bytes.buffer, contentType: m[1] };
  }

  const img = await fetch(remote, { next: { revalidate: 60 } });
  if (!img.ok) return null;
  const contentType =
    img.headers.get('content-type') ||
    (/\.svg(\?|$)/i.test(remote)
      ? 'image/svg+xml'
      : /\.jpe?g(\?|$)/i.test(remote)
        ? 'image/jpeg'
        : 'image/png');
  return { body: await img.arrayBuffer(), contentType };
}

export { FALLBACK_PATH as SITE_FAVICON_FALLBACK };
