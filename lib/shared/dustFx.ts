import type { DustFxConfig } from '@/lib/types/character';

export type { DustFxConfig };

export const DEFAULT_DUST_INTENSITY = 45;

export function dustFxActive(fx?: DustFxConfig | null): boolean {
  return Boolean(fx?.enabled);
}

export function dustFxIntensity(fx?: DustFxConfig | null): number {
  const raw = fx?.intensity;
  const pct = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_DUST_INTENSITY;
  return Math.max(1, Math.min(100, pct));
}
