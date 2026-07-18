'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { onValue, ref, set } from 'firebase/database';
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

export function useFirebaseSection<T>(path: string, defaultValue: T) {
  const storageKey = path.replace(/\//g, '_');
  const [data, setData] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  useEffect(() => {
    const cached = readLocal(storageKey, defaultRef.current);
    setData((prev) => (sameSnapshot(prev, cached) ? prev : cached));
    setLoaded(true);

    let unsub: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      unsub = onValue(ref(db, path), (snap) => {
        if (!snap.exists()) return;
        const val = snap.val() as T;
        try {
          localStorage.setItem(storageKey, JSON.stringify(val));
        } catch {
          /* quota / private mode */
        }
        setData((prev) => (sameSnapshot(prev, val) ? prev : val));
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      unsub?.();
    };
  }, [path, storageKey]);

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
