'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  /* SSR·첫 클라 페인트 동일 — localStorage는 effect에서만 */
  const [pairs, setPairs] = useState<PairItem[]>(DEFAULT_PAIRS);
  const [loaded, setLoaded] = useState(false);
  /** 로컬 save 직후 늦은 RTDB 스냅이 스탠딩 위치를 되돌리지 않게 */
  const writeEpochRef = useRef(0);
  const appliedEpochRef = useRef(0);

  /* 페인트 전에 로컬 채움 — 빈 목록→채움 한 프레임이 메인→Pair 버벅임 */
  useLayoutEffect(() => {
    const local = readLocalPairs();
    if (local.length) setPairs(local);
    setLoaded(true);
  }, []);

  useEffect(() => {
    return onValue(ref(db, 'lhdata/oc_pairs'), (snap) => {
      if (!snap.exists()) return;
      /* 로컬 save 진행 중(write > applied)엔 늦은/중간 스냅 무시 */
      if (writeEpochRef.current > appliedEpochRef.current) return;
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
    writeEpochRef.current += 1;
    const epoch = writeEpochRef.current;
    localStorage.setItem('oc_pairs', JSON.stringify(list));
    setPairs(list);
    try {
      await set(ref(db, 'lhdata/oc_pairs'), list);
    } finally {
      if (writeEpochRef.current === epoch) {
        appliedEpochRef.current = epoch;
      }
    }
    return list;
  }, []);

  return { pairs, loaded, savePairs };
}
