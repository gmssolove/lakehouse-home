import { Suspense } from 'react';
import { OcPageClient } from '@/components/oc/OcPageClient';

/** soft-nav 중 텍스트 폴백이 보이면 "다른 화면"처럼 느껴짐 — 배경만 */
const FALLBACK = <div className="lh-archive-route-fallback" aria-hidden />;

export default function OcPage() {
  return (
    <Suspense fallback={FALLBACK}>
      <OcPageClient />
    </Suspense>
  );
}
