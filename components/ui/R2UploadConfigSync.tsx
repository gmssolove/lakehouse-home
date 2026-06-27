'use client';

import { useR2UploadConfig } from '@/lib/hooks/useR2UploadConfig';

export function R2UploadConfigSync() {
  useR2UploadConfig();
  return null;
}
