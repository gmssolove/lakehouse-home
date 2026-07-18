/**
 * 페어 소개 전용 — 퍼스널컬러 이름 text-shadow 글로우.
 * OC 프로필과 공유하지 말 것.
 */

export type PairPersonalNameTextStyle = {
  color?: string;
  textShadow?: string;
};

function parseHex(raw: string): { r: number; g: number; b: number } | null {
  const h = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function toCssHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** 다크 배경에서 너무 어두운 글로우는 보이지 않으므로 그림자용으로만 밝힘 */
export function resolvePairGlowShadowColor(glowHex: string): string {
  const rgb = parseHex(glowHex);
  if (!rgb) return glowHex.trim();
  const L = relativeLuminance(rgb.r, rgb.g, rgb.b);
  if (L >= 0.14) {
    const t = glowHex.trim();
    return t.startsWith('#') ? t : `#${t.replace(/^#/, '')}`;
  }
  const t = L < 0.05 ? 0.62 : 0.48;
  return toCssHex(
    Math.round(rgb.r + (255 - rgb.r) * t),
    Math.round(rgb.g + (255 - rgb.g) * t),
    Math.round(rgb.b + (255 - rgb.b) * t),
  );
}

/** 키워드 칩 등 — 배경이 퍼스널 원색일 때 글자/테두리 대비용 */
export function isDarkPairPersonalColor(personalHex: string): boolean {
  const rgb = parseHex(personalHex);
  if (!rgb) return false;
  return relativeLuminance(rgb.r, rgb.g, rgb.b) < 0.18;
}

/**
 * 다크 UI 위 텍스트·칩용 액센트.
 * 순정 검정 등은 그대로 쓰면 안 보이므로 최소한의 밝기만 확보.
 * 스와치(원색 표시)에는 쓰지 말 것.
 */
export function resolvePairUiAccentColor(personalHex: string): string {
  const rgb = parseHex(personalHex);
  if (!rgb) return personalHex.trim();
  const L = relativeLuminance(rgb.r, rgb.g, rgb.b);
  /* 이미 밝으면 원색 유지 */
  if (L >= 0.18) {
    const t = personalHex.trim();
    return t.startsWith('#') ? t : `#${t.replace(/^#/, '')}`;
  }
  /* 검정~매우 어두움: 채도는 남기고 밝기만 올림 */
  const t = L < 0.04 ? 0.55 : L < 0.1 ? 0.42 : 0.28;
  return toCssHex(
    Math.round(rgb.r + (255 - rgb.r) * t),
    Math.round(rgb.g + (255 - rgb.g) * t),
    Math.round(rgb.b + (255 - rgb.b) * t),
  );
}

/**
 * @param personalColor 텍스트 색 (캐릭터 퍼스널컬러)
 * @param glowColor 글로우 색 (비면 personalColor)
 * @param enabled 글로우 on/off
 */
export function pairPersonalNameTextStyle(
  personalColor: string | undefined,
  glowColor: string | undefined,
  enabled: boolean | undefined,
): PairPersonalNameTextStyle {
  const color = personalColor?.trim() || undefined;
  if (!color) return {};
  if (!enabled) return { color };

  const rawGlow = glowColor?.trim() || color;
  const shadow = resolvePairGlowShadowColor(rawGlow);
  return {
    color,
    textShadow: `0 0 4px ${shadow}, 0 0 10px ${shadow}, 0 0 18px ${shadow}`,
  };
}
