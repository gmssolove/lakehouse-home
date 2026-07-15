'use client';

import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';
import { DEFAULT_PAIRS, type PairItem } from '@/lib/types/character';

function asPairList(val: unknown): PairItem[] {
  if (Array.isArray(val)) return val.filter((p): p is PairItem => !!p && typeof p === 'object' && 'id' in p);
  if (val && typeof val === 'object') {
    return Object.values(val as Record<string, PairItem>).filter(
      (p): p is PairItem => !!p && typeof p === 'object' && typeof p.id === 'string',
    );
  }
  return [];
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
    const list = stripUndefinedDeep(asPairList(next));
    localStorage.setItem('oc_pairs', JSON.stringify(list));
    setPairs(list);
    await set(ref(db, 'lhdata/oc_pairs'), list);
  }, []);

  return { pairs, loaded, savePairs };
}
