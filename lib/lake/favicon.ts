/** Favicon apply helpers — same-origin /favicon.ico proxies Admin icon */

export const LAKE_FAVICON_HREF_KEY = 'lake_favicon_href';
export const LAKE_FAVICON_ATTR = 'data-lake-favicon';

/** Always same-origin so OC/Pair hard loads don't stick on public/favicon.svg */
export const LAKE_FAVICON_SAME_ORIGIN = '/favicon.ico';

export function resolveLakeFaviconHref(raw?: string | null): string {
  const href = (raw || '').trim();
  if (!href) return LAKE_FAVICON_SAME_ORIGIN;
  if (href.startsWith('data:') && href.length > 24_000) return LAKE_FAVICON_SAME_ORIGIN;
  // Prefer same-origin proxy so tab cache is origin-stable across /oc /pair
  if (/^https?:\/\//i.test(href) || href.startsWith('data:')) {
    return LAKE_FAVICON_SAME_ORIGIN;
  }
  if (href === '/favicon.svg') return LAKE_FAVICON_SAME_ORIGIN;
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

/** Replace competing icon links with same-origin lake favicon. */
export function applyLakeFavicon(remoteHref?: string | null): void {
  if (typeof document === 'undefined') return;
  const version =
    (remoteHref || '').trim() ||
    (typeof window !== 'undefined' ? localStorage.getItem(LAKE_FAVICON_HREF_KEY) || '' : '');
  const href = withFaviconCacheBust(LAKE_FAVICON_SAME_ORIGIN, String(version.length || 1));
  const head = document.head;

  head
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel~="icon"], link[rel="apple-touch-icon"]',
    )
    .forEach((el) => {
      if (el.getAttribute(LAKE_FAVICON_ATTR) === '1' && el.href.includes('/favicon.ico')) {
        /* keep if already ours with same path — still refresh href below */
      }
      el.remove();
    });

  const link = document.createElement('link');
  link.rel = 'icon';
  link.setAttribute(LAKE_FAVICON_ATTR, '1');
  link.type = 'image/png';
  link.href = href;
  head.insertBefore(link, head.firstChild);

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
