'use client';

import { useEffect } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { applyR2UploadConfig } from '@/lib/r2/config';
import type { R2UploadConfig } from '@/lib/r2/config';

/** Vite OC와 동일하게 Firebase site/r2Upload → localStorage 동기화 */
export function useR2UploadConfig() {
  useEffect(() => {
    return onValue(ref(db, 'site/r2Upload'), (snap) => {
      if (!snap.exists()) return;
      applyR2UploadConfig(snap.val() as R2UploadConfig);
    });
  }, []);
}
