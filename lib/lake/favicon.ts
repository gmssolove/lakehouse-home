/** Favicon apply helpers — shared by inline bootstrap + SiteEffects */

export const LAKE_FAVICON_STORAGE_KEY = 'lhdata_site_main';
export const LAKE_FAVICON_ATTR = 'data-lake-favicon';

export function resolveLakeFaviconHref(raw?: string | null): string {
  let href = (raw || '').trim() || '/favicon.svg';
  // 과거 asDataUrl 초대형은 head·탭을 굳힘
  if (href.startsWith('data:') && href.length > 24_000) {
    return '/favicon.svg';
  }
  return href;
}

export function withFaviconCacheBust(url: string): string {
  if (url.startsWith('data:')) return url;
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://lakehouse.me.kr');
    u.searchParams.set('v', String(url.length));
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

/** Replace competing icon links with a single lake favicon link. */
export function applyLakeFavicon(rawHref?: string | null): void {
  if (typeof document === 'undefined') return;
  const href = resolveLakeFaviconHref(rawHref);
  const finalHref = withFaviconCacheBust(href);
  const head = document.head;

  head
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel~="icon"]')
    .forEach((el) => {
      if (el.getAttribute(LAKE_FAVICON_ATTR) === '1') return;
      el.remove();
    });

  let link = head.querySelector<HTMLLinkElement>(`link[${LAKE_FAVICON_ATTR}="1"]`);
  // 브라우저가 path별 파비콘을 캐시하므로, 같은 노드 href만 바꾸면 OC/Pair에서 옛 아이콘이 남음 → 교체
  if (link && link.getAttribute('href') === finalHref) {
    const type = faviconMimeType(href);
    if (type) link.type = type;
    return;
  }
  link?.remove();
  link = document.createElement('link');
  link.rel = 'icon';
  link.setAttribute(LAKE_FAVICON_ATTR, '1');
  const type = faviconMimeType(href);
  if (type) link.type = type;
  link.href = finalHref;
  head.appendChild(link);
}

/** localStorage에 캐시된 Admin 파비콘 (하드 네비 first paint용) */
export function readCachedLakeFavicon(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = JSON.parse(localStorage.getItem(LAKE_FAVICON_STORAGE_KEY) || 'null');
    const href = data?.favicon;
    return typeof href === 'string' && href.trim() ? href.trim() : null;
  } catch {
    return null;
  }
}
