'use client';

import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { DEFAULT_PAIRS, type PairItem } from '@/lib/types/character';

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

export function usePairData() {
  const [pairs, setPairs] = useState<PairItem[]>(DEFAULT_PAIRS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPairs(readLocal('oc_pairs', DEFAULT_PAIRS));
    setLoaded(true);

    return onValue(ref(db, 'lhdata/oc_pairs'), (snap) => {
      if (!snap.exists()) return;
      const val = snap.val() as PairItem[];
      localStorage.setItem('oc_pairs', JSON.stringify(val));
      setPairs(val);
    });
  }, []);

  const savePairs = useCallback(async (next: PairItem[]) => {
    localStorage.setItem('oc_pairs', JSON.stringify(next));
    setPairs(next);
    await set(ref(db, 'lhdata/oc_pairs'), next);
  }, []);

  return { pairs, loaded, savePairs };
}
