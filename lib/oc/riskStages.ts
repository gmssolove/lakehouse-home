import type { CSSProperties } from 'react';
import { normalizeHex } from '@/lib/oc/characterTheme';
import type { RiskPresetId, RiskRankId, RiskStage } from '@/lib/types/character';

/** 기존 고정 빨강 톤과 맞춘 기본 위험도 색 (5단계) */
export const DEFAULT_RISK_COLOR = '#e05555';

export type RiskPreset = {
  id: RiskPresetId;
  label: string;
  notice: string;
  color: string;
  /** true면 1~7 등급 체계 밖 (미상) */
  unranked?: boolean;
};

/** 1→초록 … 7→검붉은 톤 (등급 체계) */
export const RISK_PRESETS: RiskPreset[] = [
  { id: 1, label: '없음', notice: '자유 접촉 가능', color: '#4caf7a' },
  { id: 2, label: '낮음', notice: '통상 주의', color: '#b8c24a' },
  { id: 3, label: '보통', notice: '주의 요망', color: '#e0b83a' },
  { id: 4, label: '높음', notice: '접근 자제', color: '#e0893a' },
  { id: 5, label: '매우 높음', notice: '접촉 주의', color: '#e05555' },
  { id: 6, label: '위험', notice: '접근 금지', color: '#b02030' },
  { id: 7, label: '봉인급', notice: '격리 대상', color: '#5a0c14' },
];

/**
 * 미상 — 등급 체계 밖 독립 분류.
 * "가장 위험"이 아니라 "판단 불가". 초록→빨강 그라데이션에 놓지 않음.
 */
export const RISK_UNKNOWN: RiskPreset = {
  id: 'unknown',
  label: '미상',
  notice: '기록 없음, 접촉 이력 전무',
  color: '#a48ed6',
  unranked: true,
};

/** 드롭다운용: 등급 프리셋 + (구분선 뒤) 미상 */
export const RISK_PRESETS_WITH_UNKNOWN: RiskPreset[] = [...RISK_PRESETS, RISK_UNKNOWN];

/** 미상 배지 고정 팔레트 (그라데이션과 무관) */
export const RISK_UNKNOWN_COLORS = {
  bg: '#1b1626',
  border: '#4a3a6b',
  fg: '#a48ed6',
} as const;

function newRiskId() {
  return `risk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const v = parseInt(n.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function isRiskRankId(id: RiskPresetId | undefined): id is RiskRankId {
  return typeof id === 'number' && id >= 1 && id <= 7;
}

export function isUnknownRisk(
  stage: Pick<RiskStage, 'preset' | 'label'> | RiskPresetId | undefined,
): boolean {
  if (stage === 'unknown') return true;
  if (!stage || typeof stage === 'number') return false;
  if (stage.preset === 'unknown') return true;
  return stage.label?.trim() === RISK_UNKNOWN.label;
}

export function getRiskPreset(id: RiskPresetId | undefined): RiskPreset | undefined {
  if (id === 'unknown') return RISK_UNKNOWN;
  if (!id) return undefined;
  return RISK_PRESETS.find((p) => p.id === id);
}

export function createRiskStageFromPreset(presetId: RiskPresetId): RiskStage {
  const p = getRiskPreset(presetId) ?? RISK_PRESETS[4];
  return {
    id: newRiskId(),
    preset: p.id,
    label: p.label,
    notice: p.notice,
    color: p.color,
  };
}

export function createEmptyRiskStage(color = DEFAULT_RISK_COLOR): RiskStage {
  return { id: newRiskId(), label: '', notice: '', color };
}

/**
 * 등급 순서값. 미상·커스텀은 null (7단계 정렬/필터에 영향 없음).
 */
export function riskRankOrder(stage: Pick<RiskStage, 'preset'>): RiskRankId | null {
  return isRiskRankId(stage.preset) ? stage.preset : null;
}

/** 등급만 비교. 미상끼리/미상vs등급은 0(순서 동등·별도 처리용) */
export function compareRiskRanks(a: Pick<RiskStage, 'preset'>, b: Pick<RiskStage, 'preset'>): number {
  const ra = riskRankOrder(a);
  const rb = riskRankOrder(b);
  if (ra === null || rb === null) return 0;
  return ra - rb;
}

/** 레거시 텍스트 → 프리셋 추론 */
function matchPresetFromText(text: string): RiskPreset | undefined {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return undefined;
  if (t === RISK_UNKNOWN.label || t.includes(RISK_UNKNOWN.notice) || /^미상/.test(t)) {
    return RISK_UNKNOWN;
  }
  for (const p of RISK_PRESETS) {
    if (t === p.label || t === p.notice) return p;
    if (t.includes(p.notice) || t.includes(p.label)) return p;
  }
  if (/접촉\s*주의/.test(t)) return RISK_PRESETS[4];
  return undefined;
}

function normalizeStage(s: RiskStage): RiskStage {
  let preset: RiskPresetId | undefined;
  if (s.preset === 'unknown') preset = 'unknown';
  else if (isRiskRankId(s.preset)) preset = s.preset;
  else if (s.label?.trim() === RISK_UNKNOWN.label) preset = 'unknown';

  const fallbackColor =
    preset === 'unknown' ? RISK_UNKNOWN.color : DEFAULT_RISK_COLOR;

  return {
    id: s.id || newRiskId(),
    preset,
    label: s.label ?? '',
    notice: s.notice ?? '',
    color: normalizeHex(s.color) || fallbackColor,
  };
}

/** riskStages 우선, 없으면 레거시 riskLevel 한 단계로 마이그레이션 */
export function resolveRiskStages(source: {
  riskStages?: RiskStage[];
  riskLevel?: string;
}): RiskStage[] {
  if (source.riskStages && source.riskStages.length > 0) {
    return source.riskStages.map(normalizeStage);
  }
  const legacy = source.riskLevel?.trim();
  if (legacy) {
    const matched = matchPresetFromText(legacy);
    if (matched) return [createRiskStageFromPreset(matched.id)];
    return [{ id: newRiskId(), label: legacy, notice: '', color: DEFAULT_RISK_COLOR }];
  }
  return [];
}

/** 표시용 — 라벨 또는 주의 문구가 있는 단계 */
export function visibleRiskStages(source: {
  riskStages?: RiskStage[];
  riskLevel?: string;
}): RiskStage[] {
  return resolveRiskStages(source).filter((s) => s.label.trim() || s.notice.trim());
}

/** 배지 본문 텍스트 */
export function riskBadgeText(stage: RiskStage): string {
  const label = stage.label.trim();
  const notice = stage.notice.trim();
  if (label && notice) return `${label} · ${notice}`;
  return label || notice;
}

/** 저장 시: 빈 단계 제거 + riskLevel 동기화(하위 호환) */
export function finalizeRiskStages(stages: RiskStage[] | undefined): {
  riskStages?: RiskStage[];
  riskLevel?: string;
} {
  const cleaned = (stages ?? [])
    .map(normalizeStage)
    .filter((s) => s.label.trim() || s.notice.trim());
  if (!cleaned.length) {
    return { riskStages: undefined, riskLevel: undefined };
  }
  return {
    riskStages: cleaned,
    riskLevel: cleaned.map(riskBadgeText).join(' · '),
  };
}

/** 단일 HEX에서 유도 (등급 배지) — 어두운 색은 텍스트만 밝혀 가독성 확보 */
export function riskBadgeStyle(color?: string): CSSProperties {
  const hex = normalizeHex(color) || DEFAULT_RISK_COLOR;
  const rgb = hexToRgb(hex) || { r: 224, g: 85, b: 85 };
  const { r, g, b } = rgb;
  /* relative luminance (sRGB 근사) */
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let fr = r;
  let fg = g;
  let fb = b;
  if (lum < 150) {
    /* 어두운 위험색(6·7단계 등) — 테두리/배경은 원색 유지, 글자만 밝게 */
    const lift = Math.min(0.72, (150 - lum) / 150 + 0.28);
    fr = Math.min(255, Math.round(r + (255 - r) * lift));
    fg = Math.min(255, Math.round(g + (210 - g) * lift * 0.75));
    fb = Math.min(255, Math.round(b + (210 - b) * lift * 0.7));
  }
  return {
    ['--lh-risk-fg' as string]: `rgba(${fr}, ${fg}, ${fb}, 0.96)`,
    ['--lh-risk-border' as string]: `rgba(${r}, ${g}, ${b}, 0.5)`,
    ['--lh-risk-bg' as string]: `rgba(${Math.round(r * 0.35)}, ${Math.round(g * 0.12)}, ${Math.round(b * 0.14)}, 0.32)`,
    ['--lh-risk-glow' as string]: `rgba(${r}, ${g}, ${b}, 0.4)`,
  };
}

/** 단계별 배지 스타일 — 미상은 고정 보라 팔레트 */
export function riskBadgeStyleForStage(stage: Pick<RiskStage, 'preset' | 'label' | 'color'>): CSSProperties {
  if (isUnknownRisk(stage)) {
    const custom = normalizeHex(stage.color);
    // 기본 미상색이면 지정 팔레트, 사용자가 바꾼 경우에만 HEX 유도
    if (!custom || custom === RISK_UNKNOWN.color) {
      return {
        ['--lh-risk-fg' as string]: RISK_UNKNOWN_COLORS.fg,
        ['--lh-risk-border' as string]: RISK_UNKNOWN_COLORS.border,
        ['--lh-risk-bg' as string]: RISK_UNKNOWN_COLORS.bg,
        ['--lh-risk-glow' as string]: 'rgba(164, 142, 214, 0.35)',
      };
    }
    return riskBadgeStyle(custom);
  }
  return riskBadgeStyle(stage.color);
}
