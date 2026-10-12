/** Favicon apply helpers — Admin 아이콘. 가능하면 CDN URL, 아니면 동일 출처 프록시 */

export const LAKE_FAVICON_HREF_KEY = 'lake_favicon_href';
export const LAKE_FAVICON_ATTR = 'data-lake-favicon';

export const LAKE_FAVICON_SAME_ORIGIN = '/favicon.ico';

export function resolveLakeFaviconHref(raw?: string | null): string {
  const href = (raw || '').trim();
  if (!href || href === '/favicon.svg') return LAKE_FAVICON_SAME_ORIGIN;
  if (href.startsWith('data:') && href.length > 24_000) return LAKE_FAVICON_SAME_ORIGIN;
  if (/^https?:\/\//i.test(href) || href.startsWith('data:')) return href;
  return href;
}

export function withFaviconCacheBust(url: string, versionHint = ''): string {
  if (url.startsWith('data:')) return url;
  const v = (versionHint || '').replace(/[^\w-]/g, '').slice(0, 32) || '1';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${v}`;
}

export function faviconMimeType(url: string): string {
  if (/favicon\.ico/i.test(url)) return 'image/x-icon';
  if (/^data:image\/svg/i.test(url) || /\.svg(\?|$)/i.test(url)) return 'image/svg+xml';
  if (/^data:image\/png/i.test(url) || /\.png(\?|$)/i.test(url)) return 'image/png';
  if (/^data:image\/jpe?g/i.test(url) || /\.jpe?g(\?|$)/i.test(url)) return 'image/jpeg';
  if (/^data:image\/x-icon/i.test(url) || /\.ico(\?|$)/i.test(url)) return 'image/x-icon';
  return '';
}

function persistFaviconHref(remoteHref: string) {
  if (typeof window === 'undefined') return;
  const h = remoteHref.trim();
  if (!h || h === '/favicon.svg' || h === LAKE_FAVICON_SAME_ORIGIN) return;
  try {
    localStorage.setItem(LAKE_FAVICON_HREF_KEY, h);
  } catch {
    /* ignore */
  }
}

/**
 * Update favicon href in place.
 * Never removeChild / el.remove() on head links — Next/React owns
 * layout metadata icons; detaching them causes
 * "Cannot read properties of null (reading 'removeChild')".
 */
export function applyLakeFavicon(remoteHref?: string | null): void {
  if (typeof document === 'undefined') return;
  const raw =
    (remoteHref || '').trim() ||
    (typeof window !== 'undefined' ? localStorage.getItem(LAKE_FAVICON_HREF_KEY) || '' : '');
  const resolved = resolveLakeFaviconHref(raw);
  const href =
    resolved === LAKE_FAVICON_SAME_ORIGIN
      ? withFaviconCacheBust(LAKE_FAVICON_SAME_ORIGIN, String(raw.length || 1))
      : resolved;
  const head = document.head;
  if (!head) return;

  let link = head.querySelector<HTMLLinkElement>(`link[${LAKE_FAVICON_ATTR}="1"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.setAttribute(LAKE_FAVICON_ATTR, '1');
    head.appendChild(link);
  }

  const type = faviconMimeType(href) || 'image/png';
  if (link.getAttribute('href') !== href) {
    link.type = type;
    link.setAttribute('href', href);
  }

  if (remoteHref?.trim()) persistFaviconHref(remoteHref.trim());
}

export function readCachedLakeFavicon(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const direct = localStorage.getItem(LAKE_FAVICON_HREF_KEY)?.trim();
    return direct || null;
  } catch {
    return null;
  }
}
