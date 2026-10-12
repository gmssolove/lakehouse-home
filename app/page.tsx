import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';

/** 홈 셸은 정적에 가깝게 — 데이터는 클라이언트 + /api/site-section 캐시 */
export const revalidate = 120;

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="layout layout--home" style={{ minHeight: '100vh', background: '#0b0d0c' }} aria-hidden="true" />
      }
    >
      <HomePageClient />
    </Suspense>
  );
}
