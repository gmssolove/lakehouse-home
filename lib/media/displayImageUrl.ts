/**
 * R2 원본은 종종 수 MB. 목록·아바타에는 표시 너비만 요청한다.
 * Worker가 ?w= 를 모르면 원본을 그대로 주므로 하위 호환.
 */

export type DisplayImagePreset = 'thumb' | 'card' | 'avatar' | 'hero' | 'full';

const PRESET_WIDTH: Record<Exclude<DisplayImagePreset, 'full'>, number> = {
  thumb: 240,
  avatar: 160,
  card: 640,
  hero: 1440,
};

const R2_HOST_RE =
  /(^|\.)workers\.dev$|(^|\.)r2\.dev$|^img\.lakehouse\.me\.kr$|^files\.lakehouse\.me\.kr$/i;

export function isR2PublicUrl(src: string): boolean {
  const raw = String(src || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return false;
  try {
    const u = new URL(raw, 'https://lakehouse.me.kr');
    if (u.pathname.includes('/file/')) return true;
    return R2_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export function displayImageUrl(
  src: string | null | undefined,
  preset: DisplayImagePreset = 'card',
  widthOverride?: number,
): string {
  const raw = String(src || '').trim();
  if (!raw || preset === 'full' || !isR2PublicUrl(raw)) return raw;

  const width = Math.round(widthOverride || PRESET_WIDTH[preset]);
  if (!Number.isFinite(width) || width < 16) return raw;

  try {
    const u = new URL(raw, 'https://lakehouse.me.kr');
    if (u.searchParams.has('w')) return raw;
    u.searchParams.set('w', String(Math.min(2400, width)));
    u.searchParams.set('q', '72');
    u.searchParams.set('f', 'auto');
    return u.toString();
  } catch {
    return raw;
  }
}
