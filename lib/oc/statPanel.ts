import type { OcStatPanel, OcStatRadarAxis } from '@/lib/types/character';

/** 기본 레이더 축 — 화면에는 축 코드(STR 등)만 표시 */
export const DEFAULT_OC_STAT_RADAR: OcStatRadarAxis[] = [
  { axis: 'STR', value: 50 },
  { axis: 'AGI', value: 50 },
  { axis: 'VIT', value: 50 },
  { axis: 'INT', value: 50 },
  { axis: 'DEX', value: 50 },
  { axis: 'LUK', value: 50 },
];

export const OC_STAT_RADAR_HINTS: Record<string, string> = {
  STR: 'Strength, 힘',
  AGI: 'Agility, 민첩',
  VIT: 'Vitality, 생명력',
  INT: 'Intelligence, 지능',
  DEX: 'Dexterity, 손재주/정교함',
  LUK: 'Luck, 행운',
};

/** 레이더 라벨용 — "STR (Strength, 힘)" → "STR" */
export function radarAxisCode(axis: string): string {
  const raw = (axis || '').trim();
  if (!raw) return '';
  const token = raw.split(/[\s(/（\[]/)[0] || raw;
  return token.replace(/[^A-Za-z]/g, '').toUpperCase() || raw.slice(0, 3).toUpperCase();
}

export function hydrateStatPanel(panel?: OcStatPanel | null): OcStatPanel {
  const radar = panel?.radar?.length ? panel.radar : DEFAULT_OC_STAT_RADAR.map((a) => ({ ...a }));
  return {
    radar,
    bars: panel?.bars ? [...panel.bars] : [],
    color: panel?.color,
    bgColor: panel?.bgColor,
    glow: panel?.glow,
  };
}

export function resolveStatRadar(panel?: OcStatPanel | null): OcStatRadarAxis[] {
  const rows = panel?.radar?.filter((a) => a.axis?.trim()) ?? [];
  if (rows.length) return rows;
  return DEFAULT_OC_STAT_RADAR;
}
