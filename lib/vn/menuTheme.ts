import type { StandPose } from '@/lib/vn/useStandPoseDrag';

/** VN 타이틀(메인) 화면 테마 */
export type ScenarioVnMenuTheme = {
  /** 배경 이미지 URL */
  background?: string;
  /** 배경 흐림 (px) 0–40 */
  blur?: number;
};

export const DEFAULT_MENU_BLUR = 0;
export const MENU_BLUR_MAX = 40;

export function clampMenuBlur(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MENU_BLUR_MAX, Math.max(0, Math.round(n)));
}

export function normalizeMenuTheme(raw: unknown): ScenarioVnMenuTheme | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const background = String(row.background || '').trim() || undefined;
  const blur = clampMenuBlur(row.blur);
  if (!background && blur === 0) return undefined;
  return {
    background,
    blur: blur > 0 ? blur : undefined,
  };
}

export type HandoutLayout = StandPose & {
  /** 모서리 둥글기 (px) 0–64 */
  radius?: number;
};

export const HANDOUT_RADIUS_MAX = 64;

export function clampHandoutRadius(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(HANDOUT_RADIUS_MAX, Math.max(0, Math.round(n)));
}
