import { newId } from '@/lib/types/site-content';
import type {
  OcFloatingQuote,
  PairFloatingQuote,
  PairItem,
  PairQuoteSlot,
} from '@/lib/types/character';

export const FLOATING_QUOTE_DEFAULT = { x: 50, y: 72, scale: 1 } as const;
export const PAIR_QUOTE_SLOTS: { id: PairQuoteSlot; label: string }[] = [
  { id: 'face', label: '얼굴' },
  { id: 'chest', label: '가슴' },
  { id: 'waist', label: '허리' },
];

export function clampQuotePos(n: number): number {
  return Math.round(Math.min(97, Math.max(3, n)) * 10) / 10;
}

export function clampQuoteScale(n: number): number {
  return Math.round(Math.min(2.2, Math.max(0.55, n)) * 100) / 100;
}

export function clampPairQuoteScale(n: number): number {
  return Math.round(Math.min(1.65, Math.max(0.72, n)) * 100) / 100;
}

export function normalizeFloatingQuote(
  raw: Partial<OcFloatingQuote> | null | undefined,
  fallbackText = '',
): OcFloatingQuote | null {
  const text = String(raw?.text ?? fallbackText).trim();
  if (!text) return null;
  const align = raw?.align === 'left' || raw?.align === 'right' ? raw.align : 'center';
  return {
    id: String(raw?.id || newId()),
    text,
    x: clampQuotePos(Number(raw?.x ?? FLOATING_QUOTE_DEFAULT.x) || FLOATING_QUOTE_DEFAULT.x),
    y: clampQuotePos(Number(raw?.y ?? FLOATING_QUOTE_DEFAULT.y) || FLOATING_QUOTE_DEFAULT.y),
    scale: clampQuoteScale(Number(raw?.scale ?? FLOATING_QUOTE_DEFAULT.scale) || FLOATING_QUOTE_DEFAULT.scale),
    align,
  };
}

export function normalizeFloatingQuotes(
  list: Partial<OcFloatingQuote>[] | null | undefined,
): OcFloatingQuote[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((q) => normalizeFloatingQuote(q))
    .filter((q): q is OcFloatingQuote => Boolean(q));
}

export function emptyFloatingQuote(text = ''): OcFloatingQuote {
  return {
    id: newId(),
    text,
    x: FLOATING_QUOTE_DEFAULT.x,
    y: FLOATING_QUOTE_DEFAULT.y,
    scale: FLOATING_QUOTE_DEFAULT.scale,
    align: 'center',
  };
}

function normalizeSlot(raw: unknown): PairQuoteSlot {
  if (raw === 'face' || raw === 'waist') return raw;
  return 'chest';
}

/** 구데이터 x/y → 대략적인 슬롯 추정 */
function slotFromLegacyY(y?: number): PairQuoteSlot {
  if (typeof y !== 'number') return 'chest';
  if (y < 32) return 'face';
  if (y > 55) return 'waist';
  return 'chest';
}

export function normalizePairFloatingQuote(
  raw: (Partial<PairFloatingQuote> & { x?: number; y?: number }) | null | undefined,
  fallbackSide: 'A' | 'B' = 'A',
): PairFloatingQuote | null {
  const text = String(raw?.text ?? '').trim();
  if (!text) return null;
  const side = raw?.side === 'B' ? 'B' : raw?.side === 'A' ? 'A' : fallbackSide;
  const slot = raw?.slot ? normalizeSlot(raw.slot) : slotFromLegacyY(raw?.y);
  return {
    id: String(raw?.id || newId()),
    text,
    side,
    slot,
    scale: clampPairQuoteScale(Number(raw?.scale ?? 1) || 1),
  };
}

export function normalizePairFloatingQuotes(
  list: Partial<PairFloatingQuote>[] | null | undefined,
  max = 2,
): PairFloatingQuote[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((q) => normalizePairFloatingQuote(q))
    .filter((q): q is PairFloatingQuote => Boolean(q))
    .slice(0, Math.max(0, max));
}

export function hydratePairFloatingQuotes(
  pair: Pick<PairItem, 'floatingQuotes' | 'floatingQuotesBySide'>,
): PairFloatingQuote[] {
  const next = normalizePairFloatingQuotes(pair.floatingQuotes, 2);
  if (next.length) return next;

  const a = normalizeFloatingQuotes(pair.floatingQuotesBySide?.A);
  const b = normalizeFloatingQuotes(pair.floatingQuotesBySide?.B);
  if (!a.length && !b.length) return [];

  const out: PairFloatingQuote[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n && out.length < 2; i++) {
    if (a[i] && out.length < 2) {
      out.push({
        id: a[i].id,
        text: a[i].text,
        side: 'A',
        slot: slotFromLegacyY(a[i].y),
        scale: clampPairQuoteScale(a[i].scale ?? 1),
      });
    }
    if (b[i] && out.length < 2) {
      out.push({
        id: b[i].id,
        text: b[i].text,
        side: 'B',
        slot: slotFromLegacyY(b[i].y),
        scale: clampPairQuoteScale(b[i].scale ?? 1),
      });
    }
  }
  return out;
}

export function emptyPairFloatingQuote(side: 'A' | 'B' = 'A', text = ''): PairFloatingQuote {
  return {
    id: newId(),
    text,
    side,
    slot: 'chest',
    scale: 1,
  };
}
