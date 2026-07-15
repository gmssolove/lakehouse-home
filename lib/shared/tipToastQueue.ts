import type { EntrySplashLabel } from '@/lib/types/character';
import type { SiteTipToastItem, SiteTipToastSettings } from '@/lib/types/site-content';

type QueueState = {
  order: string[];
  index: number;
};

function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function readQueue(key: string): QueueState | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueueState;
    if (!Array.isArray(parsed.order) || typeof parsed.index !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeQueue(key: string, state: QueueState) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function takeNextId(storageKey: string, ids: string[]): string {
  if (!ids.length) return '';

  let state = readQueue(storageKey);
  const sameSet =
    state &&
    state.order.length === ids.length &&
    ids.every((id) => state!.order.includes(id));

  if (!state || !sameSet || state.index >= state.order.length) {
    const last = state?.order[(state?.index ?? 1) - 1] ?? state?.order[state.order.length - 1] ?? '';
    let order = shuffle(ids);
    if (order.length > 1 && last && order[0] === last) {
      const swap = order.findIndex((id) => id !== last);
      if (swap > 0) [order[0], order[swap]] = [order[swap], order[0]];
    }
    state = { order, index: 0 };
  }

  const id = state.order[state.index] ?? '';
  writeQueue(storageKey, { ...state, index: state.index + 1 });
  return id;
}

/**
 * kind별로 덱을 섞어 소진.
 * 탭 진입 시 TIP 하나 + TMI 하나를 각각 꺼낼 때 사용.
 */
export function takeNextTipToastItem(
  storageKey: string,
  items: SiteTipToastItem[],
  kind: EntrySplashLabel,
): SiteTipToastItem | null {
  const pool = items.filter((it) => it.kind === kind && it.text.trim());
  if (!pool.length) return null;
  const id = takeNextId(`${storageKey}:${kind}`, pool.map((it) => it.id));
  return pool.find((it) => it.id === id) ?? pool[0] ?? null;
}

export function normalizeTipToastSettings(
  raw?: Partial<SiteTipToastSettings> & {
    label?: EntrySplashLabel;
    tips?: string[];
  } | null,
): SiteTipToastSettings {
  const items: SiteTipToastItem[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw?.items)) {
    for (const it of raw.items) {
      const text = typeof it?.text === 'string' ? it.text.replace(/^\s+|\s+$/g, '') : '';
      if (!text) continue;
      const id = typeof it?.id === 'string' && it.id ? it.id : `tip_${items.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        kind: it?.kind === 'tip' ? 'tip' : 'tmi',
        text,
      });
    }
  } else if (Array.isArray(raw?.tips)) {
    /* legacy: label + tips[] → items (items 키가 없을 때만) */
    const legacyKind: EntrySplashLabel = raw?.label === 'tip' ? 'tip' : 'tmi';
    raw.tips.forEach((t, i) => {
      const text = typeof t === 'string' ? t.replace(/^\s+|\s+$/g, '') : '';
      if (!text) return;
      items.push({ id: `legacy_${i}`, kind: legacyKind, text });
    });
  }

  return {
    enabled: Boolean(raw?.enabled),
    items,
  };
}
