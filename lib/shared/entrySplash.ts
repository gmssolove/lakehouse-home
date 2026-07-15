import type {
  EntrySplashConfig,
  EntrySplashLabel,
  EntrySplashLayout,
  EntrySplashTipItem,
} from '@/lib/types/character';

export const ENTRY_SPLASH_MIN_MS = 4500;
export const ENTRY_SPLASH_FADE_MS = 520;

const TIP_STORAGE_KEY = 'lh_entry_splash_tip';

function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function parseEntrySplashTips(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\s+|\s+$/g, ''))
    .filter((line) => line.length > 0);
}

function normalizeItems(raw?: EntrySplashConfig | null): EntrySplashTipItem[] {
  const out: EntrySplashTipItem[] = [];
  const seen = new Set<string>();

  /* items 키가 있으면(빈 배열 포함) tips 폴백 금지 — 삭제 후 되살아나는 버그 방지 */
  if (Array.isArray(raw?.items)) {
    for (const it of raw.items) {
      /* 수정 중 빈 문자열·중간 띄어쓰기 유지 (끝 trim만 저장 시 처리하지 않음) */
      const text = typeof it?.text === 'string' ? it.text : '';
      const id = typeof it?.id === 'string' && it.id ? it.id : `splash_${out.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        kind: it?.kind === 'tip' ? 'tip' : 'tmi',
        text,
      });
    }
    return out;
  }

  if (Array.isArray(raw?.tips)) {
    const legacyKind: EntrySplashLabel = raw?.label === 'tip' ? 'tip' : 'tmi';
    raw.tips.forEach((t, i) => {
      const text = typeof t === 'string' ? t.replace(/^\s+|\s+$/g, '') : '';
      if (!text) return;
      out.push({ id: `legacy_${i}`, kind: legacyKind, text });
    });
  }
  return out;
}

export function normalizeEntrySplash(raw?: EntrySplashConfig | null): {
  enabled: boolean;
  layout: EntrySplashLayout;
  items: EntrySplashTipItem[];
} {
  const layout: EntrySplashLayout = raw?.layout === 'corner' ? 'corner' : 'fullbleed';
  return {
    enabled: Boolean(raw?.enabled),
    layout,
    items: normalizeItems(raw),
  };
}

export function entrySplashLabelText(label: EntrySplashLabel): string {
  return label === 'tmi' ? 'TMI.' : 'TIP.';
}

/** 직전 항목과 겹치지 않게 랜덤 선택 */
export function pickEntrySplashTipItem(
  items: EntrySplashTipItem[],
  storageKey = TIP_STORAGE_KEY,
): EntrySplashTipItem | null {
  const usable = items.filter((it) => it.text.replace(/^\s+|\s+$/g, '').length > 0);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  let last = '';
  try {
    last = sessionStorage.getItem(storageKey) || '';
  } catch {
    /* ignore */
  }
  const pool = usable.filter((it) => it.id !== last && it.text !== last);
  const source = pool.length ? pool : usable;
  const chosen = source[Math.floor(Math.random() * source.length)];
  try {
    sessionStorage.setItem(storageKey, chosen.id);
  } catch {
    /* ignore */
  }
  return chosen;
}

/** @deprecated */
export function pickEntrySplashTip(tips: string[], storageKey = TIP_STORAGE_KEY): string {
  const items = tips.map((text, i) => ({ id: `t${i}`, kind: 'tmi' as const, text }));
  return pickEntrySplashTipItem(items, storageKey)?.text || '';
}

export function createEntrySplashItem(
  kind: EntrySplashLabel = 'tmi',
  text = '',
): EntrySplashTipItem {
  return {
    id: `es_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    text,
  };
}

export { shuffle };
