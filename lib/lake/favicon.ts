/** Favicon apply helpers — shared by inline bootstrap + SiteEffects */

export const LAKE_FAVICON_STORAGE_KEY = 'lhdata_site_main';
export const LAKE_FAVICON_HREF_KEY = 'lake_favicon_href';
export const LAKE_FAVICON_ATTR = 'data-lake-favicon';

export function resolveLakeFaviconHref(raw?: string | null): string {
  let href = (raw || '').trim() || '/favicon.svg';
  // 과거 asDataUrl 초대형은 head·탭을 굳힘
  if (href.startsWith('data:') && href.length > 24_000) {
    return '/favicon.svg';
  }
  return href;
}

export function withFaviconCacheBust(url: string, pathHint = ''): string {
  if (url.startsWith('data:')) return url;
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://lakehouse.me.kr');
    // path별 브라우저 파비콘 캐시 깨기
    const hint = pathHint.replace(/[^\w/-]/g, '').slice(0, 24) || 'x';
    u.searchParams.set('v', `${url.length}-${hint}`);
    if (/^https?:\/\//i.test(url.trim())) return u.toString();
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function faviconMimeType(url: string): string {
  if (/^data:image\/svg/i.test(url) || /\.svg(\?|$)/i.test(url)) return 'image/svg+xml';
  if (/^data:image\/png/i.test(url) || /\.png(\?|$)/i.test(url)) return 'image/png';
  if (/^data:image\/jpe?g/i.test(url) || /\.jpe?g(\?|$)/i.test(url)) return 'image/jpeg';
  if (/^data:image\/x-icon/i.test(url) || /\.ico(\?|$)/i.test(url)) return 'image/x-icon';
  return '';
}

function persistFaviconHref(href: string) {
  if (typeof window === 'undefined') return;
  if (!href || href === '/favicon.svg') return;
  try {
    localStorage.setItem(LAKE_FAVICON_HREF_KEY, href);
  } catch {
    /* ignore */
  }
}

/** Replace competing icon links with a single lake favicon link. */
export function applyLakeFavicon(rawHref?: string | null, pathHint?: string): void {
  if (typeof document === 'undefined') return;
  const href = resolveLakeFaviconHref(rawHref);
  const finalHref = withFaviconCacheBust(href, pathHint || (typeof window !== 'undefined' ? window.location.pathname : ''));
  const head = document.head;

  head
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel~="icon"], link[rel="apple-touch-icon"]',
    )
    .forEach((el) => el.remove());

  const link = document.createElement('link');
  link.rel = 'icon';
  link.setAttribute(LAKE_FAVICON_ATTR, '1');
  const type = faviconMimeType(href);
  if (type) link.type = type;
  link.href = finalHref;
  head.insertBefore(link, head.firstChild);

  if (href !== '/favicon.svg') persistFaviconHref(href);
}

/** localStorage에 캐시된 Admin 파비콘 (하드 네비 first paint용) */
export function readCachedLakeFavicon(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const direct = localStorage.getItem(LAKE_FAVICON_HREF_KEY)?.trim();
    if (direct) return direct;
    const data = JSON.parse(localStorage.getItem(LAKE_FAVICON_STORAGE_KEY) || 'null');
    const href = data?.favicon;
    return typeof href === 'string' && href.trim() ? href.trim() : null;
  } catch {
    return null;
  }
}
