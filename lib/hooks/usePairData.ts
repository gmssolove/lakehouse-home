'use client';

import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';
import { hydratePairStories, pinPairStoriesForSave } from '@/lib/oc/storyEntries';
import { DEFAULT_PAIRS, type PairItem } from '@/lib/types/character';

function asPairList(val: unknown): PairItem[] {
  const raw = Array.isArray(val)
    ? val.filter((p): p is PairItem => !!p && typeof p === 'object' && 'id' in p)
    : val && typeof val === 'object'
      ? Object.values(val as Record<string, PairItem>).filter(
          (p): p is PairItem => !!p && typeof p === 'object' && typeof p.id === 'string',
        )
      : [];
  return raw.map(hydratePairStories);
}

function readLocalPairs(): PairItem[] {
  if (typeof window === 'undefined') return DEFAULT_PAIRS;
  try {
    return asPairList(JSON.parse(localStorage.getItem('oc_pairs') || 'null'));
  } catch {
    return DEFAULT_PAIRS;
  }
}

export function usePairData() {
  const [pairs, setPairs] = useState<PairItem[]>(DEFAULT_PAIRS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPairs(readLocalPairs());
    setLoaded(true);

    return onValue(ref(db, 'lhdata/oc_pairs'), (snap) => {
      if (!snap.exists()) return;
      const list = asPairList(snap.val());
      localStorage.setItem('oc_pairs', JSON.stringify(list));
      setPairs(list);
    });
  }, []);

  const savePairs = useCallback(async (next: PairItem[]) => {
    /* pin 먼저 — storyEntries:[] 를 hydrate가 legacy로 되살리지 않게 */
    const list = stripUndefinedDeep(
      next
        .filter((p): p is PairItem => !!p && typeof p === 'object' && typeof p.id === 'string')
        .map((p) => pinPairStoriesForSave(p)),
    ) as PairItem[];
    localStorage.setItem('oc_pairs', JSON.stringify(list));
    setPairs(list);
    await set(ref(db, 'lhdata/oc_pairs'), list);
    return list;
  }, []);

  return { pairs, loaded, savePairs };
}
