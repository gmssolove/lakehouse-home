import type { OcCharacter } from '@/lib/types/character';

export const DEFAULT_CHARACTER_THEME = {
  accentColor: '#d7a982',
  accentSoft: '#f0cfad',
  panelColor: '#101210',
  personalColor: '#d7a982',
  borderColor: '#d7a982',
  vnColor: '#f0cfad',
  menuColor: '#0c0e0d',
};

export type ResolvedCharacterTheme = {
  personalColor: string;
  accentColor: string;
  accentSoft: string;
  panelColor: string;
  borderColor: string;
  vnColor: string;
  menuColor: string;
};

const THEME_FIELD_KEYS = [
  'personalColor',
  'accentColor',
  'accentSoft',
  'panelColor',
  'borderColor',
  'vnColor',
  'menuColor',
] as const;

type ThemeFieldKey = (typeof THEME_FIELD_KEYS)[number];

export function normalizeHex(input?: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  let hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const n = parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHex(a: string, b: string, weight: number): string {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  if (!c1 || !c2) return a;
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(
    c1.r + (c2.r - c1.r) * w,
    c1.g + (c2.g - c1.g) * w,
    c1.b + (c2.b - c1.b) * w,
  );
}

function lighten(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

function darken(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

export function deriveAccentFromPersonalColor(
  personalColor: string,
): Pick<ResolvedCharacterTheme, 'personalColor' | 'accentColor' | 'accentSoft' | 'borderColor' | 'vnColor'> {
  const base = normalizeHex(personalColor) || DEFAULT_CHARACTER_THEME.personalColor;
  const soft = lighten(base, 0.34);
  return {
    personalColor: base,
    accentColor: base,
    accentSoft: soft,
    borderColor: base,
    vnColor: lighten(base, 0.26),
  };
}

export function deriveThemeFromPersonalColor(personalColor: string): ResolvedCharacterTheme {
  const accent = deriveAccentFromPersonalColor(personalColor);
  const base = accent.personalColor;
  return {
    ...accent,
    panelColor: mixHex('#080a09', darken(base, 0.5), 0.78),
    menuColor: mixHex('#0c0e0d', darken(base, 0.45), 0.85),
  };
}

export function hasCustomTheme(character: OcCharacter): boolean {
  return THEME_FIELD_KEYS.some((key) => normalizeHex(character[key]));
}

export function characterHasBgmTheme(character: OcCharacter): boolean {
  const theme = character.theme;
  return !!(theme?.fileData?.trim() || theme?.youtubeId?.trim());
}

export function resolveCharacterTheme(character: OcCharacter): ResolvedCharacterTheme {
  const autoBackground = character.themeAutoBackground !== false;
  const personal = normalizeHex(character.personalColor);
  if (personal) {
    if (!autoBackground) {
      return {
        personalColor: personal,
        accentColor: normalizeHex(character.accentColor) || DEFAULT_CHARACTER_THEME.accentColor,
        accentSoft: normalizeHex(character.accentSoft) || DEFAULT_CHARACTER_THEME.accentSoft,
        panelColor: normalizeHex(character.panelColor) || DEFAULT_CHARACTER_THEME.panelColor,
        borderColor: normalizeHex(character.borderColor) || DEFAULT_CHARACTER_THEME.borderColor,
        vnColor: normalizeHex(character.vnColor) || DEFAULT_CHARACTER_THEME.vnColor,
        menuColor: normalizeHex(character.menuColor) || DEFAULT_CHARACTER_THEME.menuColor,
      };
    }

    const derived = deriveThemeFromPersonalColor(personal);
    return {
      personalColor: personal,
      accentColor: normalizeHex(character.accentColor) || derived.accentColor,
      accentSoft: normalizeHex(character.accentSoft) || derived.accentSoft,
      panelColor: normalizeHex(character.panelColor) || derived.panelColor,
      borderColor: normalizeHex(character.borderColor) || derived.borderColor,
      vnColor: normalizeHex(character.vnColor) || derived.vnColor,
      menuColor: normalizeHex(character.menuColor) || derived.menuColor,
    };
  }

  const accent = normalizeHex(character.accentColor);
  if (!accent && !normalizeHex(character.accentSoft) && !normalizeHex(character.panelColor)) {
    return { ...DEFAULT_CHARACTER_THEME };
  }

  const base = accent || DEFAULT_CHARACTER_THEME.accentColor;
  const derived = deriveThemeFromPersonalColor(base);
  return {
    personalColor: base,
    accentColor: base,
    accentSoft: normalizeHex(character.accentSoft) || derived.accentSoft,
    panelColor: normalizeHex(character.panelColor) || derived.panelColor,
    borderColor: normalizeHex(character.borderColor) || derived.borderColor,
    vnColor: normalizeHex(character.vnColor) || derived.vnColor,
    menuColor: normalizeHex(character.menuColor) || derived.menuColor,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(16, 18, 16, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** 저장 시 빈 테마 필드를 객체에서 제거 (Firebase·로컬 초기화용) */
export function stripEmptyThemeFields(character: OcCharacter): OcCharacter {
  const next = { ...character };
  for (const key of THEME_FIELD_KEYS) {
    if (!normalizeHex(next[key as ThemeFieldKey])) {
      delete next[key as ThemeFieldKey];
    }
  }
  if (next.themeAutoBackground !== false) {
    delete next.themeAutoBackground;
  }
  return next;
}

export function normalizePersonalVignette(raw?: number | null): number {
  if (raw == null || !Number.isFinite(raw)) return 16;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function applyCharacterTheme(root: HTMLElement, character: OcCharacter): ResolvedCharacterTheme {
  const theme = resolveCharacterTheme(character);
  const gold = DEFAULT_CHARACTER_THEME.accentColor;
  const goldSoft = DEFAULT_CHARACTER_THEME.accentSoft;
  const panelFixed = DEFAULT_CHARACTER_THEME.panelColor;
  const menuFixed = DEFAULT_CHARACTER_THEME.menuColor;
  const vignette = normalizePersonalVignette(character.personalVignette);

  // 캐릭터 퍼스널 — 칩·스탯·스와치·비네트
  root.style.setProperty('--oc-personal', theme.personalColor);
  root.style.setProperty('--oc-char', theme.personalColor);
  root.style.setProperty('--oc-char-soft', lighten(theme.personalColor, 0.34));
  root.style.setProperty('--oc-vignette', `${vignette}%`);

  // 사이트 골드 정체성 — 별·PROFILE/ATTRIBUTE 등 (캐릭터색으로 덮지 않음)
  root.style.setProperty('--oc-accent', gold);
  root.style.setProperty('--oc-accent-soft', goldSoft);
  root.style.setProperty('--oc-border', hexToRgba(gold, 0.38));
  root.style.setProperty('--oc-line', hexToRgba(gold, 0.14));

  // 배경·패널은 거의 고정 (퍼스널로 물들이지 않음)
  root.style.setProperty('--oc-panel', hexToRgba(panelFixed, 0.76));
  root.style.setProperty('--oc-panel-solid', panelFixed);
  root.style.setProperty('--oc-menu-panel', hexToRgba(menuFixed, 0.96));

  // VN은 퍼스널을 약하게 반영 (직접 지정 시 우선)
  const vn = normalizeHex(character.vnColor) || lighten(theme.personalColor, 0.26);
  root.style.setProperty('--oc-vn', vn);
  root.style.setProperty('--oc-vn-border', hexToRgba(vn, 0.42));
  root.style.setProperty('--oc-vn-soft', hexToRgba(vn, 0.12));

  // lake 토큰은 사이트 골드 유지
  root.style.setProperty('--lake-copper', gold);
  root.style.setProperty('--lake-copper-soft', goldSoft);
  root.style.setProperty('--lake-line', hexToRgba(gold, 0.42));
  root.style.setProperty('--lake-line-soft', hexToRgba(gold, 0.18));
  return theme;
}

export function clearCharacterTheme(root: HTMLElement) {
  for (const key of [
    '--oc-accent',
    '--oc-accent-soft',
    '--oc-personal',
    '--oc-char',
    '--oc-char-soft',
    '--oc-vignette',
    '--oc-panel',
    '--oc-panel-solid',
    '--oc-border',
    '--oc-line',
    '--oc-vn',
    '--oc-vn-border',
    '--oc-vn-soft',
    '--oc-menu-panel',
    '--lake-copper',
    '--lake-copper-soft',
    '--lake-line',
    '--lake-line-soft',
  ]) {
    root.style.removeProperty(key);
  }
}
