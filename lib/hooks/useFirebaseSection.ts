'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { limitToLast, onValue, query, ref, set, type Query, type DatabaseReference } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { stripUndefinedDeep } from '@/lib/firebase/sanitize';

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function sameSnapshot<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}

function asArrayIfObject<T>(val: T): T {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val as object);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      return Object.keys(val as object)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (val as Record<string, unknown>)[k]) as T;
    }
  }
  return val;
}

export type UseFirebaseSectionOptions = {
  /** false면 Firebase 구독 없이 localStorage/default만 사용 */
  enabled?: boolean;
  /** RTDB limitToLast — 목록 섹션 용량 제한 */
  limitToLast?: number;
  /** Firebase 응답 대기 제한(ms). 초과 시 localStorage/default로 loaded 처리 */
  timeoutMs?: number;
  /**
   * 엣지 캐시 API로 선하이드레이트 (예: /api/site-section/diary).
   * onValue 실시간 구독 전에 부분 데이터를 빠르게 채움.
   */
  cacheUrl?: string | null;
};

export function useFirebaseSection<T>(
  path: string,
  defaultValue: T,
  options: UseFirebaseSectionOptions = {},
) {
  const {
    enabled = true,
    limitToLast: limitN,
    timeoutMs = 5000,
    cacheUrl = null,
  } = options;
  const storageKey = path.replace(/\//g, '_');
  const [data, setData] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  useEffect(() => {
    const cached = readLocal(storageKey, defaultRef.current);
    setData((prev) => (sameSnapshot(prev, cached) ? prev : cached));
    setLoaded(true);

    if (!enabled) {
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let timeoutId = 0;

    const applyVal = (raw: T) => {
      if (cancelled) return;
      const val = asArrayIfObject(raw);
      try {
        localStorage.setItem(storageKey, JSON.stringify(val));
      } catch {
        /* quota / private mode */
      }
      setData((prev) => (sameSnapshot(prev, val) ? prev : val));
      setLoaded(true);
    };

    const hydrateFromCache = async () => {
      if (!cacheUrl) return;
      try {
        const res = await fetch(cacheUrl, {
          signal: AbortSignal.timeout(Math.min(timeoutMs, 4000)),
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { data?: T };
        if (json?.data !== undefined && json.data !== null) {
          applyVal(json.data);
        }
      } catch {
        /* cache miss / timeout — onValue 또는 local fallback */
      }
    };

    const timer = window.setTimeout(() => {
      void hydrateFromCache();

      const base: DatabaseReference = ref(db, path);
      const source: Query | DatabaseReference =
        limitN != null && limitN > 0 ? query(base, limitToLast(limitN)) : base;

      timeoutId = window.setTimeout(() => {
        /* 타임아웃: localStorage/default 유지, UI 차단 해제. 구독은 유지해 늦게 오면 반영 */
        if (!cancelled) setLoaded(true);
      }, timeoutMs);

      unsub = onValue(
        source,
        (snap) => {
          window.clearTimeout(timeoutId);
          if (!snap.exists()) {
            setLoaded(true);
            return;
          }
          applyVal(snap.val() as T);
        },
        () => {
          window.clearTimeout(timeoutId);
          setLoaded(true);
        },
      );
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(timeoutId);
      unsub?.();
    };
  }, [path, storageKey, enabled, limitN, timeoutMs, cacheUrl]);

  const save = useCallback(
    async (next: T) => {
      const clean = stripUndefinedDeep(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(clean));
      } catch {
        /* quota / private mode — Firebase 저장은 계속 */
      }
      try {
        await set(ref(db, path), clean);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/PERMISSION_DENIED/i.test(msg)) {
          throw new Error('저장 권한이 없습니다. 로그인 상태를 확인해 주세요.');
        }
        if (/too large|payload|SIZE_LIMIT|max.*size/i.test(msg) || msg.includes('413')) {
          throw new Error(
            '데이터가 너무 큽니다. HTML 로그를 나누거나 용량을 줄인 뒤 다시 저장해 주세요.',
          );
        }
        throw err instanceof Error ? err : new Error(msg || '저장에 실패했습니다.');
      }
      setData(clean);
    },
    [path, storageKey],
  );

  return { data, loaded, save, setData };
}
